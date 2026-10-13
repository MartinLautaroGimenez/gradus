"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearAttempts, isRateLimited, registerFailedAttempt } from "@/lib/auth/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Ingresá tu email o DNI"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export type LoginState = { error?: string; identifier?: string };

const INVALID_CREDENTIALS = "Email/DNI o contraseña incorrectos";

// Si el usuario no existe se compara igual contra un hash cualquiera, para que
// el tiempo de respuesta no revele qué emails o DNI están registrados.
const dummyHash = hashPassword("gradus-dummy-password");

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, identifier: String(formData.get("identifier") ?? "") };
  }

  const identifier = parsed.data.identifier.toLowerCase();
  if (isRateLimited(identifier)) {
    return { error: "Demasiados intentos. Esperá unos minutos y probá de nuevo.", identifier };
  }

  // Se acepta email o DNI (sin puntos).
  const user = await db.user.findFirst({
    where: identifier.includes("@") ? { email: identifier } : { dni: identifier.replace(/\./g, "") },
  });

  const passwordOk = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await dummyHash));
  if (!user || !user.active || !passwordOk) {
    registerFailedAttempt(identifier);
    return { error: INVALID_CREDENTIALS, identifier };
  }

  clearAttempts(identifier);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  redirect("/inicio");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

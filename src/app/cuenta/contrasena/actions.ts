"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PASSWORD_MAX_LENGTH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/auth/password-policy";
import { LIMITS, hit, minutesLeft } from "@/lib/auth/rate-limit";
import { destroyOtherSessions, getCurrentUser } from "@/lib/auth/session";
import { type FormState, fromZodError } from "@/lib/validation";

const schema = z
  .object({
    current: z.string().min(1, "Ingresá tu contraseña actual").max(200),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
      .refine((value) => Buffer.byteLength(value) <= PASSWORD_MAX_LENGTH, "Demasiado larga"),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const { current, password } = parsed.data;

  const limitKey = `contrasena:${user.id}`;
  if (!hit(limitKey, LIMITS.passwordChange)) {
    return { error: `Demasiados intentos. Esperá ${minutesLeft(limitKey)} min y probá de nuevo.` };
  }

  const problem = passwordProblem(password, user);
  if (problem) return { error: problem, fieldErrors: { password: [problem] } };

  const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(current, stored.passwordHash))) {
    await audit({ actorId: user.id, action: "contrasena.fallida", entity: "User", entityId: user.id, summary: "Contraseña actual incorrecta al intentar cambiarla" });
    return { error: "La contraseña actual no es correcta", fieldErrors: { current: ["Incorrecta"] } };
  }
  if (current === password) {
    return { error: "La contraseña nueva tiene que ser distinta", fieldErrors: { password: ["Es igual a la actual"] } };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false, passwordChangedAt: new Date() },
  });
  const closed = await destroyOtherSessions(user.id);
  await audit({
    actorId: user.id,
    action: "contrasena.cambio",
    entity: "User",
    entityId: user.id,
    summary: `${user.firstName} ${user.lastName} cambió su contraseña${closed ? ` (se cerraron ${closed} sesiones)` : ""}`,
  });
  redirect("/inicio?contrasena=1");
}

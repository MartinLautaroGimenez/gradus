"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { LIMITS, hit, isLimited, minutesLeft, reset } from "@/lib/auth/rate-limit";
import { createSession, destroySession, getCurrentUser, hashToken, newToken } from "@/lib/auth/session";
import { verifySecondFactor } from "@/lib/auth/two-factor";
import { challengeCookieName } from "@/lib/auth/challenge-cookie";
import { UNKNOWN_IP, clientIp } from "@/lib/request-info";
import { isSecureDeployment } from "@/lib/security-headers";

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Ingresá tu email o DNI").max(200),
  password: z.string().min(1, "Ingresá tu contraseña").max(200),
});

export type LoginState = { error?: string; identifier?: string };

const INVALID_CREDENTIALS = "Email/DNI o contraseña incorrectos";
/** Tiempo para escribir el código de la verificación en dos pasos. */
const CHALLENGE_MINUTES = 5;
const CHALLENGE_MAX_ATTEMPTS = 5;

// Si el usuario no existe se compara igual contra un hash cualquiera, para que
// el tiempo de respuesta no revele qué emails o DNI están registrados.
const dummyHash = hashPassword("gradus-dummy-password");

function tooMany(key: string) {
  return `Demasiados intentos. Esperá ${minutesLeft(key)} min y probá de nuevo.`;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, identifier: String(formData.get("identifier") ?? "").slice(0, 200) };
  }

  const identifier = parsed.data.identifier.toLowerCase();
  const ip = await clientIp();
  const accountKey = `login:cuenta:${identifier}`;
  const ipKey = `login:ip:${ip}`;
  if (isLimited(accountKey, LIMITS.loginPerAccount)) return { error: tooMany(accountKey), identifier };
  // Sin proxy delante no se conoce la IP: no se limita por IP (sería un único balde para todos).
  const ipKnown = ip !== UNKNOWN_IP;
  if (ipKnown && isLimited(ipKey, LIMITS.loginPerIp)) return { error: tooMany(ipKey), identifier };

  // Se acepta email o DNI (sin puntos).
  const user = await db.user.findFirst({
    where: identifier.includes("@") ? { email: identifier } : { dni: identifier.replace(/\./g, "") },
    select: { id: true, active: true, passwordHash: true, totpEnabledAt: true, firstName: true, lastName: true },
  });

  const passwordOk = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await dummyHash));
  if (!user || !user.active || !passwordOk) {
    hit(accountKey, LIMITS.loginPerAccount);
    if (ipKnown) hit(ipKey, LIMITS.loginPerIp);
    await audit({
      actorId: null,
      action: "login.fallido",
      entity: user ? "User" : undefined,
      entityId: user?.id,
      summary: user
        ? `Ingreso fallido de ${user.firstName} ${user.lastName}${user.active ? "" : " (cuenta desactivada)"}`
        : `Ingreso fallido con un usuario inexistente`,
    });
    return { error: INVALID_CREDENTIALS, identifier };
  }

  reset(accountKey);

  if (user.totpEnabledAt) {
    // Contraseña correcta, falta el segundo paso: se guarda un desafío corto.
    const token = newToken();
    const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60_000);
    await db.loginChallenge.deleteMany({ where: { OR: [{ userId: user.id }, { expiresAt: { lt: new Date() } }] } });
    await db.loginChallenge.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } });
    (await cookies()).set(challengeCookieName(), token, {
      httpOnly: true,
      secure: isSecureDeployment(),
      sameSite: "strict",
      path: "/",
      expires: expiresAt,
    });
    redirect("/login/verificacion");
  }

  return finishLogin(user.id, `${user.firstName} ${user.lastName}`, "contraseña");
}

async function finishLogin(userId: string, name: string, method: string): Promise<never> {
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  await createSession(userId);
  await audit({ actorId: userId, action: "login.ok", entity: "User", entityId: userId, summary: `Ingreso de ${name} (${method})` });
  redirect("/inicio");
}

export type VerifyState = { error?: string };

/** Segundo paso del ingreso: código de la app o de recuperación. */
export async function verifyLogin(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const store = await cookies();
  const token = store.get(challengeCookieName())?.value;
  const expired = { error: "Pasó demasiado tiempo. Volvé a ingresar tu contraseña." };
  if (!token) return expired;

  const challenge = await db.loginChallenge.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, active: true, firstName: true, lastName: true } } },
  });
  if (!challenge || challenge.expiresAt < new Date() || !challenge.user.active) return expired;
  if (challenge.attempts >= CHALLENGE_MAX_ATTEMPTS) {
    await db.loginChallenge.delete({ where: { id: challenge.id } });
    return { error: "Demasiados códigos incorrectos. Volvé a ingresar tu contraseña." };
  }

  const userKey = `2fa:${challenge.userId}`;
  if (!hit(userKey, LIMITS.twoFactor)) return { error: tooMany(userKey) };
  await db.loginChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });

  const code = String(formData.get("code") ?? "").slice(0, 40);
  const method = await verifySecondFactor(challenge.userId, code);
  const name = `${challenge.user.firstName} ${challenge.user.lastName}`;
  if (!method) {
    await audit({ actorId: challenge.userId, action: "login.2fa_fallido", entity: "User", entityId: challenge.userId, summary: `Código de verificación incorrecto de ${name}` });
    return { error: "El código no es válido. Probá con el que muestra la app ahora." };
  }

  reset(userKey);
  await db.loginChallenge.delete({ where: { id: challenge.id } });
  store.delete(challengeCookieName());
  if (method === "recovery") {
    await audit({ actorId: challenge.userId, action: "2fa.codigo_recuperacion", entity: "User", entityId: challenge.userId, summary: `${name} usó un código de recuperación` });
  }
  return finishLogin(challenge.userId, name, method === "totp" ? "contraseña y código" : "contraseña y código de recuperación");
}

export async function logout() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit({ actorId: user.id, action: "logout", entity: "User", entityId: user.id, summary: `Salida de ${user.firstName} ${user.lastName}` });
  redirect("/login");
}

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { clientIp, userAgent } from "@/lib/request-info";
import { isSecureDeployment } from "@/lib/security-headers";
import { SESSION_COOKIE_NAMES, sessionCookieName } from "./cookie";
import { STAFF_ROLES, hasAnyRole } from "./roles";

/** Duración máxima de una sesión, se use o no. */
const SESSION_DAYS = 30;
/** Una sesión que no se usa en este tiempo vence sola. */
const IDLE_DAYS = 14;
/** Cada cuánto se actualiza "último uso" (para no escribir en cada request). */
const TOUCH_EVERY_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}

async function currentToken() {
  const store = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    const value = store.get(name)?.value;
    if (value) return value;
  }
  return null;
}

/** Crea una sesión nueva (siempre con un token nuevo: evita fijación de sesión). */
export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: await userAgent(),
      ip: await clientIp(),
    },
  });

  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  // Se borra la cookie del otro nombre, si quedó de antes.
  for (const name of SESSION_COOKIE_NAMES) if (name !== sessionCookieName()) store.delete(name);
}

export async function destroySession() {
  const token = await currentToken();
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  const store = await cookies();
  for (const name of SESSION_COOKIE_NAMES) store.delete(name);
}

/** Cierra todas las sesiones del usuario salvo la actual (por ejemplo, al cambiar la contraseña). */
export async function destroyOtherSessions(userId: string) {
  const token = await currentToken();
  const { count } = await db.session.deleteMany({
    where: { userId, ...(token ? { tokenHash: { not: hashToken(token) } } : {}) },
  });
  return count;
}

/** Sesiones abiertas del usuario, la actual marcada. */
export async function listSessions(userId: string) {
  const token = await currentToken();
  const currentHash = token ? hashToken(token) : null;
  const sessions = await db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() }, lastUsedAt: { gt: new Date(Date.now() - IDLE_DAYS * DAY_MS) } },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, tokenHash: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true },
  });
  return sessions.map(({ tokenHash, ...session }) => ({ ...session, current: tokenHash === currentHash }));
}

/** Cierra una sesión puntual del usuario (no la actual). */
export async function revokeSession(userId: string, sessionId: string) {
  const token = await currentToken();
  const { count } = await db.session.deleteMany({
    where: { id: sessionId, userId, ...(token ? { tokenHash: { not: hashToken(token) } } : {}) },
  });
  return count > 0;
}

/** Usuario de la sesión actual, o null. Se memoriza por request. */
export const getCurrentUser = cache(async () => {
  const token = await currentToken();
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastUsedAt: true,
      user: {
        select: {
          id: true,
          dni: true,
          email: true,
          firstName: true,
          lastName: true,
          roles: true,
          active: true,
          mustChangePassword: true,
          totpEnabledAt: true,
        },
      },
    },
  });

  const now = Date.now();
  if (!session || !session.user.active) return null;
  if (session.expiresAt.getTime() < now || session.lastUsedAt.getTime() < now - IDLE_DAYS * DAY_MS) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (session.lastUsedAt.getTime() < now - TOUCH_EVERY_MS) {
    await db.session.updateMany({ where: { id: session.id }, data: { lastUsedAt: new Date(now) } });
  }

  const { totpEnabledAt, ...user } = session.user;
  let needsTwoFactorSetup = false;
  if (!totpEnabledAt && hasAnyRole(user, STAFF_ROLES)) {
    const school = await db.school.findFirst({ select: { require2faForStaff: true } });
    needsTwoFactorSetup = !!school?.require2faForStaff;
  }

  return { ...user, sessionId: session.id, twoFactorEnabled: !!totpEnabledAt, needsTwoFactorSetup };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Tiene que cambiar la contraseña o activar la verificación en dos pasos antes de usar el sistema. */
export function hasPendingSetup(user: CurrentUser) {
  return user.mustChangePassword || user.needsTwoFactorSetup;
}

/** Para route handlers: el usuario sólo si puede usar el sistema, o null. */
export async function getReadyUser() {
  const user = await getCurrentUser();
  return user && !hasPendingSetup(user) ? user : null;
}

/**
 * Para páginas protegidas: redirige al login si no hay sesión, al cambio de
 * contraseña si todavía usa la inicial, y a la configuración de la
 * verificación en dos pasos si la escuela la exige y no la activó.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/cuenta/contrasena");
  if (user.needsTwoFactorSetup) redirect("/cuenta/seguridad?obligatorio=1");
  return user;
}

/** Para páginas restringidas a ciertos roles. */
export async function requireRole(roles: Role[]) {
  const user = await requireUser();
  if (!hasAnyRole(user, roles)) redirect("/inicio");
  return user;
}

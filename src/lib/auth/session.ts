import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { hasAnyRole } from "./roles";

export const SESSION_COOKIE = "gradus_session";
const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function shouldUseSecureCookies() {
  // En el homelab se puede probar por HTTP con COOKIE_SECURE=false.
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 255) ?? null;

  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, userAgent },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

/** Cierra todas las sesiones del usuario salvo la actual (por ejemplo, al cambiar la contraseña). */
export async function destroyOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.session.deleteMany({
    where: { userId, ...(token ? { tokenHash: { not: hashToken(token) } } : {}) },
  });
}

/** Usuario de la sesión actual, o null. Se memoriza por request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
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
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session.user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Para páginas protegidas: redirige al login si no hay sesión, y al cambio de
 * contraseña si todavía usa la inicial.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/cuenta/contrasena");
  return user;
}

/** Para páginas restringidas a ciertos roles. */
export async function requireRole(roles: Role[]) {
  const user = await requireUser();
  if (!hasAnyRole(user, roles)) redirect("/inicio");
  return user;
}

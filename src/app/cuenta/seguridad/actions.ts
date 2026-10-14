"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { LIMITS, hit, minutesLeft } from "@/lib/auth/rate-limit";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { destroyOtherSessions, getCurrentUser, revokeSession } from "@/lib/auth/session";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/auth/totp";
import { replaceRecoveryCodes, verifySecondFactor } from "@/lib/auth/two-factor";
import { seal, unseal } from "@/lib/secret-box";

/** Usuario logueado (puede tener pendiente activar la verificación en dos pasos). */
async function accountUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/cuenta/contrasena");
  return user;
}

function limited(userId: string) {
  const key = `2fa-cuenta:${userId}`;
  return hit(key, LIMITS.twoFactor) ? null : `Demasiados intentos. Esperá ${minutesLeft(key)} min.`;
}

export type SetupState = { error?: string; qr?: string; secret?: string; codes?: string[]; done?: boolean };

/** Paso 1: genera un secreto nuevo (todavía no activo) y el código QR para escanear. */
export async function startTwoFactorSetup(): Promise<SetupState> {
  const user = await accountUser();
  if (user.twoFactorEnabled) return { error: "La verificación en dos pasos ya está activada." };

  const secret = generateTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecret: seal(secret), totpEnabledAt: null, totpLastStep: null } });
  const account = user.email ?? user.dni;
  const qr = await QRCode.toString(totpUri(secret, account), { type: "svg", margin: 1, width: 200 });
  return { qr: `data:image/svg+xml;base64,${Buffer.from(qr).toString("base64")}`, secret };
}

/** Paso 2: confirma con un código de la app, activa y entrega los códigos de recuperación. */
export async function confirmTwoFactorSetup(prev: SetupState, formData: FormData): Promise<SetupState> {
  const user = await accountUser();
  if (user.twoFactorEnabled) return { error: "La verificación en dos pasos ya está activada." };
  const tooMany = limited(user.id);
  if (tooMany) return { ...prev, error: tooMany };

  const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { totpSecret: true } });
  if (!stored.totpSecret) return { error: "Empezá de nuevo la configuración." };
  const step = verifyTotp(unseal(stored.totpSecret), String(formData.get("code") ?? ""));
  if (step === null) return { ...prev, error: "El código no coincide. Revisá que la hora del teléfono sea la correcta." };

  await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), totpLastStep: step } });
  const codes = await replaceRecoveryCodes(user.id);
  const closed = await destroyOtherSessions(user.id);
  await audit({
    actorId: user.id,
    action: "2fa.activar",
    entity: "User",
    entityId: user.id,
    summary: `${user.firstName} ${user.lastName} activó la verificación en dos pasos${closed ? ` (se cerraron ${closed} sesiones)` : ""}`,
  });
  // Sin revalidatePath: la página pasaría a "Activada" y no se verían los códigos.
  // Se recarga cuando la persona confirma que los guardó.
  return { codes, done: true };
}

export type CodeState = { error?: string; codes?: string[]; ok?: boolean };

/** Desactiva la verificación en dos pasos (pide contraseña y código). */
export async function disableTwoFactor(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const user = await accountUser();
  if (!user.twoFactorEnabled) return { error: "No está activada." };
  if (hasAnyRole(user, STAFF_ROLES)) {
    const school = await db.school.findFirst({ select: { require2faForStaff: true } });
    if (school?.require2faForStaff) return { error: "La escuela exige la verificación en dos pasos para tu rol." };
  }
  const tooMany = limited(user.id);
  if (tooMany) return { error: tooMany };

  const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(String(formData.get("password") ?? "").slice(0, 200), stored.passwordHash))) {
    return { error: "La contraseña no es correcta." };
  }
  if (!(await verifySecondFactor(user.id, String(formData.get("code") ?? "").slice(0, 40)))) {
    return { error: "El código no es válido." };
  }

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null } }),
    db.recoveryCode.deleteMany({ where: { userId: user.id } }),
  ]);
  await audit({ actorId: user.id, action: "2fa.desactivar", entity: "User", entityId: user.id, summary: `${user.firstName} ${user.lastName} desactivó la verificación en dos pasos` });
  revalidatePath("/cuenta/seguridad");
  return { ok: true };
}

/** Genera códigos de recuperación nuevos (los anteriores dejan de servir). */
export async function regenerateRecoveryCodes(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const user = await accountUser();
  if (!user.twoFactorEnabled) return { error: "No está activada." };
  const tooMany = limited(user.id);
  if (tooMany) return { error: tooMany };
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code) || (await verifySecondFactor(user.id, code)) !== "totp") {
    return { error: "Escribí el código de 6 números que muestra la app." };
  }
  const codes = await replaceRecoveryCodes(user.id);
  await audit({ actorId: user.id, action: "2fa.codigos", entity: "User", entityId: user.id, summary: `${user.firstName} ${user.lastName} generó códigos de recuperación nuevos` });
  revalidatePath("/cuenta/seguridad");
  return { codes };
}

export async function closeSession(formData: FormData) {
  const user = await accountUser();
  const id = String(formData.get("sessionId") ?? "");
  if (await revokeSession(user.id, id)) {
    await audit({ actorId: user.id, action: "sesion.cerrar", entity: "Session", entityId: id, summary: `${user.firstName} ${user.lastName} cerró una sesión en otro dispositivo` });
  }
  revalidatePath("/cuenta/seguridad");
}

export async function closeOtherSessions() {
  const user = await accountUser();
  const closed = await destroyOtherSessions(user.id);
  if (closed) {
    await audit({ actorId: user.id, action: "sesion.cerrar_otras", entity: "User", entityId: user.id, summary: `${user.firstName} ${user.lastName} cerró ${closed} sesiones en otros dispositivos` });
  }
  revalidatePath("/cuenta/seguridad");
}

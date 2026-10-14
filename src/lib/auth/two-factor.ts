import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { unseal } from "@/lib/secret-box";
import { generateRecoveryCodes, normalizeRecoveryCode, verifyTotp } from "./totp";

export function hashRecoveryCode(code: string) {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/** Crea códigos de recuperación nuevos (borra los anteriores) y los devuelve en claro, una sola vez. */
export async function replaceRecoveryCodes(userId: string) {
  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.recoveryCode.deleteMany({ where: { userId } }),
    db.recoveryCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })) }),
  ]);
  return codes;
}

/**
 * Verifica un código de la app (6 dígitos) o uno de recuperación. Cada código
 * sirve una sola vez. Devuelve qué tipo se usó, o null si no es válido.
 */
export async function verifySecondFactor(userId: string, input: string): Promise<"totp" | "recovery" | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true },
  });
  if (!user?.totpSecret || !user.totpEnabledAt) return null;

  const code = input.replace(/\s/g, "");
  if (/^\d{6}$/.test(code)) {
    const step = verifyTotp(unseal(user.totpSecret), code);
    if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) return null;
    // Condición en el update: si dos pedidos llegan juntos, sólo uno gana.
    const { count } = await db.user.updateMany({
      where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return count === 1 ? "totp" : null;
  }

  if (normalizeRecoveryCode(code).length !== 8) return null;
  const { count } = await db.recoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? "recovery" : null;
}

export async function remainingRecoveryCodes(userId: string) {
  return db.recoveryCode.count({ where: { userId, usedAt: null } });
}

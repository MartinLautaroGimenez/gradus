import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Verificación en dos pasos con códigos de 6 dígitos que cambian cada 30
 * segundos (TOTP, RFC 6238), compatible con Google Authenticator, Microsoft
 * Authenticator, Authy, 1Password, etc.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string) {
  const clean = text.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Secreto inválido");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

/** Código para un paso de tiempo dado (HOTP, RFC 4226). */
export function hotp(secret: Buffer, counter: number, digits = 6) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}

/**
 * ¿El código es válido ahora? Acepta el paso anterior y el siguiente para
 * tolerar relojes un poco desfasados. Devuelve el paso usado (para no
 * aceptar el mismo código dos veces) o null.
 */
export function verifyTotp(secretBase32: string, code: string, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const secret = base32Decode(secretBase32);
  const current = Math.floor(now / 1000 / STEP_SECONDS);
  for (const step of [current, current - 1, current + 1]) {
    const expected = hotp(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return null;
}

/** URI que leen las apps de autenticación (se muestra como código QR). */
export function totpUri(secretBase32: string, account: string, issuer = "Gradus") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** Códigos de recuperación de un solo uso, por si se pierde el celular. */
export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase(); // 8 caracteres
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}

export function normalizeRecoveryCode(code: string) {
  return code.trim().toLowerCase().replace(/[^a-z2-7]/g, "");
}

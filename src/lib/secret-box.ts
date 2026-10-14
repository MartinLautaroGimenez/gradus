import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifrado de datos sensibles guardados en la base (por ahora, los secretos de
 * la verificación en dos pasos) con AES-256-GCM. La clave sale de SECRET_KEY:
 * así, una copia de la base sola no alcanza para generar códigos válidos.
 */
const PREFIX = "v1";

function key() {
  const secret = process.env.SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Falta SECRET_KEY en el entorno (ver docs/SEGURIDAD.md).");
    }
    return createHash("sha256").update("gradus-clave-de-desarrollo").digest();
  }
  return createHash("sha256").update(secret).digest();
}

export function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(":");
}

export function unseal(sealed: string) {
  const [prefix, iv, tag, data] = sealed.split(":");
  if (prefix !== PREFIX || !iv || !tag || !data) throw new Error("Dato cifrado con formato desconocido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

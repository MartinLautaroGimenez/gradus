/**
 * Límites de intentos en memoria (ventana fija). Alcanza para un único
 * servidor; si algún día hay varias instancias, pasarlo a la base o a Redis.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type Limit = { max: number; windowMs: number };

export const LIMITS = {
  /** Intentos fallidos de ingreso por usuario (DNI o email). */
  loginPerAccount: { max: 5, windowMs: 15 * 60_000 },
  /** Intentos fallidos de ingreso por IP (frena probar muchas cuentas). */
  loginPerIp: { max: 20, windowMs: 15 * 60_000 },
  /** Códigos de verificación en dos pasos. */
  twoFactor: { max: 5, windowMs: 15 * 60_000 },
  passwordChange: { max: 5, windowMs: 15 * 60_000 },
  messages: { max: 30, windowMs: 60_000 },
  announcements: { max: 10, windowMs: 10 * 60_000 },
  imports: { max: 10, windowMs: 10 * 60_000 },
} satisfies Record<string, Limit>;

/** ¿Ya se pasó del límite? (no cuenta un intento nuevo). */
export function isLimited(key: string, limit: Limit, now = Date.now()) {
  const entry = buckets.get(key);
  return !!entry && entry.resetAt > now && entry.count >= limit.max;
}

/** Registra un intento. Devuelve false si se pasó del límite. */
export function hit(key: string, limit: Limit, now = Date.now()) {
  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + limit.windowMs };
    buckets.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= limit.max;
}

export function reset(key: string) {
  buckets.delete(key);
}

/** Minutos que faltan para poder reintentar. */
export function minutesLeft(key: string, now = Date.now()) {
  const entry = buckets.get(key);
  return entry ? Math.max(1, Math.ceil((entry.resetAt - now) / 60_000)) : 0;
}

// Limpieza periódica para que el mapa no crezca sin fin.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) if (entry.resetAt <= now) buckets.delete(key);
}, 10 * 60_000).unref?.();

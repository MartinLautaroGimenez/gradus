// Límite simple de intentos de login en memoria. Alcanza para un único
// servidor; si algún día hay varias instancias, pasarlo a la base o a Redis.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string) {
  const entry = attempts.get(key);
  return !!entry && entry.resetAt > Date.now() && entry.count >= MAX_ATTEMPTS;
}

export function registerFailedAttempt(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}

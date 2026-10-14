import "server-only";
import { headers } from "next/headers";

export const UNKNOWN_IP = "desconocida";

/**
 * IP del cliente. Detrás de Caddy/Nginx llega en X-Forwarded-For (primer
 * valor). Si Gradus se expone directo, ese encabezado lo podría inventar el
 * cliente: por eso los límites de intentos también se aplican por usuario.
 */
export async function clientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || h.get("x-real-ip") || UNKNOWN_IP).slice(0, 64);
}

export async function userAgent() {
  return (await headers()).get("user-agent")?.slice(0, 255) ?? null;
}

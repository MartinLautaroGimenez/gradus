/**
 * Nombre de la cookie de sesión. Con HTTPS se usa el prefijo "__Host-": el
 * navegador sólo la acepta si es Secure, de este mismo dominio exacto y para
 * todo el sitio, así un subdominio no puede pisarla ni leerla.
 */
import { isSecureDeployment } from "@/lib/security-headers";

export const SESSION_COOKIE_NAMES = ["__Host-gradus_session", "gradus_session"] as const;

export function sessionCookieName() {
  return isSecureDeployment() ? SESSION_COOKIE_NAMES[0] : SESSION_COOKIE_NAMES[1];
}

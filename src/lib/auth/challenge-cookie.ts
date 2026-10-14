import { isSecureDeployment } from "@/lib/security-headers";

/** Cookie del ingreso a medio hacer (falta el código de verificación). */
export function challengeCookieName() {
  return isSecureDeployment() ? "__Host-gradus_2fa" : "gradus_2fa";
}

/**
 * Cabeceras de seguridad. Se usan en el middleware (CSP con nonce, distinta
 * en cada respuesta) y en next.config.ts (el resto, también para archivos
 * estáticos). Sin dependencias de Node: corre en el middleware.
 */

/** HTTPS activo: producción y sin COOKIE_SECURE=false (prueba por HTTP en la red local). */
export function isSecureDeployment() {
  return process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
}

/**
 * Content Security Policy: sólo se ejecutan los scripts que trae el nonce de
 * esta respuesta (y los que esos carguen, por 'strict-dynamic'). Nada de
 * scripts externos, ni iframes de otros sitios, ni enviar formularios afuera.
 */
export function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Next y Tailwind usan estilos en línea; no permiten ejecutar código.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isSecureDeployment() ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Cabeceras fijas para todas las respuestas. */
export const STATIC_SECURITY_HEADERS = [
  // No adivinar tipos de archivo (evita que un adjunto se interprete como HTML).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No se puede mostrar Gradus dentro de otro sitio (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Al seguir un enlace a otro sitio no se manda la ruta interna.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Funciones del navegador que Gradus no usa, bloqueadas.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Datos de menores: que ningún buscador indexe nada.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

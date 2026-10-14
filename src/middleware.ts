import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/cookie";
import { contentSecurityPolicy, isSecureDeployment } from "@/lib/security-headers";

// Chequeo liviano: sólo mira que exista la cookie. La validación real de la
// sesión contra la base se hace en el servidor con requireUser().
const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!isPublic && !SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name))) {
    // Se clona nextUrl (que respeta el host que usa el navegador) en vez de
    // armar la URL con request.url, que puede ser el host interno (0.0.0.0).
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Los adjuntos traen su propia política (más estricta, con sandbox).
  if (pathname.startsWith("/archivos/")) return NextResponse.next();

  // Nonce nuevo en cada respuesta: Next lo agrega a sus propios scripts.
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (isSecureDeployment()) {
    // El navegador recuerda por un año que este sitio va sólo por HTTPS.
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export const config = {
  // Excluye archivos estáticos, íconos, el manifiesto y el service worker.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|.*\\.(?:png|svg|ico)$).*)"],
};

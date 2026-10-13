import { NextResponse, type NextRequest } from "next/server";

// Chequeo liviano: sólo mira que exista la cookie. La validación real de la
// sesión contra la base se hace en el servidor con requireUser().
const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return NextResponse.next();

  if (!request.cookies.has("gradus_session")) {
    // Se clona nextUrl (que respeta el host que usa el navegador) en vez de
    // armar la URL con request.url, que puede ser el host interno (0.0.0.0).
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Excluye archivos estáticos, íconos y el manifiesto de la PWA.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|.*\\.(?:png|svg|ico)$).*)"],
};

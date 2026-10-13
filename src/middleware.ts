import { NextResponse, type NextRequest } from "next/server";

// Chequeo liviano: sólo mira que exista la cookie. La validación real de la
// sesión contra la base se hace en el servidor con requireUser().
const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return NextResponse.next();

  if (!request.cookies.has("gradus_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Excluye archivos estáticos, íconos y el manifiesto de la PWA.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|.*\\.(?:png|svg|ico)$).*)"],
};

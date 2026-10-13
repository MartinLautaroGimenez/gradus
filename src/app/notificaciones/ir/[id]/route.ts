import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * Redirección relativa: el navegador la resuelve contra la dirección que está
 * usando. Armarla con request.url daba http://0.0.0.0:3000/... cuando el
 * servidor escucha en 0.0.0.0.
 */
function redirectTo(path: string) {
  return new Response(null, { status: 303, headers: { Location: path } });
}

/** Marca el aviso como leído y lleva a su destino (sólo rutas internas). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirectTo("/login");
  const { id } = await params;
  const notification = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!notification) return redirectTo("/notificaciones");
  if (!notification.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  const link = notification.link?.startsWith("/") && !notification.link.startsWith("//") ? notification.link : "/notificaciones";
  return redirectTo(link);
}

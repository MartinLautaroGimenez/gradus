import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Contador de avisos sin leer para la campana (se consulta cada minuto). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ unread: 0 }, { status: 401 });
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  return Response.json({ unread }, { headers: { "Cache-Control": "no-store" } });
}

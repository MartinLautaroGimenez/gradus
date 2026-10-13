import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Marca el aviso como leído y lleva a su destino (sólo rutas internas). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const { id } = await params;
  const notification = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!notification) return NextResponse.redirect(new URL("/notificaciones", request.url));
  if (!notification.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  const link = notification.link?.startsWith("/") && !notification.link.startsWith("//") ? notification.link : "/notificaciones";
  return NextResponse.redirect(new URL(link, request.url));
}

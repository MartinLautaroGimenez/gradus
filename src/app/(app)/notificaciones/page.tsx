import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CalendarDays, ClipboardCheck, FileSignature, Megaphone, MessageCircle, ShieldAlert, BookOpen } from "lucide-react";
import type { NotificationKind } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { emailEnabled } from "@/lib/notifications/email";
import { vapidPublicKey } from "@/lib/notifications/push";
import { cn } from "@/lib/utils";
import { markAllRead, setEmailNotifications } from "./actions";
import { PushSettings } from "./push-settings";

export const metadata: Metadata = { title: "Notificaciones" };

const ICONS: Record<NotificationKind, typeof Bell> = {
  COMUNICADO: Megaphone,
  MENSAJE: MessageCircle,
  ASISTENCIA: ClipboardCheck,
  CONVIVENCIA: ShieldAlert,
  AUTORIZACION: FileSignature,
  CALENDARIO: CalendarDays,
  NOTA: BookOpen,
  SISTEMA: Bell,
};

function ago(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Mendoza" });
}

export default async function NotificacionesPage() {
  const user = await requireUser();
  const [notifications, me] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, emailNotifications: true } }),
  ]);
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notificaciones"
        description={unread ? `${unread} sin leer` : "Estás al día"}
        actions={
          unread > 0 && (
            <form action={markAllRead}>
              <SubmitButton variant="secondary" pendingText="…">
                Marcar todas como leídas
              </SubmitButton>
            </form>
          )
        }
      />

      {notifications.length === 0 ? (
        <Card className="text-sm text-muted">No tenés notificaciones.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {notifications.map((n) => {
              const Icon = ICONS[n.kind];
              return (
                <li key={n.id}>
                  <Link
                    href={`/notificaciones/ir/${n.id}`}
                    prefetch={false}
                    className={cn("flex items-start gap-3 px-5 py-3 hover:bg-surface-muted", !n.readAt && "bg-primary-soft/40")}
                  >
                    <Icon className={cn("mt-0.5 size-5 shrink-0", n.readAt ? "text-muted" : "text-primary")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block", !n.readAt && "font-semibold")}>{n.title}</span>
                      {n.body && <span className="line-clamp-2 block text-sm text-muted">{n.body}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{ago(n.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>Cómo te avisamos</CardTitle>
          <CardDescription>Todos los avisos quedan siempre en esta bandeja. Además podés recibirlos así:</CardDescription>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-medium">Notificaciones en el celular o la computadora</h3>
          <PushSettings vapidKey={vapidPublicKey()} />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-medium">Email</h3>
          {!emailEnabled() ? (
            <p className="text-sm text-muted">El servidor todavía no tiene configurado el envío de emails.</p>
          ) : !me.email ? (
            <p className="text-sm text-muted">No tenés un email cargado. Pedí en la escuela que lo agreguen.</p>
          ) : (
            <form action={setEmailNotifications.bind(null, !me.emailNotifications)} className="flex flex-wrap items-center gap-3 text-sm">
              <span>{me.emailNotifications ? `Activado (${me.email})` : "Desactivado"}</span>
              <SubmitButton variant="secondary" pendingText="…">
                {me.emailNotifications ? "Desactivar" : "Activar"}
              </SubmitButton>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}

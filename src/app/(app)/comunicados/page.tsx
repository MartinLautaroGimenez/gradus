import type { Metadata } from "next";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { sendingScope } from "@/lib/announcements/audience";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cn, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Comunicados" };

function when(date: Date) {
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Mendoza" });
}

export default async function ComunicadosPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const user = await requireUser();
  const { vista } = await searchParams;
  const canSend = !!(await sendingScope(user));
  const sent = canSend && vista === "enviados";

  const received = sent
    ? []
    : await db.announcementRecipient.findMany({
        where: { userId: user.id },
        include: { announcement: { include: { author: true, _count: { select: { attachments: true } } } } },
        orderBy: { announcement: { createdAt: "desc" } },
        take: 100,
      });
  const own = sent
    ? await db.announcement.findMany({
        where: { authorId: user.id },
        include: {
          _count: { select: { recipients: true, attachments: true } },
          recipients: { select: { readAt: true, acknowledgedAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];

  const tab = (active: boolean) =>
    cn(
      "rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors",
      active ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Comunicados"
        actions={canSend && <LinkButton href="/comunicados/nuevo">Nuevo comunicado</LinkButton>}
      />
      {canSend && (
        <nav className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.08]">
          <Link href="/comunicados" aria-current={!sent ? "page" : undefined} className={tab(!sent)}>
            Recibidos
          </Link>
          <Link href="/comunicados?vista=enviados" aria-current={sent ? "page" : undefined} className={tab(sent)}>
            Enviados
          </Link>
        </nav>
      )}

      {!sent &&
        (received.length === 0 ? (
          <Card className="text-sm text-muted">No tenés comunicados.</Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {received.map(({ announcement: a, readAt, acknowledgedAt }) => (
                <li key={a.id}>
                  <Link href={`/comunicados/${a.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-muted">
                    <span className={cn("mt-2 size-2 shrink-0 rounded-full", readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate", !readAt && "font-semibold")}>{a.title}</span>
                      <span className="block truncate text-sm text-muted">
                        {a.author ? fullName(a.author) : "Escuela"} · {a.body.slice(0, 120)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted">
                      {when(a.createdAt)}
                      {a._count.attachments > 0 && <Paperclip className="size-3.5" aria-label="Tiene adjuntos" />}
                      {a.requiresAck && !acknowledgedAt && <Badge tone="warning">Notificarse</Badge>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}

      {sent &&
        (own.length === 0 ? (
          <Card className="text-sm text-muted">Todavía no enviaste comunicados.</Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {own.map((a) => {
                const read = a.recipients.filter((r) => r.readAt).length;
                const acked = a.recipients.filter((r) => r.acknowledgedAt).length;
                return (
                  <li key={a.id}>
                    <Link href={`/comunicados/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{a.title}</span>
                        <span className="block text-sm text-muted">
                          {when(a.createdAt)} · {a._count.recipients} destinatarios
                        </span>
                      </span>
                      <span className="text-right text-xs text-muted">
                        Leído {read}/{a._count.recipients}
                        {a.requiresAck && (
                          <span className="block">
                            Notificados {acked}/{a._count.recipients}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Paperclip } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Td, Th } from "@/components/ui/table";
import { AUDIENCE_LABELS, canManageAnnouncement } from "@/lib/announcements/audience";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { courseLabel, fullName } from "@/lib/utils";
import { acknowledgeAnnouncement, deleteAnnouncement, remindPending } from "../actions";
import { RemindButton } from "@/components/remind-button";

export const metadata: Metadata = { title: "Comunicado" };

function dateTime(date: Date) {
  return date.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Mendoza",
  });
}

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export default async function ComunicadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ enviado?: string; filtro?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { enviado, filtro } = await searchParams;

  const announcement = await db.announcement.findUnique({
    where: { id },
    include: {
      author: true,
      attachments: true,
      courses: { include: { course: true } },
    },
  });
  if (!announcement) notFound();
  const manage = canManageAnnouncement(user, announcement.authorId);
  const mine = await db.announcementRecipient.findUnique({
    where: { announcementId_userId: { announcementId: id, userId: user.id } },
  });
  if (!mine && !manage) notFound();

  // Abrirlo cuenta como leído (y marca leído el aviso de la bandeja).
  if (mine && !mine.readAt) {
    await db.announcementRecipient.update({ where: { id: mine.id }, data: { readAt: new Date() } });
  }
  await db.notification.updateMany({
    where: { userId: user.id, link: `/comunicados/${id}`, readAt: null },
    data: { readAt: new Date() },
  });

  const recipients = manage
    ? await db.announcementRecipient.findMany({
        where: { announcementId: id },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              roles: true,
              guardianOf: {
                select: {
                  student: {
                    select: {
                      user: { select: { firstName: true } },
                      enrollments: { where: { status: "ACTIVA" }, select: { course: true }, take: 1 },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      })
    : [];
  const read = recipients.filter((r) => r.readAt).length;
  const acked = recipients.filter((r) => r.acknowledgedAt).length;
  const isPending = (r: (typeof recipients)[number]) => (announcement.requiresAck ? !r.acknowledgedAt : !r.readAt);
  const pendingCount = recipients.filter(isPending).length;
  const shown = filtro === "pendientes" ? recipients.filter(isPending) : recipients;

  const audience = [
    announcement.targetRoles.map((r) => AUDIENCE_LABELS[r]).join(", "),
    announcement.courses.length ? announcement.courses.map((c) => courseLabel(c.course)).join(", ") : "toda la escuela",
  ].join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={announcement.title}
        back={{ href: manage && !mine ? "/comunicados?vista=enviados" : "/comunicados", label: "Comunicados" }}
        description={`${announcement.author ? fullName(announcement.author) : "Escuela"} · ${dateTime(announcement.createdAt)}`}
      />

      {enviado && (
        <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          Comunicado enviado a {recipients.length} {recipients.length === 1 ? "persona" : "personas"}.
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <p className="text-sm whitespace-pre-line">{announcement.body}</p>
        {announcement.attachments.length > 0 && (
          <ul className="flex flex-col gap-1 border-t border-border pt-3">
            {announcement.attachments.map((file) => (
              <li key={file.id}>
                <a href={`/archivos/${file.id}`} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                  <Paperclip className="size-4" aria-hidden />
                  {file.fileName}
                  <span className="text-xs text-muted">({formatSize(file.size)})</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {mine && announcement.requiresAck && (
          <div className="border-t border-border pt-3">
            {mine.acknowledgedAt ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden /> Te notificaste el {dateTime(mine.acknowledgedAt)}
              </p>
            ) : (
              <form action={acknowledgeAnnouncement.bind(null, id)}>
                <SubmitButton pendingText="Guardando…">Me notifico</SubmitButton>
                <p className="mt-2 text-xs text-muted">Confirma que leíste el comunicado. Queda registrado con fecha y hora.</p>
              </form>
            )}
          </div>
        )}
      </Card>

      {manage && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Seguimiento</h2>
            <span className="text-sm text-muted">Para: {audience}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-2xl font-semibold tabular-nums">{recipients.length}</p>
              <p className="text-sm text-muted">Destinatarios</p>
            </Card>
            <Card>
              <p className="text-2xl font-semibold tabular-nums">
                {read} <span className="text-base font-normal text-muted">({recipients.length ? Math.round((read / recipients.length) * 100) : 0} %)</span>
              </p>
              <p className="text-sm text-muted">Lo leyeron</p>
            </Card>
            {announcement.requiresAck && (
              <Card>
                <p className="text-2xl font-semibold tabular-nums">
                  {acked} <span className="text-base font-normal text-muted">({recipients.length ? Math.round((acked / recipients.length) * 100) : 0} %)</span>
                </p>
                <p className="text-sm text-muted">Se notificaron</p>
              </Card>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RemindButton action={remindPending.bind(null, id)} pendingCount={pendingCount} />
            <div className="flex gap-3 text-sm">
              <Link href={`/comunicados/${id}`} className={filtro ? "text-muted hover:underline" : "font-medium text-primary"}>
                Todos
              </Link>
              <Link href={`/comunicados/${id}?filtro=pendientes`} className={filtro ? "font-medium text-primary" : "text-muted hover:underline"}>
                Sólo los que faltan ({pendingCount})
              </Link>
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Persona</Th>
                <Th className="hidden sm:table-cell">Alumno a cargo</Th>
                <Th>Leído</Th>
                {announcement.requiresAck && <Th>Notificado</Th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{fullName(r.user)}</Td>
                  <Td className="hidden text-sm text-muted sm:table-cell">
                    {r.user.guardianOf
                      .map((g) => `${g.student.user.firstName}${g.student.enrollments[0] ? ` (${courseLabel(g.student.enrollments[0].course)})` : ""}`)
                      .join(", ") || "—"}
                  </Td>
                  <Td className="text-sm">{r.readAt ? dateTime(r.readAt) : <Badge tone="warning">No</Badge>}</Td>
                  {announcement.requiresAck && (
                    <Td className="text-sm">{r.acknowledgedAt ? dateTime(r.acknowledgedAt) : <Badge tone="warning">No</Badge>}</Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
          <form action={deleteAnnouncement.bind(null, id)}>
            <SubmitButton
              variant="ghost"
              className="text-danger"
              confirm="¿Eliminar el comunicado? Desaparece para todos los destinatarios."
              pendingText="Eliminando…"
            >
              Eliminar comunicado
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}

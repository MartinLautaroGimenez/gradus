import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { EventKind } from "@prisma/client";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { EVENT_LABELS } from "@/lib/calendar";
import { db } from "@/lib/db";
import { managedCourses, viewerCourses } from "@/lib/scope";
import { courseLabel, fullName } from "@/lib/utils";
import { deleteEvent, updateEvent } from "../actions";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "Evento" };

const longDate = (d: Date) => d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function EventoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { editar } = await searchParams;
  const event = await db.calendarEvent.findUnique({ where: { id }, include: { courses: { include: { course: true } }, createdBy: true } });
  if (!event) notFound();

  const viewer = await viewerCourses(user);
  const visible = viewer.all || event.courses.length === 0 || event.courses.some((c) => viewer.courses.some((v) => v.id === c.courseId));
  if (!visible) notFound();
  await db.notification.updateMany({ where: { userId: user.id, link: `/calendario/${id}`, readAt: null }, data: { readAt: new Date() } });

  const staff = hasAnyRole(user, STAFF_ROLES);
  const canEdit = event.createdById === user.id || staff;

  if (canEdit && editar) {
    const courses = await managedCourses(user);
    return (
      <div>
        <PageHeader title="Editar evento" back={{ href: `/calendario/${id}`, label: event.title }} />
        <Card>
          <EventForm
            action={updateEvent.bind(null, id)}
            kinds={staff ? (Object.keys(EVENT_LABELS) as EventKind[]) : ["EVALUACION", "SALIDA", "REUNION", "ACTO", "OTRO"]}
            courses={courses.map((c) => ({ id: c.id, label: courseLabel(c) }))}
            canSchoolWide={staff}
            defaultDate={iso(event.startDate)}
            event={{
              title: event.title,
              description: event.description,
              kind: event.kind,
              startDate: iso(event.startDate),
              endDate: event.endDate ? iso(event.endDate) : null,
              time: event.time,
              location: event.location,
              courseIds: event.courses.map((c) => c.courseId),
            }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={event.title}
        back={{ href: `/calendario?mes=${iso(event.startDate).slice(0, 7)}`, label: "Calendario" }}
        actions={
          canEdit && (
            <a href={`/calendario/${id}?editar=1`} className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
              Editar
            </a>
          )
        }
      />
      <Card className="flex flex-col gap-3 text-sm">
        <Badge className="self-start">{EVENT_LABELS[event.kind]}</Badge>
        <p className="flex items-center gap-2 first-letter:uppercase">
          <CalendarDays className="size-4 text-muted" aria-hidden />
          {longDate(event.startDate)}
          {event.endDate && ` al ${longDate(event.endDate)}`}
        </p>
        {event.time && (
          <p className="flex items-center gap-2">
            <Clock className="size-4 text-muted" aria-hidden /> {event.time} h
          </p>
        )}
        {event.location && (
          <p className="flex items-center gap-2">
            <MapPin className="size-4 text-muted" aria-hidden /> {event.location}
          </p>
        )}
        <p className="flex items-center gap-2">
          <Users className="size-4 text-muted" aria-hidden />
          {event.courses.length ? event.courses.map((c) => courseLabel(c.course)).join(", ") : "Toda la escuela"}
        </p>
        {event.description && <p className="border-t border-border pt-3 whitespace-pre-line">{event.description}</p>}
        {event.createdBy && <p className="text-xs text-muted">Cargado por {fullName(event.createdBy)}</p>}
      </Card>
      {canEdit && (
        <Card>
          <CardTitle className="mb-2 text-sm">Eliminar</CardTitle>
          <form action={deleteEvent.bind(null, id)}>
            <SubmitButton variant="secondary" className="text-danger" confirm="¿Eliminar el evento?" pendingText="Eliminando…">
              Eliminar evento
            </SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}

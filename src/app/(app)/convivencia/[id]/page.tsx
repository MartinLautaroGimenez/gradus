import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { INCIDENT_LABELS, INCIDENT_TONE, canViewCourseIncidents } from "@/lib/discipline";
import { courseLabel, fullName } from "@/lib/utils";
import { deleteIncident, signIncident } from "../actions";
import { SignForm } from "./sign-form";

export const metadata: Metadata = { title: "Convivencia" };

function dateTime(date: Date) {
  return date.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Mendoza" });
}

export default async function IncidentePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creado?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { creado } = await searchParams;
  const incident = await db.incident.findUnique({
    where: { id },
    include: {
      createdBy: true,
      signatures: { include: { user: true } },
      enrollment: {
        include: {
          course: { include: { subjects: { select: { teacherId: true } } } },
          student: { include: { user: true, guardians: { include: { guardian: true } } } },
        },
      },
    },
  });
  if (!incident) notFound();
  const { student, course } = incident.enrollment;
  const isGuardian = student.guardians.some((g) => g.guardianId === user.id);
  const isStudent = student.userId === user.id;
  const staffView = canViewCourseIncidents(user, {
    preceptorId: course.preceptorId,
    teacherIds: course.subjects.flatMap((s) => (s.teacherId ? [s.teacherId] : [])),
  });
  if (!isGuardian && !isStudent && !staffView) notFound();

  await db.notification.updateMany({ where: { userId: user.id, link: `/convivencia/${id}`, readAt: null }, data: { readAt: new Date() } });
  const mySignature = incident.signatures.find((s) => s.userId === user.id);
  const canDelete = incident.createdById === user.id || hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO"]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${INCIDENT_LABELS[incident.kind]} · ${fullName(student.user)}`}
        description={`${courseLabel(course)} · ${incident.date.toLocaleDateString("es-AR", { timeZone: "UTC" })} · Registró: ${incident.createdBy ? fullName(incident.createdBy) : "—"}`}
        back={{ href: "/convivencia", label: "Convivencia" }}
      />
      {creado && (
        <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          Registrado. Se avisó a la familia y al alumno.
        </p>
      )}
      <Card className="flex flex-col gap-4">
        <Badge tone={INCIDENT_TONE[incident.kind]} className="self-start">
          {INCIDENT_LABELS[incident.kind]}
        </Badge>
        <div>
          <h2 className="mb-1 text-sm font-semibold text-muted">Qué pasó</h2>
          <p className="text-sm whitespace-pre-line">{incident.description}</p>
        </div>
        {incident.measures && (
          <div>
            <h2 className="mb-1 text-sm font-semibold text-muted">Medidas o acciones reparadoras</h2>
            <p className="text-sm whitespace-pre-line">{incident.measures}</p>
          </div>
        )}
      </Card>

      {incident.requiresSignature && (
        <Card className="flex flex-col gap-4">
          <CardTitle>Notificación de la familia</CardTitle>
          {isGuardian &&
            (mySignature ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden /> Firmaste el {dateTime(mySignature.signedAt)}
              </p>
            ) : (
              <SignForm action={signIncident.bind(null, id)} />
            ))}
          {(staffView || isStudent) && (
            <ul className="flex flex-col gap-2 text-sm">
              {student.guardians.map((g) => {
                const signature = incident.signatures.find((s) => s.userId === g.guardianId);
                return (
                  <li key={g.guardianId} className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      {fullName(g.guardian)}
                      {signature ? <Badge tone="success">Firmó {dateTime(signature.signedAt)}</Badge> : <Badge tone="warning">Sin firmar</Badge>}
                    </span>
                    {signature?.comment && <span className="rounded-lg bg-surface-muted px-3 py-2 text-muted">“{signature.comment}”</span>}
                  </li>
                );
              })}
              {student.guardians.length === 0 && <li className="text-muted">El alumno no tiene adultos responsables cargados.</li>}
            </ul>
          )}
        </Card>
      )}

      {canDelete && (
        <form action={deleteIncident.bind(null, id)}>
          <SubmitButton variant="ghost" className="text-danger" confirm="¿Eliminar este registro?" pendingText="Eliminando…">
            Eliminar registro
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

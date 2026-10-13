import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Mail, MessageCircle, Phone } from "lucide-react";
import { StudentAttendance } from "@/components/attendance/student-attendance";
import { StudentReport } from "@/components/grades/student-report";
import { SummaryStats } from "@/components/students/summary-stats";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { INCIDENT_LABELS, INCIDENT_TONE } from "@/lib/discipline";
import { RELATIONSHIP_LABELS, formatDate, formatDni } from "@/lib/format";
import { canMessage } from "@/lib/messaging/contacts";
import { canViewStudentProfile, studentSummaries } from "@/lib/student-summary";
import { cn, courseLabel, fullName, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Alumno" };

const TABS = [
  { key: "notas", label: "Notas" },
  { key: "asistencia", label: "Asistencia" },
  { key: "convivencia", label: "Convivencia" },
  { key: "familia", label: "Familia" },
] as const;

/** Ficha del alumno para dirección, preceptores y docentes del curso: todo en un lugar. */
export default async function AlumnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const requested = (await searchParams).vista;
  const vista = TABS.find((t) => t.key === requested)?.key ?? "notas";

  const student = await db.student.findUnique({
    where: { id },
    include: {
      user: true,
      guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } },
      enrollments: {
        include: { course: { include: { academicYear: true, preceptor: true, subjects: { select: { teacherId: true } } } } },
        orderBy: { course: { academicYear: { year: "desc" } } },
      },
    },
  });
  if (!student) notFound();
  // La matrícula del ciclo activo (o la más reciente).
  const enrollment =
    student.enrollments.find((e) => e.course.academicYear.active && e.status === "ACTIVA") ?? student.enrollments[0];
  if (!enrollment || !canViewStudentProfile(user, enrollment.course)) redirect("/inicio");

  const summary = (await studentSummaries([enrollment.id])).get(enrollment.id)!;
  const { course } = enrollment;
  const staff = hasAnyRole(user, STAFF_ROLES);
  const canRegister = hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO"]) || course.preceptorId === user.id;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/cursos/${course.id}`} className="-mb-3 -ml-1.5 inline-flex w-fit items-center text-[15px] text-primary hover:opacity-80">
        <ChevronLeft className="size-5" aria-hidden />
        {courseLabel(course)}
      </Link>
      <div className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-[22px] font-semibold text-white">
          {initials(student.user)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[28px] leading-tight font-bold tracking-tight sm:text-[34px]">
            {student.user.firstName} {student.user.lastName}
          </h1>
          <p className="text-[15px] text-muted">
            {courseLabel(course)} · {course.academicYear.year} · Legajo {student.fileNumber} · DNI {formatDni(student.user.dni)}
            {enrollment.status !== "ACTIVA" && <Badge className="ml-2">{enrollment.status.toLowerCase()}</Badge>}
          </p>
        </div>
      </div>

      <SummaryStats summary={summary} />

      <nav className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.08]" aria-label="Secciones">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/alumnos/${id}?vista=${tab.key}`}
            scroll={false}
            aria-current={vista === tab.key ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 text-[14px] font-medium whitespace-nowrap transition-colors",
              vista === tab.key ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {vista === "notas" && <StudentReport enrollmentId={enrollment.id} />}
      {vista === "asistencia" && <StudentAttendance enrollmentId={enrollment.id} />}
      {vista === "convivencia" && <Incidents enrollmentId={enrollment.id} courseId={course.id} canRegister={canRegister} />}
      {vista === "familia" && (
        <section className="flex flex-col gap-3">
          {student.guardians.length === 0 ? (
            <Card className="text-sm text-muted">No tiene adultos responsables cargados.</Card>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {await Promise.all(
                  student.guardians.map(async ({ guardian, relationship, isPrimary }) => {
                    const messageable = await canMessage(user, guardian.id);
                    return (
                      <li key={guardian.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{fullName(guardian)}</p>
                          <p className="text-[13px] text-muted">
                            {RELATIONSHIP_LABELS[relationship]}
                            {isPrimary && " · Responsable principal"} · DNI {formatDni(guardian.dni)}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {guardian.phone && (
                            <a href={`tel:${guardian.phone.replace(/[^\d+]/g, "")}`} className="flex size-9 items-center justify-center rounded-full bg-surface-muted text-primary" title={guardian.phone}>
                              <Phone className="size-4" aria-hidden />
                              <span className="sr-only">Llamar al {guardian.phone}</span>
                            </a>
                          )}
                          {guardian.email && (
                            <a href={`mailto:${guardian.email}`} className="flex size-9 items-center justify-center rounded-full bg-surface-muted text-primary" title={guardian.email}>
                              <Mail className="size-4" aria-hidden />
                              <span className="sr-only">Escribir a {guardian.email}</span>
                            </a>
                          )}
                          {messageable && (
                            <Link
                              href={`/mensajes/nuevo?para=${guardian.id}`}
                              className="flex size-9 items-center justify-center rounded-full bg-surface-muted text-primary"
                              title="Enviar mensaje en Gradus"
                            >
                              <MessageCircle className="size-4" aria-hidden />
                              <span className="sr-only">Enviar mensaje</span>
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  }),
                )}
              </ul>
            </Card>
          )}
          {staff && (
            <Link href={`/personas/${student.userId}`} className="text-[15px] text-primary hover:underline">
              Editar datos del alumno y su familia
            </Link>
          )}
        </section>
      )}
    </div>
  );
}

async function Incidents({ enrollmentId, courseId, canRegister }: { enrollmentId: string; courseId: string; canRegister: boolean }) {
  const incidents = await db.incident.findMany({
    where: { enrollmentId },
    include: { createdBy: true, signatures: true },
    orderBy: { date: "desc" },
  });
  return (
    <section className="flex flex-col gap-3">
      {canRegister && (
        <div>
          <LinkButton href={`/convivencia/nueva?curso=${courseId}&alumno=${enrollmentId}`} variant="secondary">
            Registrar en convivencia
          </LinkButton>
        </div>
      )}
      {incidents.length === 0 ? (
        <Card className="text-sm text-muted">Sin registros de convivencia.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {incidents.map((incident) => (
              <li key={incident.id}>
                <Link href={`/convivencia/${incident.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-muted/60">
                  <span className="w-20 shrink-0 text-[13px] text-muted tabular-nums">{formatDate(incident.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <Badge tone={INCIDENT_TONE[incident.kind]}>{INCIDENT_LABELS[incident.kind]}</Badge>
                      {incident.requiresSignature && incident.signatures.length === 0 && <span className="text-[12px] text-muted">Sin firma de la familia</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[14px] text-muted">{incident.description}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

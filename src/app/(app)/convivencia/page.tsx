import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { INCIDENT_LABELS, INCIDENT_TONE } from "@/lib/discipline";
import { courseLabel, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Convivencia" };

function shortDate(date: Date) {
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default async function ConvivenciaPage({ searchParams }: { searchParams: Promise<{ curso?: string; tipo?: string }> }) {
  const user = await requireUser();
  const { curso, tipo } = await searchParams;
  const seesAll = hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO"]);
  const isStaffLike = seesAll || hasAnyRole(user, ["PRECEPTOR", "DOCENTE"]);

  const courseScope: Prisma.CourseWhereInput = seesAll
    ? { academicYear: { active: true } }
    : { academicYear: { active: true }, OR: [{ preceptorId: user.id }, { subjects: { some: { teacherId: user.id } } }] };
  const courses = isStaffLike ? await db.course.findMany({ where: courseScope, orderBy: [{ grade: "asc" }, { division: "asc" }] }) : [];

  const studentIds = [
    ...(await db.student.findMany({ where: { userId: user.id }, select: { id: true } })).map((s) => s.id),
    ...(await db.studentGuardian.findMany({ where: { guardianId: user.id }, select: { studentId: true } })).map((s) => s.studentId),
  ];

  const visible: Prisma.IncidentWhereInput = {
    OR: [
      ...(courses.length ? [{ enrollment: { courseId: { in: courses.map((c) => c.id) } } }] : []),
      ...(studentIds.length ? [{ enrollment: { studentId: { in: studentIds } } }] : []),
    ],
  };
  const incidents =
    visible.OR!.length === 0
      ? []
      : await db.incident.findMany({
          where: {
            AND: [
              visible,
              curso ? { enrollment: { courseId: curso } } : {},
              tipo && tipo in INCIDENT_LABELS ? { kind: tipo as keyof typeof INCIDENT_LABELS } : {},
            ],
          },
          include: {
            enrollment: { include: { course: true, student: { include: { user: true, guardians: true } } } },
            signatures: true,
            createdBy: true,
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 200,
        });
  const canRegister = hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO", "PRECEPTOR", "DOCENTE"]) && courses.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Convivencia"
        description="Observaciones, reconocimientos y sanciones"
        actions={canRegister && <LinkButton href="/convivencia/nueva">Registrar</LinkButton>}
      />

      {courses.length > 1 && (
        <form className="flex flex-wrap gap-2">
          <select name="curso" defaultValue={curso ?? ""} className="h-9 rounded-full bg-surface px-3.5 text-[14px] shadow-card" aria-label="Curso">
            <option value="">Todos los cursos</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {courseLabel(c)}
              </option>
            ))}
          </select>
          <select name="tipo" defaultValue={tipo ?? ""} className="h-9 rounded-full bg-surface px-3.5 text-[14px] shadow-card" aria-label="Tipo">
            <option value="">Todos los tipos</option>
            {Object.entries(INCIDENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="h-9 rounded-full bg-surface px-4 text-[14px] font-medium text-primary shadow-card hover:bg-surface-muted">
            Filtrar
          </button>
        </form>
      )}

      {incidents.length === 0 ? (
        <Card className="text-sm text-muted">No hay registros.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {incidents.map((incident) => {
              const { student, course } = incident.enrollment;
              const mustSign = incident.requiresSignature && student.guardians.some((g) => g.guardianId === user.id);
              const signed = incident.signatures.some((s) => s.userId === user.id);
              return (
                <li key={incident.id}>
                  <Link href={`/convivencia/${incident.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-surface-muted">
                    <span className="w-14 text-sm text-muted tabular-nums">{shortDate(incident.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {fullName(student.user)} <span className="text-sm font-normal text-muted">· {courseLabel(course)}</span>
                      </span>
                      <span className="block truncate text-sm text-muted">{incident.description}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={INCIDENT_TONE[incident.kind]}>{INCIDENT_LABELS[incident.kind]}</Badge>
                      {mustSign && !signed && <Badge tone="danger">Falta tu firma</Badge>}
                      {incident.requiresSignature && !mustSign && (
                        <span className="text-xs text-muted">
                          Firmas {incident.signatures.length}/{student.guardians.length}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

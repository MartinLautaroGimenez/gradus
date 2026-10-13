import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StudentReport } from "@/components/grades/student-report";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { courseLabel, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Notas" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function NotasPage({ searchParams }: { searchParams: Promise<{ alumno?: string }> }) {
  const user = await requireUser();
  const { alumno } = await searchParams;
  const year = await db.academicYear.findFirst({ where: { active: true } });
  if (!year) {
    return (
      <div>
        <PageHeader title="Notas" />
        <Card className="text-sm text-muted">No hay un ciclo lectivo activo.</Card>
      </div>
    );
  }

  const isTeacher = hasAnyRole(user, ["DOCENTE"]);
  const seesAll = hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO"]);
  const isPreceptor = hasAnyRole(user, ["PRECEPTOR"]);

  const [assignments, courses, ownEnrollment, children] = await Promise.all([
    isTeacher
      ? db.courseSubject.findMany({
          where: { teacherId: user.id, course: { academicYearId: year.id } },
          include: {
            subject: true,
            course: { include: { _count: { select: { enrollments: { where: { status: "ACTIVA" } } } } } },
            _count: { select: { assessments: true } },
          },
          orderBy: [{ course: { grade: "asc" } }, { course: { division: "asc" } }, { subject: { name: "asc" } }],
        })
      : [],
    seesAll || isPreceptor
      ? db.course.findMany({
          where: { academicYearId: year.id, ...(seesAll ? {} : { preceptorId: user.id }) },
          include: { subjects: { include: { subject: true, teacher: true }, orderBy: { subject: { name: "asc" } } } },
          orderBy: [{ grade: "asc" }, { division: "asc" }],
        })
      : [],
    hasAnyRole(user, ["ALUMNO"])
      ? db.enrollment.findFirst({
          where: { student: { userId: user.id }, course: { academicYearId: year.id }, status: "ACTIVA" },
          include: { course: true },
        })
      : null,
    hasAnyRole(user, ["TUTOR"])
      ? db.studentGuardian.findMany({
          where: { guardianId: user.id },
          include: {
            student: {
              include: {
                user: true,
                enrollments: { where: { course: { academicYearId: year.id }, status: "ACTIVA" }, include: { course: true } },
              },
            },
          },
          orderBy: { student: { user: { firstName: "asc" } } },
        })
      : [],
  ]);

  const child = children.find((c) => c.studentId === alumno) ?? children[0];
  const childEnrollment = child?.student.enrollments[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Notas" description={`Ciclo lectivo ${year.year}`} />

      {ownEnrollment && (
        <Section title={`Mis notas · ${courseLabel(ownEnrollment.course)}`}>
          <StudentReport enrollmentId={ownEnrollment.id} />
        </Section>
      )}

      {children.length > 0 && (
        <Section title="Notas de mis hijos">
          {children.length > 1 && (
            <nav className="flex flex-wrap gap-2" aria-label="Elegir alumno">
              {children.map((c) => (
                <Link
                  key={c.studentId}
                  href={`/notas?alumno=${c.studentId}`}
                  className={
                    c.studentId === child?.studentId
                      ? "rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
                      : "rounded-full border border-border bg-surface px-3 py-1 text-sm hover:bg-surface-muted"
                  }
                >
                  {c.student.user.firstName}
                </Link>
              ))}
            </nav>
          )}
          {child && (
            <p className="text-sm text-muted">
              {fullName(child.student.user)} {childEnrollment ? `· ${courseLabel(childEnrollment.course)}` : ""}
            </p>
          )}
          {childEnrollment ? (
            <StudentReport enrollmentId={childEnrollment.id} />
          ) : (
            <Card className="text-sm text-muted">No tiene matrícula activa este ciclo.</Card>
          )}
        </Section>
      )}

      {isTeacher && (
        <Section title="Mis planillas">
          {assignments.length === 0 ? (
            <Card className="text-sm text-muted">No tenés materias asignadas este ciclo.</Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assignments.map((a) => (
                <Link key={a.id} href={`/notas/${a.id}`} className="group">
                  <Card className="h-full transition-colors group-hover:border-primary">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle>{a.subject.name}</CardTitle>
                      <Badge tone="primary">{courseLabel(a.course)}</Badge>
                    </div>
                    <CardDescription className="mt-1">
                      {a.course._count.enrollments} alumnos · {a._count.assessments}{" "}
                      {a._count.assessments === 1 ? "evaluación" : "evaluaciones"}
                    </CardDescription>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </Section>
      )}

      {courses.length > 0 && (
        <Section title={seesAll ? "Planillas por curso" : "Planillas de mis cursos"}>
          <div className="grid gap-3 md:grid-cols-2">
            {courses.map((course) => (
              <Card key={course.id} className="p-0">
                <CardTitle className="border-b border-border px-5 py-3">{courseLabel(course)}</CardTitle>
                {course.subjects.length === 0 ? (
                  <p className="px-5 py-3 text-sm text-muted">Sin materias.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {course.subjects.map((cs) => (
                      <li key={cs.id}>
                        <Link
                          href={`/notas/${cs.id}`}
                          className="flex items-center justify-between gap-3 px-5 py-2 text-sm hover:bg-surface-muted"
                        >
                          <span className="font-medium">{cs.subject.name}</span>
                          <span className="text-xs text-muted">{cs.teacher ? fullName(cs.teacher) : "Sin docente"}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

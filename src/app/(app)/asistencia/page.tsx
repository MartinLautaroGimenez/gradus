import type { Metadata } from "next";
import Link from "next/link";
import { StudentAttendance } from "@/components/attendance/student-attendance";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { ALERT_LABELS, attendanceAlert, formatAbsences, isWeekend, nextSchoolDay, todayInMendoza } from "@/lib/attendance";
import { getAttendanceSettings, totalsByEnrollment } from "@/lib/attendance-server";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { courseLabel, fullName } from "@/lib/utils";
import { parseDate } from "@/lib/validation";

export const metadata: Metadata = { title: "Asistencia" };

export default async function AsistenciaPage({ searchParams }: { searchParams: Promise<{ alumno?: string }> }) {
  const user = await requireUser();
  const { alumno } = await searchParams;
  const year = await db.academicYear.findFirst({ where: { active: true } });
  if (!year) {
    return (
      <div>
        <PageHeader title="Asistencia" />
        <Card className="text-sm text-muted">No hay un ciclo lectivo activo.</Card>
      </div>
    );
  }

  const seesAll = hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO"]);
  let today = todayInMendoza();
  if (isWeekend(today)) today = nextSchoolDay(today, -1);
  const settings = await getAttendanceSettings();

  const courses =
    seesAll || hasAnyRole(user, ["PRECEPTOR", "DOCENTE"])
      ? await db.course.findMany({
          where: {
            academicYearId: year.id,
            ...(seesAll
              ? {}
              : { OR: [{ preceptorId: user.id }, { subjects: { some: { teacherId: user.id } } }] }),
          },
          include: {
            enrollments: { where: { status: "ACTIVA" }, include: { student: { include: { user: true } } } },
          },
          orderBy: [{ grade: "asc" }, { division: "asc" }],
        })
      : [];

  const enrollmentIds = courses.flatMap((c) => c.enrollments.map((e) => e.id));
  const [todayRecords, totals] = await Promise.all([
    db.attendanceRecord.findMany({ where: { date: parseDate(today)!, enrollmentId: { in: enrollmentIds } } }),
    totalsByEnrollment(enrollmentIds, settings),
  ]);
  const atRisk = courses
    .flatMap((course) =>
      course.enrollments.map((e) => ({ course, enrollment: e, total: totals.get(e.id)!.total })),
    )
    .filter((row) => attendanceAlert(row.total, settings.maxAbsences) !== "OK")
    .sort((a, b) => b.total - a.total);

  const [ownEnrollment, children] = await Promise.all([
    hasAnyRole(user, ["ALUMNO"])
      ? db.enrollment.findFirst({
          where: { student: { userId: user.id }, course: { academicYearId: year.id }, status: "ACTIVA" },
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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Asistencia" description={`Ciclo lectivo ${year.year} · Tope: ${settings.maxAbsences} inasistencias`} />

      {ownEnrollment && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Mi asistencia</h2>
          <StudentAttendance enrollmentId={ownEnrollment.id} />
        </section>
      )}

      {children.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Asistencia de mis hijos</h2>
          {children.length > 1 && (
            <nav className="flex flex-wrap gap-2" aria-label="Elegir alumno">
              {children.map((c) => (
                <Link
                  key={c.studentId}
                  href={`/asistencia?alumno=${c.studentId}`}
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
          {child?.student.enrollments[0] ? (
            <>
              <p className="text-sm text-muted">
                {fullName(child.student.user)} · {courseLabel(child.student.enrollments[0].course)}
              </p>
              <StudentAttendance enrollmentId={child.student.enrollments[0].id} />
            </>
          ) : (
            <Card className="text-sm text-muted">No tiene matrícula activa este ciclo.</Card>
          )}
        </section>
      )}

      {courses.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Cursos ·{" "}
            <span className="font-normal first-letter:uppercase text-muted">
              {new Date(`${today}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
            </span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const records = todayRecords.filter((r) => course.enrollments.some((e) => e.id === r.enrollmentId));
              const absent = records.filter((r) => r.status === "AUSENTE").length;
              return (
                <Link key={course.id} href={`/asistencia/${course.id}`} className="group">
                  <Card className="h-full transition-colors group-hover:border-primary">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-xl">{courseLabel(course)}</CardTitle>
                      {records.length > 0 ? <Badge tone="success">Tomada</Badge> : <Badge tone="warning">Pendiente</Badge>}
                    </div>
                    <CardDescription className="mt-1">
                      {course.enrollments.length} alumnos
                      {records.length > 0 && ` · ${absent} ${absent === 1 ? "ausente" : "ausentes"}`}
                    </CardDescription>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {atRisk.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Alumnos con muchas inasistencias</h2>
          <Table>
            <thead>
              <tr>
                <Th>Alumno</Th>
                <Th>Curso</Th>
                <Th className="text-right">Inasistencias</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {atRisk.map(({ course, enrollment, total }) => {
                const alert = attendanceAlert(total, settings.maxAbsences);
                return (
                  <tr key={enrollment.id}>
                    <Td className="font-medium">{fullName(enrollment.student.user)}</Td>
                    <Td>
                      <Link href={`/asistencia/${course.id}?mes=${today.slice(0, 7)}`} className="hover:text-primary hover:underline">
                        {courseLabel(course)}
                      </Link>
                    </Td>
                    <Td className="text-right font-semibold tabular-nums">
                      {formatAbsences(total)} / {settings.maxAbsences}
                    </Td>
                    <Td>
                      <Badge tone={alert === "ATENCION" ? "warning" : "danger"}>{ALERT_LABELS[alert]}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      )}
    </div>
  );
}

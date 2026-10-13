import "server-only";
import type { Role } from "@prisma/client";
import { type AttendanceAlert, attendanceAlert } from "@/lib/attendance";
import { getAttendanceSettings, totalsByEnrollment } from "@/lib/attendance-server";
import { hasAnyRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { isPassing, simpleAverage } from "@/lib/grades";
import { computeResults } from "@/lib/grading/results";

export type StudentSummary = {
  /** Promedio general: promedio de sus promedios por materia (hasta hoy). */
  average: number | null;
  failing: string[];
  absences: number;
  attendance: AttendanceAlert;
  maxAbsences: number;
  incidents: number;
  passingGrade: number;
  decimals: number;
};

/** Resumen de rendimiento de uno o más alumnos (por matrícula). */
export async function studentSummaries(enrollmentIds: string[]) {
  const enrollments = await db.enrollment.findMany({
    where: { id: { in: enrollmentIds } },
    include: {
      course: {
        include: {
          subjects: { include: { subject: true } },
          academicYear: { include: { periods: { orderBy: { order: "asc" } } } },
        },
      },
      _count: { select: { incidents: { where: { kind: { not: "RECONOCIMIENTO" } } } } },
    },
  });
  const settings = await getAttendanceSettings();
  const totals = await totalsByEnrollment(enrollmentIds, settings);
  const summaries = new Map<string, StudentSummary>();

  for (const enrollment of enrollments) {
    const { course } = enrollment;
    const { results, passingGrade, decimals } = await computeResults({
      courseSubjectIds: course.subjects.map((s) => s.id),
      enrollmentIds: [enrollment.id],
      periods: course.academicYear.periods,
    });
    const graded = course.subjects.flatMap((cs) => {
      const annual = results.get(cs.id)?.get(enrollment.id)?.result.annual ?? null;
      return annual === null ? [] : [{ name: cs.subject.name, annual }];
    });
    const absences = totals.get(enrollment.id)!.total;
    summaries.set(enrollment.id, {
      average: simpleAverage(
        graded.map((g) => g.annual),
        decimals,
      ),
      failing: graded.filter((g) => !isPassing(g.annual, passingGrade)).map((g) => g.name),
      absences,
      attendance: attendanceAlert(absences, settings.maxAbsences),
      maxAbsences: settings.maxAbsences,
      incidents: enrollment._count.incidents,
      passingGrade,
      decimals,
    });
  }
  return summaries;
}

/**
 * Ven la ficha completa de un alumno: dirección y administración (toda la
 * escuela), el preceptor del curso y los docentes del curso.
 */
export function canViewStudentProfile(
  actor: { id: string; roles: Role[] },
  course: { preceptorId: string | null; subjects: { teacherId: string | null }[] },
) {
  return (
    hasAnyRole(actor, ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO"]) ||
    course.preceptorId === actor.id ||
    course.subjects.some((s) => s.teacherId === actor.id)
  );
}

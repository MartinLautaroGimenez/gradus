import "server-only";
import { attendanceAlert, type AttendanceAlert } from "@/lib/attendance";
import { getAttendanceSettings, totalsByEnrollment } from "@/lib/attendance-server";
import { db } from "@/lib/db";
import { isPassing, simpleAverage } from "@/lib/grades";
import { computeResults } from "@/lib/grading/results";
import { courseLabel, fullName } from "@/lib/utils";

export type StudentRow = {
  enrollmentId: string;
  userId: string;
  name: string;
  course: string;
  courseId: string;
  /** Promedio general: promedio de sus promedios por materia (hasta hoy). */
  average: number | null;
  /** Materias con promedio por debajo de la nota de aprobación. */
  failing: string[];
  absences: number;
  attendance: AttendanceAlert;
  incidents: number;
};

/** Cuántas materias desaprobadas hacen que un alumno esté "en riesgo". */
export const RISK_FAILING_SUBJECTS = 3;

export function isAtRisk(row: StudentRow) {
  return row.failing.length >= RISK_FAILING_SUBJECTS || row.attendance === "CRITICO" || row.attendance === "LIBRE";
}

/**
 * Datos del tablero de la dirección para el ciclo activo. Si se pasan
 * cursos, se limita a ellos (preceptores).
 */
export async function loadSchoolReport(courseIds?: string[]) {
  const year = await db.academicYear.findFirst({
    where: { active: true },
    include: { periods: { orderBy: { order: "asc" } } },
  });
  if (!year) return null;

  const courses = await db.course.findMany({
    where: { academicYearId: year.id, ...(courseIds ? { id: { in: courseIds } } : {}) },
    include: {
      subjects: { include: { subject: true } },
      enrollments: {
        where: { status: "ACTIVA" },
        include: { student: { include: { user: true } }, _count: { select: { incidents: { where: { kind: { notIn: ["RECONOCIMIENTO"] } } } } } },
      },
    },
    orderBy: [{ grade: "asc" }, { division: "asc" }],
  });
  const enrollments = courses.flatMap((c) => c.enrollments);
  const settings = await getAttendanceSettings();
  const [{ results, passingGrade, decimals }, absences] = await Promise.all([
    computeResults({
      courseSubjectIds: courses.flatMap((c) => c.subjects.map((s) => s.id)),
      enrollmentIds: enrollments.map((e) => e.id),
      periods: year.periods,
    }),
    totalsByEnrollment(
      enrollments.map((e) => e.id),
      settings,
    ),
  ]);

  const students: StudentRow[] = [];
  const subjects: { id: string; label: string; course: string; average: number | null; failing: number; graded: number }[] = [];

  for (const course of courses) {
    for (const cs of course.subjects) {
      const annuals = course.enrollments
        .map((e) => results.get(cs.id)?.get(e.id)?.result.annual ?? null)
        .filter((v): v is number => v !== null);
      subjects.push({
        id: cs.id,
        label: `${cs.subject.name} · ${courseLabel(course)}`,
        course: courseLabel(course),
        average: simpleAverage(annuals, decimals),
        failing: annuals.filter((v) => !isPassing(v, passingGrade)).length,
        graded: annuals.length,
      });
    }
    for (const e of course.enrollments) {
      const perSubject = course.subjects.map((cs) => ({ name: cs.subject.name, annual: results.get(cs.id)?.get(e.id)?.result.annual ?? null }));
      const graded = perSubject.filter((s): s is { name: string; annual: number } => s.annual !== null);
      const total = absences.get(e.id)!.total;
      students.push({
        enrollmentId: e.id,
        userId: e.student.userId,
        name: fullName(e.student.user),
        course: courseLabel(course),
        courseId: course.id,
        average: simpleAverage(graded.map((s) => s.annual), decimals),
        failing: graded.filter((s) => !isPassing(s.annual, passingGrade)).map((s) => s.name),
        absences: total,
        attendance: attendanceAlert(total, settings.maxAbsences),
        incidents: e._count.incidents,
      });
    }
  }

  const courseRows = courses.map((course) => {
    const rows = students.filter((s) => s.courseId === course.id);
    return {
      id: course.id,
      label: courseLabel(course),
      students: rows.length,
      average: simpleAverage(rows.flatMap((r) => (r.average === null ? [] : [r.average])), decimals),
      absences: rows.length ? Math.round((rows.reduce((sum, r) => sum + r.absences, 0) / rows.length) * 100) / 100 : null,
      atRisk: rows.filter(isAtRisk).length,
    };
  });

  const allAnnuals = subjects.reduce((acc, s) => ({ failing: acc.failing + s.failing, graded: acc.graded + s.graded }), { failing: 0, graded: 0 });

  return {
    year,
    passingGrade,
    decimals,
    maxAbsences: settings.maxAbsences,
    students,
    subjects,
    courses: courseRows,
    kpis: {
      students: students.length,
      average: simpleAverage(students.flatMap((s) => (s.average === null ? [] : [s.average])), decimals),
      failingRate: allAnnuals.graded ? allAnnuals.failing / allAnnuals.graded : null,
      atRisk: students.filter(isAtRisk).length,
      attendanceAlerts: students.filter((s) => s.attendance !== "OK").length,
    },
  };
}

/** Cuántos alumnos caen en cada franja de promedio general. */
export function distribution(averages: number[]) {
  const buckets = [
    { label: "Menos de 4", from: 0, to: 4 },
    { label: "4 a 5", from: 4, to: 5 },
    { label: "5 a 6", from: 5, to: 6 },
    { label: "6 a 7", from: 6, to: 7 },
    { label: "7 a 8", from: 7, to: 8 },
    { label: "8 a 9", from: 8, to: 9 },
    { label: "9 a 10", from: 9, to: 10.01 },
  ];
  return buckets.map((b) => ({ ...b, count: averages.filter((a) => a >= b.from && a < b.to).length }));
}

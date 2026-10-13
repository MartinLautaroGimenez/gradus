import "server-only";
import type { GradingPeriod } from "@prisma/client";
import { db } from "@/lib/db";
import { type SubjectResult, periodAverage, subjectResult } from "@/lib/grades";

export type StudentSubjectResult = {
  /** Promedio por período (id de período → promedio o null). */
  periodAverages: Record<string, number | null>;
  result: SubjectResult;
};

export async function getSchoolGradeSettings() {
  const school = await db.school.findFirst();
  return {
    passingGrade: school ? Number(school.passingGrade) : 7,
    decimals: school?.gradeDecimals ?? 2,
  };
}

/**
 * Calcula promedios por período y el resultado final de cada alumno en cada
 * materia pedida. Todas las cuentas pasan por src/lib/grades.ts.
 */
export async function computeResults({
  courseSubjectIds,
  enrollmentIds,
  periods,
}: {
  courseSubjectIds: string[];
  /** Si se omite, todos los alumnos con nota. */
  enrollmentIds?: string[];
  periods: GradingPeriod[];
}) {
  const { passingGrade, decimals } = await getSchoolGradeSettings();
  const assessments = await db.assessment.findMany({
    where: { courseSubjectId: { in: courseSubjectIds } },
    include: { grades: enrollmentIds ? { where: { enrollmentId: { in: enrollmentIds } } } : true },
    orderBy: { position: "asc" },
  });

  const regular = periods.filter((p) => p.kind === "REGULAR").sort((a, b) => a.order - b.order);
  const compensatory = periods.filter((p) => p.kind === "COMPENSATORIO").sort((a, b) => a.order - b.order);
  const [december, february] = compensatory;

  const results = new Map<string, Map<string, StudentSubjectResult>>();
  for (const courseSubjectId of courseSubjectIds) {
    const own = assessments.filter((a) => a.courseSubjectId === courseSubjectId);
    const students = new Set(enrollmentIds ?? own.flatMap((a) => a.grades.map((g) => g.enrollmentId)));
    const byStudent = new Map<string, StudentSubjectResult>();

    for (const enrollmentId of students) {
      const periodAverages: Record<string, number | null> = {};
      for (const period of periods) {
        const columns = own.filter((a) => a.periodId === period.id);
        periodAverages[period.id] = periodAverage(
          columns.map((a) => ({ id: a.id, weight: Number(a.weight) })),
          (assessmentId) => {
            const grade = columns.find((a) => a.id === assessmentId)?.grades.find((g) => g.enrollmentId === enrollmentId);
            if (!grade) return { kind: "empty" };
            if (grade.absent) return { kind: "absent" };
            return grade.value === null ? { kind: "empty" } : { kind: "value", value: Number(grade.value) };
          },
          decimals,
        );
      }

      byStudent.set(enrollmentId, {
        periodAverages,
        result: subjectResult({
          regular: regular.map((p) => periodAverages[p.id]),
          regularComplete: regular.length > 0 && regular.every((p) => p.closed),
          december: december ? periodAverages[december.id] : null,
          february: february ? periodAverages[february.id] : null,
          decemberClosed: december?.closed ?? true,
          februaryClosed: february?.closed ?? true,
          passingGrade,
          decimals,
        }),
      });
    }
    results.set(courseSubjectId, byStudent);
  }

  return { results, passingGrade, decimals, assessments };
}

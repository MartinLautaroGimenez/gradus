import { ChevronDown } from "lucide-react";
import { db } from "@/lib/db";
import { FINAL_STATUS_LABELS, formatGrade, gradeToText, isPassing } from "@/lib/grades";
import { computeResults } from "@/lib/grading/results";
import { ASSESSMENT_KIND_LABELS } from "@/lib/grading/types";
import { cn, fullName } from "@/lib/utils";

/**
 * Boletín en pantalla de un alumno: promedio por período, anual, instancias y
 * estado de cada materia, con el detalle de cada evaluación. Las notas se ven
 * apenas el docente las carga.
 */
export async function StudentReport({ enrollmentId }: { enrollmentId: string }) {
  const enrollment = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: {
        include: {
          academicYear: { include: { periods: { orderBy: { order: "asc" } } } },
          subjects: { include: { subject: true, teacher: true }, orderBy: { subject: { name: "asc" } } },
        },
      },
    },
  });
  if (!enrollment) return null;
  const { course } = enrollment;
  const periods = course.academicYear.periods;

  const { results, passingGrade, decimals, assessments } = await computeResults({
    courseSubjectIds: course.subjects.map((s) => s.id),
    enrollmentIds: [enrollmentId],
    periods,
  });

  if (course.subjects.length === 0) {
    return <p className="rounded-2xl bg-surface shadow-card p-5 text-sm text-muted">El curso todavía no tiene materias.</p>;
  }

  const show = (value: number | null) => (
    <span className={cn(value !== null && !isPassing(value, passingGrade) && "text-danger")}>
      {value === null ? "—" : formatGrade(value, decimals)}
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
      {course.subjects.map((cs) => {
        const { periodAverages, result } = results.get(cs.id)!.get(enrollmentId)!;
        const own = assessments.filter((a) => a.courseSubjectId === cs.id);
        const periodLine = periods
          .filter((p) => periodAverages[p.id] !== null)
          .map((p) => `${p.name.replace(" Cuatrimestre", " C.")}: ${formatGrade(periodAverages[p.id], decimals)}`)
          .join(" · ");
        return (
          <details key={cs.id} className="group border-b border-border last:border-0">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted/60 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{cs.subject.name}</p>
                <p className="truncate text-[13px] text-muted">{periodLine || (cs.teacher ? fullName(cs.teacher) : "Sin notas todavía")}</p>
              </div>
              <div className="text-right">
                <p className="text-[20px] leading-tight font-semibold tabular-nums">{show(result.annual)}</p>
                <p className={cn("text-[12px]", result.status === "APROBADA" ? "text-success" : result.status === "EN_CURSO" ? "text-muted" : "text-danger")}>
                  {result.status === "EN_CURSO" ? "Promedio hasta hoy" : FINAL_STATUS_LABELS[result.status]}
                </p>
              </div>
              <ChevronDown className="size-4 shrink-0 text-muted/70 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="bg-surface-muted/50 px-5 py-3">
              {cs.teacher && <p className="mb-2 text-[13px] text-muted">Docente: {fullName(cs.teacher)}</p>}
              {own.length === 0 ? (
                <p className="text-[14px] text-muted">Todavía no hay evaluaciones.</p>
              ) : (
                periods.map((p) => {
                  const list = own.filter((a) => a.periodId === p.id);
                  if (list.length === 0) return null;
                  return (
                    <div key={p.id} className="mb-3 last:mb-0">
                      <h4 className="mb-1 text-[13px] font-medium text-muted">{p.name}</h4>
                      <ul className="divide-y divide-border text-[14px]">
                        {list.map((a) => {
                          const grade = a.grades[0];
                          const text = gradeToText(
                            grade ? { value: grade.value === null ? null : Number(grade.value), absent: grade.absent } : undefined,
                          );
                          const failing = grade?.value != null && !isPassing(Number(grade.value), passingGrade);
                          return (
                            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                              <span className="min-w-0">
                                <span className="block truncate">{a.title}</span>
                                <span className="block text-[12px] text-muted">
                                  {ASSESSMENT_KIND_LABELS[a.kind]}
                                  {a.date && ` · ${a.date.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "UTC" })}`}
                                </span>
                              </span>
                              <span className={cn("font-semibold tabular-nums", failing && "text-danger", !text && "font-normal text-muted")}>
                                {text === "A" ? "Ausente" : text || "—"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          </details>
        );
      })}
      </div>
      <p className="px-1 text-[13px] text-muted">
        Se aprueba con {formatGrade(passingGrade, 0)}. El promedio anual es el de los dos cuatrimestres. Tocá una materia para ver cada nota.
      </p>
    </div>
  );
}

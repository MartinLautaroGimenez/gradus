import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { FINAL_STATUS_LABELS, type FinalStatus, formatGrade, gradeToText, isPassing } from "@/lib/grades";
import { computeResults } from "@/lib/grading/results";
import { ASSESSMENT_KIND_LABELS } from "@/lib/grading/types";
import { cn, fullName } from "@/lib/utils";

const STATUS_TONE: Record<FinalStatus, "success" | "warning" | "danger" | "neutral"> = {
  APROBADA: "success",
  DICIEMBRE: "warning",
  FEBRERO: "warning",
  PREVIA: "danger",
  EN_CURSO: "neutral",
};

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
    return <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">El curso todavía no tiene materias.</p>;
  }

  const show = (value: number | null) => (
    <span className={cn(value !== null && !isPassing(value, passingGrade) && "text-danger")}>
      {value === null ? "—" : formatGrade(value, decimals)}
    </span>
  );

  return (
    <div className="flex flex-col gap-2">
      {course.subjects.map((cs) => {
        const { periodAverages, result } = results.get(cs.id)!.get(enrollmentId)!;
        const own = assessments.filter((a) => a.courseSubjectId === cs.id);
        return (
          <details key={cs.id} className="group rounded-xl border border-border bg-surface open:shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div className="min-w-40 flex-1">
                <p className="font-medium">{cs.subject.name}</p>
                <p className="text-xs text-muted">{cs.teacher ? fullName(cs.teacher) : "Sin docente asignado"}</p>
              </div>
              <dl className="flex flex-wrap gap-4 text-center text-sm tabular-nums">
                {periods
                  .filter((p) => p.kind === "REGULAR" || periodAverages[p.id] !== null)
                  .map((p) => (
                    <div key={p.id}>
                      <dt className="text-[10px] font-medium uppercase text-muted">{p.name.replace("Cuatrimestre", "C.")}</dt>
                      <dd>{show(periodAverages[p.id])}</dd>
                    </div>
                  ))}
                <div>
                  {/* Mientras el año está en curso es el promedio hasta hoy, no el anual definitivo. */}
                  <dt className="text-[10px] font-medium uppercase text-muted">
                    {result.status === "EN_CURSO" ? "Promedio" : "Anual"}
                  </dt>
                  <dd className="font-semibold">{show(result.annual)}</dd>
                </div>
              </dl>
              <Badge tone={STATUS_TONE[result.status]} className="w-20 justify-center">
                {FINAL_STATUS_LABELS[result.status]}
              </Badge>
            </summary>
            <div className="border-t border-border px-4 py-3">
              {own.length === 0 ? (
                <p className="text-sm text-muted">Todavía no hay evaluaciones.</p>
              ) : (
                periods.map((p) => {
                  const list = own.filter((a) => a.periodId === p.id);
                  if (list.length === 0) return null;
                  return (
                    <div key={p.id} className="mb-3 last:mb-0">
                      <h4 className="mb-1 text-xs font-semibold uppercase text-muted">{p.name}</h4>
                      <ul className="divide-y divide-border text-sm">
                        {list.map((a) => {
                          const grade = a.grades[0];
                          const text = gradeToText(
                            grade ? { value: grade.value === null ? null : Number(grade.value), absent: grade.absent } : undefined,
                          );
                          const failing = grade?.value != null && !isPassing(Number(grade.value), passingGrade);
                          return (
                            <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                              <span>
                                {a.title}
                                <span className="ml-2 text-xs text-muted">
                                  {ASSESSMENT_KIND_LABELS[a.kind]}
                                  {a.date && ` · ${a.date.toLocaleDateString("es-AR", { timeZone: "UTC" })}`}
                                </span>
                              </span>
                              <span className={cn("font-medium tabular-nums", failing && "text-danger", !text && "text-muted")}>
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
      <p className="mt-2 text-xs text-muted">
        Se aprueba con {formatGrade(passingGrade, 0)}. El promedio anual es el de los dos cuatrimestres. Tocá una materia para ver cada nota.
      </p>
    </div>
  );
}

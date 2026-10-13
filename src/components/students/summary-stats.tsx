import { ALERT_LABELS, formatAbsences } from "@/lib/attendance";
import { formatGrade } from "@/lib/grades";
import type { StudentSummary } from "@/lib/student-summary";
import { cn } from "@/lib/utils";

/** Los cuatro números que importan de un alumno, en tarjetas simples. */
export function SummaryStats({ summary, compact = false }: { summary: StudentSummary; compact?: boolean }) {
  const averageLow = summary.average !== null && summary.average < summary.passingGrade;
  // En la versión compacta (tarjetas de los hijos en el celular) los textos van cortos.
  const stats = [
    {
      label: compact ? "Promedio" : "Promedio general",
      value: summary.average === null ? "—" : formatGrade(summary.average, summary.decimals),
      note:
        summary.average === null
          ? "Sin notas"
          : averageLow
            ? `Menos de ${formatGrade(summary.passingGrade, 0)}`
            : "Hasta hoy",
      warn: averageLow,
    },
    {
      label: compact ? `Abajo de ${formatGrade(summary.passingGrade, 0)}` : "Materias abajo",
      value: String(summary.failing.length),
      note: compact
        ? summary.failing.length === 1
          ? "materia"
          : "materias"
        : summary.failing.length
          ? summary.failing.slice(0, 2).join(", ") + (summary.failing.length > 2 ? "…" : "")
          : "Ninguna",
      warn: summary.failing.length > 0,
    },
    {
      label: compact ? "Faltas" : "Inasistencias",
      value: formatAbsences(summary.absences),
      note: summary.attendance === "OK" ? `de ${summary.maxAbsences}${compact ? "" : " permitidas"}` : ALERT_LABELS[summary.attendance],
      warn: summary.attendance !== "OK",
    },
    ...(compact
      ? []
      : [
          {
            label: "Convivencia",
            value: String(summary.incidents),
            note: summary.incidents === 1 ? "registro" : "registros",
            warn: summary.incidents > 0,
          },
        ]),
  ];
  return (
    <dl className={cn("grid gap-3", compact ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4")}>
      {stats.map((stat) => (
        <div key={stat.label} className={cn("rounded-2xl", compact ? "bg-surface-muted p-3" : "bg-surface p-4 shadow-card")}>
          <dt className="text-[13px] text-muted">{stat.label}</dt>
          <dd className={cn("mt-0.5 font-semibold tracking-tight tabular-nums", compact ? "text-[22px]" : "text-[28px]", stat.warn && "text-danger")}>
            {stat.value}
          </dd>
          <dd className="truncate text-[12px] text-muted">{stat.note}</dd>
        </div>
      ))}
    </dl>
  );
}

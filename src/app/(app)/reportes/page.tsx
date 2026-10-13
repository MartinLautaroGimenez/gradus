import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { ALERT_LABELS, formatAbsences } from "@/lib/attendance";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { formatGrade } from "@/lib/grades";
import { RISK_FAILING_SUBJECTS, distribution, isAtRisk, loadSchoolReport } from "@/lib/reports";
import { managedCourses } from "@/lib/scope";

export const metadata: Metadata = { title: "Reportes" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ curso?: string }> }) {
  const user = await requireRole(["SUPERADMIN", "DIRECTIVO", "PRECEPTOR"]);
  const { curso } = await searchParams;
  const limited = !hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO"]);
  const scope = limited ? (await managedCourses(user)).filter((c) => c.preceptorId === user.id).map((c) => c.id) : undefined;
  const report = await loadSchoolReport(scope);

  if (!report) {
    return (
      <div>
        <PageHeader title="Reportes" />
        <Card className="text-sm text-muted">No hay un ciclo lectivo activo.</Card>
      </div>
    );
  }
  const { kpis, passingGrade, decimals, maxAbsences } = report;
  const grade = (v: number | null) => (v === null ? "—" : formatGrade(v, decimals));
  const risky = report.students.filter(isAtRisk).filter((s) => !curso || s.courseId === curso);
  const worstSubjects = report.subjects
    .filter((s) => s.graded > 0)
    .map((s) => ({ ...s, rate: s.failing / s.graded }))
    .sort((a, b) => b.rate - a.rate || a.label.localeCompare(b.label))
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reportes"
        description={`Ciclo lectivo ${report.year.year}${limited ? " · tus cursos" : ""} · promedios hasta hoy`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Promedio general" value={grade(kpis.average)} hint={`${kpis.students} alumnos · aprueba con ${formatGrade(passingGrade, 0)}`} />
        <Stat
          label="Materias por debajo de la nota de aprobación"
          value={kpis.failingRate === null ? "—" : `${Math.round(kpis.failingRate * 100)} %`}
          hint="Sobre todas las materias con notas"
        />
        <Stat label="Alumnos en riesgo" value={String(kpis.atRisk)} hint={`${RISK_FAILING_SUBJECTS}+ materias abajo o cerca del tope de faltas`} />
        <Stat label="Alertas de asistencia" value={String(kpis.attendanceAlerts)} hint={`Desde el 75 % de ${maxAbsences} faltas`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>Promedio general por curso</CardTitle>
            <CardDescription>Promedio de los promedios de cada alumno. La línea marca la nota de aprobación.</CardDescription>
          </div>
          <div className="pt-4">
            <BarList
              valueHeader="Promedio"
              max={10}
              reference={{ value: passingGrade, label: `Aprueba con ${formatGrade(passingGrade, 0)}` }}
              items={report.courses.map((c) => ({
                key: c.id,
                label: c.label,
                value: c.average,
                display: grade(c.average),
                href: `/reportes?curso=${c.id}#riesgo`,
                details: [`${c.students} alumnos`, `${c.atRisk} en riesgo`, `${c.absences === null ? "—" : formatAbsences(c.absences)} faltas promedio`],
              }))}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>Distribución de promedios</CardTitle>
            <CardDescription>Cuántos alumnos hay en cada franja de promedio general.</CardDescription>
          </div>
          <ColumnChart
            items={distribution(report.students.flatMap((s) => (s.average === null ? [] : [s.average])))}
            unit={["alumno", "alumnos"]}
            highlightFrom={passingGrade}
            caption={`En negrita, las franjas desde ${formatGrade(passingGrade, 0)} (aprobado).`}
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>Materias con más alumnos por debajo de {formatGrade(passingGrade, 0)}</CardTitle>
            <CardDescription>Porcentaje de alumnos del curso con promedio menor a la nota de aprobación.</CardDescription>
          </div>
          <BarList
            valueHeader="% abajo"
            max={100}
            items={worstSubjects.map((s) => ({
              key: s.id,
              label: s.label,
              value: Math.round(s.rate * 100),
              display: `${Math.round(s.rate * 100)} %`,
              href: `/notas/${s.id}?periodo=resumen`,
              details: [`${s.failing} de ${s.graded} alumnos`, `Promedio de la materia: ${grade(s.average)}`],
            }))}
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>Inasistencias promedio por alumno</CardTitle>
            <CardDescription>Por curso, en lo que va del ciclo. La línea marca el 75 % del tope.</CardDescription>
          </div>
          <div className="pt-4">
            <BarList
              valueHeader="Faltas promedio"
              max={maxAbsences}
              reference={{ value: maxAbsences * 0.75, label: `75 % del tope (${formatAbsences(maxAbsences * 0.75)})` }}
              items={report.courses.map((c) => ({
                key: c.id,
                label: c.label,
                value: c.absences,
                display: c.absences === null ? "—" : formatAbsences(c.absences),
                href: `/asistencia/${c.id}?mes=${new Date().toISOString().slice(0, 7)}`,
                details: [`${c.students} alumnos`, `Tope: ${maxAbsences} inasistencias`],
              }))}
            />
          </div>
        </Card>
      </div>

      <section id="riesgo" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Alumnos en riesgo</h2>
            <p className="text-sm text-muted">
              {RISK_FAILING_SUBJECTS} o más materias por debajo de {formatGrade(passingGrade, 0)}, o inasistencias cerca del tope.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex gap-2">
              <select name="curso" defaultValue={curso ?? ""} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm" aria-label="Curso">
                <option value="">Todos los cursos</option>
                {report.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-9 rounded-lg border border-border bg-surface px-3 text-sm hover:bg-surface-muted">
                Filtrar
              </button>
            </form>
            <a
              href={`/reportes/exportar${curso ? `?curso=${curso}` : ""}`}
              download
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-muted"
            >
              <Download className="size-4" aria-hidden /> Excel (CSV)
            </a>
          </div>
        </div>
        {risky.length === 0 ? (
          <Card className="text-sm text-muted">No hay alumnos en riesgo.</Card>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Alumno</Th>
                <Th>Curso</Th>
                <Th className="text-right">Promedio</Th>
                <Th>Materias abajo</Th>
                <Th className="text-right">Faltas</Th>
                <Th className="hidden text-right md:table-cell">Convivencia</Th>
              </tr>
            </thead>
            <tbody>
              {risky
                .sort((a, b) => b.failing.length - a.failing.length || b.absences - a.absences)
                .map((s) => (
                  <tr key={s.enrollmentId}>
                    <Td className="font-medium">
                      {limited ? (
                        s.name
                      ) : (
                        <Link href={`/personas/${s.userId}`} className="hover:text-primary hover:underline">
                          {s.name}
                        </Link>
                      )}
                    </Td>
                    <Td>{s.course}</Td>
                    <Td className="text-right tabular-nums">{grade(s.average)}</Td>
                    <Td className="text-sm">
                      {s.failing.length > 0 ? (
                        <span title={s.failing.join(", ")}>
                          <span className="font-semibold">{s.failing.length}</span>
                          <span className="text-muted"> · {s.failing.slice(0, 3).join(", ")}{s.failing.length > 3 ? "…" : ""}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <span className="tabular-nums">{formatAbsences(s.absences)}</span>
                      {s.attendance !== "OK" && (
                        <Badge tone={s.attendance === "ATENCION" ? "warning" : "danger"} className="ml-2">
                          {ALERT_LABELS[s.attendance]}
                        </Badge>
                      )}
                    </Td>
                    <Td className="hidden text-right tabular-nums md:table-cell">{s.incidents || "—"}</Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

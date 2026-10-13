import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { FINAL_STATUS_LABELS, type FinalStatus, formatGrade, gradeToText, isPassing } from "@/lib/grades";
import { canEditGrades, canViewGrades } from "@/lib/grading/permissions";
import { computeResults } from "@/lib/grading/results";
import { cellKey } from "@/lib/grading/types";
import { cn, courseLabel, fullName } from "@/lib/utils";
import { GradeSheet } from "./grade-sheet";

export const metadata: Metadata = { title: "Planilla de notas" };

const STATUS_TONE: Record<FinalStatus, "success" | "warning" | "danger" | "neutral"> = {
  APROBADA: "success",
  DICIEMBRE: "warning",
  FEBRERO: "warning",
  PREVIA: "danger",
  EN_CURSO: "neutral",
};

export default async function PlanillaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { periodo } = await searchParams;

  const sheet = await db.courseSubject.findUnique({
    where: { id },
    include: {
      subject: true,
      teacher: true,
      course: {
        include: {
          academicYear: { include: { periods: { orderBy: { order: "asc" } } } },
          enrollments: {
            where: { status: "ACTIVA" },
            include: { student: { include: { user: true } } },
            orderBy: { listNumber: "asc" },
          },
        },
      },
    },
  });
  if (!sheet) notFound();
  if (!canViewGrades(user, sheet)) redirect("/notas");

  const { course } = sheet;
  const periods = course.academicYear.periods;
  const showSummary = periodo === "resumen";
  // Por defecto se abre el período en curso (el primero sin cerrar).
  const period = showSummary
    ? null
    : (periods.find((p) => p.id === periodo) ?? periods.find((p) => !p.closed) ?? periods[0]);
  const canEdit = canEditGrades(user, sheet) && !!period && !period.closed;

  const students = course.enrollments.map((e) => ({
    enrollmentId: e.id,
    listNumber: e.listNumber,
    name: fullName(e.student.user),
  }));
  const { results, passingGrade, decimals, assessments } = await computeResults({
    courseSubjectIds: [sheet.id],
    enrollmentIds: students.map((s) => s.enrollmentId),
    periods,
  });
  const resultFor = (enrollmentId: string) => results.get(sheet.id)!.get(enrollmentId)!;

  const regular = periods.filter((p) => p.kind === "REGULAR");
  const regularComplete = regular.length > 0 && regular.every((p) => p.closed);
  const [december] = periods.filter((p) => p.kind === "COMPENSATORIO");

  // En las instancias compensatorias sólo aparecen quienes las tienen que rendir.
  let sheetStudents = students;
  let compensatoryNote: string | null = null;
  if (period?.kind === "COMPENSATORIO") {
    const withGrades = new Set(
      assessments.filter((a) => a.periodId === period.id).flatMap((a) => a.grades.map((g) => g.enrollmentId)),
    );
    const isDecember = period.id === december?.id;
    sheetStudents = students.filter((s) => {
      if (withGrades.has(s.enrollmentId)) return true;
      const { result } = resultFor(s.enrollmentId);
      return isDecember ? result.status === "DICIEMBRE" : result.status === "FEBRERO";
    });
    if (!regularComplete) {
      compensatoryNote = "La lista de esta instancia se arma cuando la dirección cierra los dos cuatrimestres.";
    } else if (!isDecember && december && !december.closed) {
      compensatoryNote = "La lista de febrero se arma cuando la dirección cierra la instancia de diciembre.";
    }
  }

  const periodAssessments = period ? assessments.filter((a) => a.periodId === period.id) : [];
  const grades: Record<string, string> = {};
  for (const assessment of periodAssessments) {
    for (const grade of assessment.grades) {
      grades[cellKey(assessment.id, grade.enrollmentId)] = gradeToText({
        value: grade.value === null ? null : Number(grade.value),
        absent: grade.absent,
      });
    }
  }

  const tabClass = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap",
      active ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface-muted hover:text-foreground",
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${sheet.subject.name} · ${courseLabel(course)}`}
        description={`${course.academicYear.year} · ${sheet.teacher ? `Docente: ${fullName(sheet.teacher)}` : "Sin docente asignado"} · Aprueba con ${formatGrade(passingGrade, 0)}`}
        back={{ href: "/notas", label: "Notas" }}
        actions={
          <a
            href={`/notas/${sheet.id}/exportar`}
            download
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
          >
            <Download className="size-4" aria-hidden /> Descargar Excel
          </a>
        }
      />

      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Períodos">
        {periods.map((p) => (
          <Link key={p.id} href={`/notas/${sheet.id}?periodo=${p.id}`} className={tabClass(p.id === period?.id)}>
            {p.closed && <Lock className="size-3.5" aria-label="Cerrado" />}
            {p.name}
          </Link>
        ))}
        <Link href={`/notas/${sheet.id}?periodo=resumen`} className={tabClass(showSummary)}>
          Resumen anual
        </Link>
      </nav>

      {period && (
        <>
          {period.closed ? (
            <p className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">
              <Lock className="size-4" aria-hidden /> {period.name} está cerrado: la planilla es de sólo lectura.
            </p>
          ) : (
            !canEditGrades(user, sheet) && (
              <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">Sólo lectura: carga notas el docente de la materia.</p>
            )
          )}
          {compensatoryNote && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{compensatoryNote}</p>
          )}
          <GradeSheet
            // Al cambiar de período se arma una planilla nueva.
            key={period.id}
            courseSubjectId={sheet.id}
            periodId={period.id}
            canEdit={canEdit}
            passingGrade={passingGrade}
            decimals={decimals}
            students={sheetStudents}
            assessments={periodAssessments.map((a) => ({
              id: a.id,
              title: a.title,
              kind: a.kind,
              date: a.date ? a.date.toISOString().slice(0, 10) : null,
              weight: Number(a.weight),
            }))}
            grades={grades}
          />
          {canEdit && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Atajos de teclado</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                <li>Escribí una nota y Enter para bajar, Tab para ir a la derecha</li>
                <li>“A” = ausente (no cuenta en el promedio). Se acepta 7,5 o 7.5</li>
                <li>F2 o doble clic: editar la celda sin borrarla</li>
                <li>Shift + flechas o arrastrar: seleccionar varias celdas</li>
                <li>Supr: borrar la selección</li>
                <li>Ctrl+C / Ctrl+V: copiar y pegar, también desde Excel</li>
                <li>Pegar un valor con varias celdas seleccionadas lo copia en todas</li>
                <li>Ctrl+Z / Ctrl+Y: deshacer y rehacer</li>
              </ul>
            </details>
          )}
        </>
      )}

      {showSummary && (
        <>
          <Table>
            <thead>
              <tr>
                <Th className="w-10">N°</Th>
                <Th>Alumno</Th>
                {periods.map((p) => (
                  <Th key={p.id} className="text-center">
                    {p.name.replace("Cuatrimestre", "C.")}
                  </Th>
                ))}
                <Th className="text-center">Anual</Th>
                <Th className="text-center">Final</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const { periodAverages, result } = resultFor(student.enrollmentId);
                const cell = (value: number | null) => (
                  <span className={cn(value !== null && !isPassing(value, passingGrade) && "text-danger")}>
                    {value === null ? "—" : formatGrade(value, decimals)}
                  </span>
                );
                return (
                  <tr key={student.enrollmentId}>
                    <Td className="text-xs tabular-nums text-muted">{student.listNumber}</Td>
                    <Td className="font-medium whitespace-nowrap">{student.name}</Td>
                    {periods.map((p) => (
                      <Td key={p.id} className="text-center tabular-nums">
                        {cell(periodAverages[p.id])}
                      </Td>
                    ))}
                    <Td className="text-center font-semibold tabular-nums">{cell(result.annual)}</Td>
                    <Td className="text-center font-semibold tabular-nums">{cell(result.finalGrade)}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[result.status]}>{FINAL_STATUS_LABELS[result.status]}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="text-xs text-muted">
            Anual = promedio de los cuatrimestres tal como se muestran. Aprueba con {formatGrade(passingGrade, 0)} o más; si no,
            rinde en diciembre y después en febrero. El estado final se define cuando la dirección cierra cada período.
          </p>
        </>
      )}
    </div>
  );
}

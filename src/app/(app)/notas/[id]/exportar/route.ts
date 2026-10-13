import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { FINAL_STATUS_LABELS, isPassing, periodAverage } from "@/lib/grades";
import { canViewGrades } from "@/lib/grading/permissions";
import { computeResults } from "@/lib/grading/results";
import { courseLabel, fullName } from "@/lib/utils";

const RED = { argb: "FFC92A2A" };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDFF" } };

/** Descarga la planilla de una materia como Excel: una hoja por período y un resumen anual. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("No autorizado", { status: 401 });
  const { id } = await params;

  const sheet = await db.courseSubject.findUnique({
    where: { id },
    include: {
      subject: true,
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
  if (!sheet || !canViewGrades(user, sheet)) return new Response("No encontrado", { status: 404 });

  const { course } = sheet;
  const periods = course.academicYear.periods;
  const students = course.enrollments;
  const { results, passingGrade, decimals, assessments } = await computeResults({
    courseSubjectIds: [sheet.id],
    enrollmentIds: students.map((s) => s.id),
    periods,
  });
  const numFmt = decimals === 0 ? "0" : `0.${"0".repeat(decimals)}`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gradus";

  function styleHeader(row: ExcelJS.Row) {
    row.font = { bold: true };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.eachCell((cell) => (cell.fill = HEADER_FILL));
  }
  function gradeCell(cell: ExcelJS.Cell, value: number | null, format = numFmt) {
    cell.value = value;
    cell.numFmt = format;
    cell.alignment = { horizontal: "center" };
    if (value !== null && !isPassing(value, passingGrade)) cell.font = { color: RED };
  }

  // El resumen va primero: el orden de las hojas es el orden en que se crean.
  const summary = workbook.addWorksheet("Resumen", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });

  for (const period of periods) {
    const columns = assessments.filter((a) => a.periodId === period.id);
    if (columns.length === 0) continue;
    const ws = workbook.addWorksheet(period.name.slice(0, 31), { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
    ws.columns = [
      { width: 5 },
      { width: 32 },
      ...columns.map(() => ({ width: 14 })),
      { width: 12 },
    ];
    styleHeader(ws.addRow(["N°", "Alumno", ...columns.map((a) => (Number(a.weight) === 1 ? a.title : `${a.title} (×${Number(a.weight)})`)), "Promedio"]));

    for (const enrollment of students) {
      const row = ws.addRow([enrollment.listNumber, fullName(enrollment.student.user)]);
      columns.forEach((a, i) => {
        const grade = a.grades.find((g) => g.enrollmentId === enrollment.id);
        const cell = row.getCell(3 + i);
        if (grade?.absent) {
          cell.value = "A";
          cell.alignment = { horizontal: "center" };
        } else {
          // Las notas cargadas se exportan tal cual (hasta 2 decimales).
          gradeCell(cell, grade?.value == null ? null : Number(grade.value), "0.##");
        }
      });
      const average = periodAverage(
        columns.map((a) => ({ id: a.id, weight: Number(a.weight) })),
        (assessmentId) => {
          const grade = columns.find((a) => a.id === assessmentId)!.grades.find((g) => g.enrollmentId === enrollment.id);
          if (!grade || grade.absent || grade.value === null) return { kind: "empty" };
          return { kind: "value", value: Number(grade.value) };
        },
        decimals,
      );
      const cell = row.getCell(3 + columns.length);
      gradeCell(cell, average);
      cell.font = { ...cell.font, bold: true };
    }
  }

  summary.columns = [{ width: 5 }, { width: 32 }, ...periods.map(() => ({ width: 14 })), { width: 10 }, { width: 10 }, { width: 12 }];
  styleHeader(summary.addRow(["N°", "Alumno", ...periods.map((p) => p.name), "Anual", "Final", "Estado"]));
  for (const enrollment of students) {
    const { periodAverages, result } = results.get(sheet.id)!.get(enrollment.id)!;
    const row = summary.addRow([enrollment.listNumber, fullName(enrollment.student.user)]);
    periods.forEach((p, i) => gradeCell(row.getCell(3 + i), periodAverages[p.id]));
    gradeCell(row.getCell(3 + periods.length), result.annual);
    gradeCell(row.getCell(4 + periods.length), result.finalGrade);
    row.getCell(5 + periods.length).value = FINAL_STATUS_LABELS[result.status];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `${sheet.subject.name} ${courseLabel(course).replace("°", "")} ${course.academicYear.year}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w ]/g, "")
    .trim();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}.xlsx"`,
    },
  });
}

import ExcelJS from "exceljs";
import { ATTENDANCE_SHORT, absenceValue, isWeekend } from "@/lib/attendance";
import { canTakeAttendance, getAttendanceSettings, totalsByEnrollment } from "@/lib/attendance-server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { courseLabel, fullName } from "@/lib/utils";

/** Planilla mensual de asistencia en Excel. */
export async function GET(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("No autorizado", { status: 401 });
  const { courseId } = await params;
  const mes = new URL(request.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mes)) return new Response("Mes inválido", { status: 400 });

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      subjects: { select: { teacherId: true } },
      enrollments: { where: { status: "ACTIVA" }, include: { student: { include: { user: true } } }, orderBy: { listNumber: "asc" } },
    },
  });
  if (!course || (!canTakeAttendance(user, course) && !course.subjects.some((s) => s.teacherId === user.id))) {
    return new Response("No encontrado", { status: 404 });
  }

  const [y, m] = mes.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const days: string[] = [];
  for (let d = first; d <= last; d = new Date(d.getTime() + 86400000)) {
    const iso = d.toISOString().slice(0, 10);
    if (!isWeekend(iso)) days.push(iso);
  }
  const settings = await getAttendanceSettings();
  const ids = course.enrollments.map((e) => e.id);
  const [records, totals] = await Promise.all([
    db.attendanceRecord.findMany({ where: { enrollmentId: { in: ids }, date: { gte: first, lte: last } } }),
    totalsByEnrollment(ids, settings),
  ]);
  const byKey = new Map(records.map((r) => [`${r.enrollmentId}|${r.date.toISOString().slice(0, 10)}`, r]));

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(mes, { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  ws.columns = [{ width: 5 }, { width: 30 }, ...days.map(() => ({ width: 4 })), { width: 8 }, { width: 8 }];
  const header = ws.addRow(["N°", "Alumno", ...days.map((d) => Number(d.slice(8))), "Mes", "Ciclo"]);
  header.font = { bold: true };
  header.alignment = { horizontal: "center" };
  for (const enrollment of course.enrollments) {
    let month = 0;
    const cells = days.map((day) => {
      const record = byKey.get(`${enrollment.id}|${day}`);
      if (!record) return "";
      month += absenceValue(record, settings);
      return record.status === "PRESENTE" ? "" : ATTENDANCE_SHORT[record.status] + (record.justified ? "j" : "");
    });
    const row = ws.addRow([enrollment.listNumber, fullName(enrollment.student.user), ...cells, month, totals.get(enrollment.id)!.total]);
    row.alignment = { horizontal: "center" };
    row.getCell(2).alignment = { horizontal: "left" };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Asistencia ${courseLabel(course).replace("°", "")} ${mes}.xlsx"`,
    },
  });
}

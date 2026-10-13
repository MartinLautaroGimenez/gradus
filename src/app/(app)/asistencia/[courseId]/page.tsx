import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  ALERT_LABELS,
  ATTENDANCE_SHORT,
  absenceValue,
  attendanceAlert,
  formatAbsences,
  isWeekend,
  nextSchoolDay,
  todayInMendoza,
} from "@/lib/attendance";
import { canTakeAttendance, getAttendanceSettings, totalsByEnrollment } from "@/lib/attendance-server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cn, courseLabel, fullName } from "@/lib/utils";
import { parseDate } from "@/lib/validation";
import { AttendanceSheet } from "./attendance-sheet";

export const metadata: Metadata = { title: "Asistencia" };

const ALERT_TONE = { OK: "neutral", ATENCION: "warning", CRITICO: "danger", LIBRE: "danger" } as const;

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default async function AsistenciaCursoPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ fecha?: string; mes?: string }>;
}) {
  const user = await requireUser();
  const { courseId } = await params;
  const { fecha, mes } = await searchParams;

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      academicYear: true,
      subjects: { select: { teacherId: true } },
      enrollments: {
        where: { status: "ACTIVA" },
        include: { student: { include: { user: true } } },
        orderBy: { listNumber: "asc" },
      },
    },
  });
  if (!course) notFound();
  const canEdit = canTakeAttendance(user, course);
  const isTeacher = course.subjects.some((s) => s.teacherId === user.id);
  if (!canEdit && !isTeacher) redirect("/asistencia");

  const settings = await getAttendanceSettings();
  const enrollmentIds = course.enrollments.map((e) => e.id);
  const totals = await totalsByEnrollment(enrollmentIds, settings);
  const tabClass = (active: boolean) =>
    cn(
      "rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors",
      active ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
    );

  const header = (
    <>
      <PageHeader
        title={`Asistencia · ${courseLabel(course)}`}
        description={`Ciclo ${course.academicYear.year} · Tope: ${settings.maxAbsences} inasistencias`}
        back={{ href: "/asistencia", label: "Asistencia" }}
      />
      <nav className="mb-4 flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.08]" aria-label="Vista">
        <Link href={`/asistencia/${course.id}`} aria-current={!mes ? "page" : undefined} className={tabClass(!mes)}>
          Lista del día
        </Link>
        <Link href={`/asistencia/${course.id}?mes=${(fecha ?? todayInMendoza()).slice(0, 7)}`} aria-current={!!mes ? "page" : undefined} className={tabClass(!!mes)}>
          Planilla mensual
        </Link>
      </nav>
    </>
  );

  // ── Planilla mensual ──
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const last = new Date(Date.UTC(y, m, 0));
    const days: string[] = [];
    for (let d = first; d <= last; d = new Date(d.getTime() + 86400000)) {
      const iso = d.toISOString().slice(0, 10);
      if (!isWeekend(iso)) days.push(iso);
    }
    const records = await db.attendanceRecord.findMany({
      where: { enrollmentId: { in: enrollmentIds }, date: { gte: first, lte: last } },
    });
    const byKey = new Map(records.map((r) => [`${r.enrollmentId}|${r.date.toISOString().slice(0, 10)}`, r]));
    const takenDays = new Set(records.map((r) => r.date.toISOString().slice(0, 10)));
    const prevMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    const monthName = first.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });

    return (
      <div className="flex flex-col gap-3">
        {header}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link href={`?mes=${prevMonth}`} className="rounded-lg p-2 hover:bg-surface-muted" aria-label="Mes anterior">
              <ChevronLeft className="size-4" />
            </Link>
            <span className="min-w-36 text-center font-semibold first-letter:uppercase">{monthName}</span>
            <Link href={`?mes=${nextMonth}`} className="rounded-lg p-2 hover:bg-surface-muted" aria-label="Mes siguiente">
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <a
            href={`/asistencia/${course.id}/exportar?mes=${mes}`}
            download
            className="inline-flex h-9 items-center gap-2 rounded-full bg-surface px-4 text-[14px] font-medium text-primary shadow-card hover:bg-surface-muted"
          >
            <Download className="size-4" aria-hidden /> Descargar Excel
          </a>
        </div>
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-card">
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="bg-surface-muted text-muted">
                <th className="sticky left-0 z-10 min-w-48 border-r border-b border-border bg-surface-muted px-3 py-2 text-left font-semibold">
                  Alumno
                </th>
                {days.map((day) => (
                  <th key={day} className="w-7 border-r border-b border-border px-1 py-2 text-center font-semibold">
                    <Link href={`/asistencia/${course.id}?fecha=${day}`} className="hover:text-primary" title="Ver lista del día">
                      {Number(day.slice(8))}
                    </Link>
                  </th>
                ))}
                <th className="border-b border-border px-2 py-2 font-semibold">Mes</th>
                <th className="border-b border-l border-border px-2 py-2 font-semibold">Ciclo</th>
              </tr>
            </thead>
            <tbody>
              {course.enrollments.map((enrollment) => {
                let monthTotal = 0;
                const total = totals.get(enrollment.id)!.total;
                const alert = attendanceAlert(total, settings.maxAbsences);
                return (
                  <tr key={enrollment.id}>
                    <td className="sticky left-0 z-10 border-r border-b border-border bg-surface px-3 py-1.5 text-sm font-medium whitespace-nowrap">
                      {fullName(enrollment.student.user)}
                    </td>
                    {days.map((day) => {
                      const record = byKey.get(`${enrollment.id}|${day}`);
                      if (record) monthTotal += absenceValue(record, settings);
                      return (
                        <td
                          key={day}
                          title={record?.note ?? undefined}
                          className={cn(
                            "border-r border-b border-border text-center font-semibold",
                            !takenDays.has(day) && "bg-surface-muted/60",
                            record?.status === "AUSENTE" && "text-danger",
                            (record?.status === "TARDE" || record?.status === "RETIRO") && "text-warning",
                            record?.justified && "underline",
                          )}
                        >
                          {record && record.status !== "PRESENTE" ? ATTENDANCE_SHORT[record.status] : ""}
                        </td>
                      );
                    })}
                    <td className="border-b border-border px-2 text-center tabular-nums">{formatAbsences(monthTotal)}</td>
                    <td
                      className={cn(
                        "border-b border-l border-border px-2 text-center font-semibold tabular-nums",
                        alert !== "OK" && "text-danger",
                      )}
                    >
                      {formatAbsences(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          A = ausente · T = llegada tarde ({formatAbsences(settings.lateValue)} falta) · R = retiro anticipado (
          {formatAbsences(settings.earlyLeaveValue)} falta) · subrayado = justificada · gris = no se tomó lista
        </p>
      </div>
    );
  }

  // ── Lista del día ──
  let date = fecha && parseDate(fecha) ? fecha : todayInMendoza();
  if (!fecha && isWeekend(date)) date = nextSchoolDay(date, -1);
  const day = parseDate(date)!;
  const outOfYear = day < course.academicYear.startDate || day > course.academicYear.endDate;
  const records = await db.attendanceRecord.findMany({ where: { date: day, enrollmentId: { in: enrollmentIds } } });
  const byEnrollment = new Map(records.map((r) => [r.enrollmentId, r]));
  const taken = records.length > 0;

  const rows = course.enrollments.map((enrollment) => {
    const record = byEnrollment.get(enrollment.id);
    const total = totals.get(enrollment.id)!.total;
    return {
      enrollmentId: enrollment.id,
      listNumber: enrollment.listNumber,
      name: fullName(enrollment.student.user),
      status: record?.status ?? ("PRESENTE" as const),
      justified: record?.justified ?? false,
      note: record?.note ?? null,
      otherDaysTotal: total - (record ? absenceValue(record, settings) : 0),
    };
  });

  const atRisk = rows.filter(
    (r) => attendanceAlert(r.otherDaysTotal + absenceValue(r, settings), settings.maxAbsences) !== "OK",
  ).length;

  return (
    <div className="flex flex-col gap-3">
      {header}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`?fecha=${nextSchoolDay(date, -1)}`} className="rounded-lg p-2 hover:bg-surface-muted" aria-label="Día anterior">
          <ChevronLeft className="size-4" />
        </Link>
        <form className="flex items-center gap-2">
          <input
            type="date"
            name="fecha"
            defaultValue={date}
            className="h-9 rounded-full bg-surface px-3.5 text-[14px] shadow-card"
            aria-label="Fecha"
          />
          <button type="submit" className="h-9 rounded-full bg-surface px-4 text-[14px] font-medium text-primary shadow-card hover:bg-surface-muted">
            Ir
          </button>
        </form>
        <Link href={`?fecha=${nextSchoolDay(date, 1)}`} className="rounded-lg p-2 hover:bg-surface-muted" aria-label="Día siguiente">
          <ChevronRight className="size-4" />
        </Link>
        <span className="font-semibold first-letter:uppercase">{longDate(date)}</span>
        {date !== todayInMendoza() && (
          <Link href={`/asistencia/${course.id}`} className="text-sm text-primary hover:underline">
            Hoy
          </Link>
        )}
        {atRisk > 0 && (
          <Badge tone={ALERT_TONE.ATENCION} className="ml-auto">
            {atRisk} {atRisk === 1 ? "alumno" : "alumnos"} con muchas faltas
          </Badge>
        )}
      </div>

      {outOfYear ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Esa fecha está fuera del ciclo lectivo {course.academicYear.year}.
        </p>
      ) : course.enrollments.length === 0 ? (
        <p className="rounded-2xl bg-surface shadow-card p-5 text-sm text-muted">El curso no tiene alumnos.</p>
      ) : (
        <>
          {isWeekend(date) && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Es fin de semana.</p>
          )}
          <AttendanceSheet
            key={date}
            courseId={course.id}
            date={date}
            taken={taken}
            canEdit={canEdit}
            settings={settings}
            initialRows={rows}
          />
          {!canEdit && <p className="text-xs text-muted">Sólo lectura: la lista la toma el preceptor del curso.</p>}
        </>
      )}
      <p className="text-xs text-muted">{ALERT_LABELS.ATENCION}: desde el 75 % del tope · {ALERT_LABELS.LIBRE}: al llegar a {settings.maxAbsences}.</p>
    </div>
  );
}


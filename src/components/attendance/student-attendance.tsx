import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ALERT_LABELS,
  ATTENDANCE_LABELS,
  absenceValue,
  attendanceAlert,
  attendanceTotals,
  formatAbsences,
} from "@/lib/attendance";
import { getAttendanceSettings } from "@/lib/attendance-server";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

const ALERT_STYLE = {
  OK: { tone: "success", bar: "bg-success" },
  ATENCION: { tone: "warning", bar: "bg-warning" },
  CRITICO: { tone: "danger", bar: "bg-danger" },
  LIBRE: { tone: "danger", bar: "bg-danger" },
} as const;

/** Resumen de asistencia de un alumno para él y su familia. */
export async function StudentAttendance({ enrollmentId }: { enrollmentId: string }) {
  const settings = await getAttendanceSettings();
  const records = await db.attendanceRecord.findMany({ where: { enrollmentId }, orderBy: { date: "desc" } });
  const totals = attendanceTotals(records, settings);
  const alert = attendanceAlert(totals.total, settings.maxAbsences);
  const percent = Math.min(100, (totals.total / settings.maxAbsences) * 100);
  const missed = records.filter((r) => r.status !== "PRESENTE");

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-3xl font-semibold tabular-nums">
              {formatAbsences(totals.total)}
              <span className="text-base font-normal text-muted"> / {settings.maxAbsences} inasistencias</span>
            </p>
            <p className="text-sm text-muted">
              {totals.absent} ausencias · {totals.late} llegadas tarde · {totals.earlyLeave} retiros
              {totals.justified > 0 && ` · ${totals.justified} justificadas`}
            </p>
          </div>
          <Badge tone={ALERT_STYLE[alert].tone}>{ALERT_LABELS[alert]}</Badge>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={settings.maxAbsences}
          aria-valuenow={totals.total}
          aria-label="Inasistencias sobre el tope"
        >
          <div className={cn("h-full rounded-full", ALERT_STYLE[alert].bar)} style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-muted">
          Llegada tarde = {formatAbsences(settings.lateValue)} falta · Retiro anticipado ={" "}
          {formatAbsences(settings.earlyLeaveValue)} falta
          {!settings.justifiedCount && " · Las justificadas no suman"}
        </p>
      </Card>

      {missed.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-border text-sm">
            {missed.map((record) => (
              <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                <span className="first-letter:uppercase">
                  {record.date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                </span>
                <span className="flex items-center gap-2">
                  {ATTENDANCE_LABELS[record.status]}
                  {record.justified && <Badge tone="success">Justificada</Badge>}
                  <span className="w-10 text-right text-xs tabular-nums text-muted">
                    {formatAbsences(absenceValue(record, settings))}
                  </span>
                </span>
                {record.note && <span className="w-full text-xs text-muted">{record.note}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

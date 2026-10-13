/**
 * Cómputo de inasistencias. Como con las notas, se cuenta en enteros
 * (centésimos de falta) para no acumular errores: 4 llegadas tarde de 0,25
 * dan exactamente 1 falta.
 */
import type { AttendanceStatus } from "@prisma/client";

export type AttendanceSettings = {
  maxAbsences: number;
  lateValue: number;
  earlyLeaveValue: number;
  justifiedCount: boolean;
};

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  maxAbsences: 20,
  lateValue: 0.25,
  earlyLeaveValue: 0.5,
  justifiedCount: true,
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENTE: "Presente",
  AUSENTE: "Ausente",
  TARDE: "Llegada tarde",
  RETIRO: "Retiro anticipado",
};

/** Letra de la planilla de asistencia. */
export const ATTENDANCE_SHORT: Record<AttendanceStatus, string> = {
  PRESENTE: "P",
  AUSENTE: "A",
  TARDE: "T",
  RETIRO: "R",
};

/** Cuánto suma un registro, en centésimos de falta. */
function hundredths(record: { status: AttendanceStatus; justified: boolean }, settings: AttendanceSettings) {
  if (record.justified && !settings.justifiedCount) return 0;
  switch (record.status) {
    case "AUSENTE":
      return 100;
    case "TARDE":
      return Math.round(settings.lateValue * 100);
    case "RETIRO":
      return Math.round(settings.earlyLeaveValue * 100);
    default:
      return 0;
  }
}

export function absenceValue(record: { status: AttendanceStatus; justified: boolean }, settings: AttendanceSettings) {
  return hundredths(record, settings) / 100;
}

export type AttendanceTotals = {
  /** Inasistencias computadas (con fracciones de tardes y retiros). */
  total: number;
  absent: number;
  late: number;
  earlyLeave: number;
  justified: number;
  /** Días en que se tomó lista. */
  days: number;
};

export function attendanceTotals(
  records: { status: AttendanceStatus; justified: boolean }[],
  settings: AttendanceSettings,
): AttendanceTotals {
  let sum = 0;
  const totals = { absent: 0, late: 0, earlyLeave: 0, justified: 0, days: records.length };
  for (const record of records) {
    sum += hundredths(record, settings);
    if (record.status === "AUSENTE") totals.absent++;
    if (record.status === "TARDE") totals.late++;
    if (record.status === "RETIRO") totals.earlyLeave++;
    if (record.justified && record.status !== "PRESENTE") totals.justified++;
  }
  return { total: sum / 100, ...totals };
}

export type AttendanceAlert = "OK" | "ATENCION" | "CRITICO" | "LIBRE";

/** ATENCION desde el 75 % del tope, CRITICO desde el 90 %, LIBRE al llegar al tope. */
export function attendanceAlert(total: number, maxAbsences: number): AttendanceAlert {
  const t = Math.round(total * 100);
  const max = maxAbsences * 100;
  if (t >= max) return "LIBRE";
  if (t * 10 >= max * 9) return "CRITICO";
  if (t * 4 >= max * 3) return "ATENCION";
  return "OK";
}

export const ALERT_LABELS: Record<AttendanceAlert, string> = {
  OK: "Al día",
  ATENCION: "Atención",
  CRITICO: "Cerca del tope",
  LIBRE: "Superó el tope",
};

/** 3.25 → "3,25"; 4 → "4" */
export function formatAbsences(value: number) {
  return value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/** Fecha de hoy en Mendoza como "aaaa-mm-dd" (independiente de la zona del servidor). */
export function todayInMendoza(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Mendoza" }).format(now);
}

/** Suma días a una fecha "aaaa-mm-dd". */
export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isWeekend(isoDate: string) {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Día hábil anterior o siguiente (saltea sábados y domingos). */
export function nextSchoolDay(isoDate: string, direction: 1 | -1) {
  let date = addDays(isoDate, direction);
  while (isWeekend(date)) date = addDays(date, direction);
  return date;
}

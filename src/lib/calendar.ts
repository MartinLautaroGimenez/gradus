import type { EventKind } from "@prisma/client";

export const EVENT_LABELS: Record<EventKind, string> = {
  EVALUACION: "Evaluación",
  ACTO: "Acto",
  FERIADO: "Feriado",
  RECESO: "Receso",
  REUNION: "Reunión",
  SALIDA: "Salida educativa",
  OTRO: "Otro",
};

/** Clases de color por tipo (usan los tokens del tema). */
export const EVENT_STYLE: Record<EventKind, string> = {
  EVALUACION: "bg-primary-soft text-primary",
  ACTO: "bg-success-soft text-success",
  FERIADO: "bg-danger-soft text-danger",
  RECESO: "bg-danger-soft text-danger",
  REUNION: "bg-warning-soft text-warning",
  SALIDA: "bg-success-soft text-success",
  OTRO: "bg-surface-muted text-muted",
};

/** Lunes de la semana de una fecha "aaaa-mm-dd". */
function mondayOf(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

/**
 * Semanas (lunes a domingo) que cubren un mes "aaaa-mm". Cada día trae si
 * pertenece al mes mostrado.
 */
export function monthGrid(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const weeks: { date: string; inMonth: boolean }[][] = [];
  const cursor = mondayOf(first);
  while (cursor.toISOString().slice(0, 10) <= last) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const date = cursor.toISOString().slice(0, 10);
      week.push({ date, inMonth: date.slice(0, 7) === month });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks, first, last };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Si un evento (con fin opcional) ocurre en el día dado. Fechas "aaaa-mm-dd". */
export function occursOn(event: { start: string; end: string | null }, day: string) {
  return day >= event.start && day <= (event.end ?? event.start);
}

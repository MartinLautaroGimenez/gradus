import type { PeriodKind } from "@prisma/client";

export type PeriodTemplate = {
  name: string;
  order: number;
  kind: PeriodKind;
  startDate: Date;
  endDate: Date;
};

function date(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Períodos por defecto de un ciclo en la ETec: dos cuatrimestres y las
 * instancias compensatorias de diciembre y febrero (esta última cae en el año
 * siguiente). Las fechas son orientativas y se ajustan desde Configuración.
 */
export function defaultPeriods(year: number): PeriodTemplate[] {
  return [
    { name: "1° Cuatrimestre", order: 1, kind: "REGULAR", startDate: date(year, 3, 1), endDate: date(year, 7, 10) },
    { name: "2° Cuatrimestre", order: 2, kind: "REGULAR", startDate: date(year, 7, 27), endDate: date(year, 11, 30) },
    { name: "Diciembre", order: 3, kind: "COMPENSATORIO", startDate: date(year, 12, 1), endDate: date(year, 12, 22) },
    { name: "Febrero", order: 4, kind: "COMPENSATORIO", startDate: date(year + 1, 2, 9), endDate: date(year + 1, 2, 27) },
  ];
}

export const PERIOD_KIND_LABELS: Record<PeriodKind, string> = {
  REGULAR: "Regular",
  COMPENSATORIO: "Compensatorio",
};

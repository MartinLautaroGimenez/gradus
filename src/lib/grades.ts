/**
 * Cálculo de promedios.
 *
 * Reglas (documentadas en docs/ALCANCE.md):
 * - Las cuentas se hacen en centésimos enteros para no arrastrar errores de
 *   punto flotante (0.1 + 0.2 !== 0.3 en JavaScript).
 * - El redondeo es "mitad hacia arriba": 6.995 → 7.00, 6.994 → 6.99.
 * - "Lo que se ve es lo que se suma": el promedio anual se calcula con los
 *   promedios de cada período ya redondeados, tal como aparecen en pantalla.
 *   Así cualquier persona puede verificar la cuenta a mano.
 */

export const MIN_GRADE = 1;
export const MAX_GRADE = 10;

export type WeightedGrade = {
  value: number;
  /** Peso relativo de la nota. Por defecto 1. */
  weight?: number;
};

/** Pasa una nota a centésimos enteros (7.25 → 725). */
function toHundredths(value: number): number {
  return Math.round(value * 100);
}

/** Redondea mitad hacia arriba con la cantidad de decimales pedida. */
export function roundGrade(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) throw new RangeError("La nota no es un número válido");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 2) {
    throw new RangeError("Los decimales deben ser 0, 1 o 2");
  }
  // Se trabaja con un entero escalado para evitar que, por ejemplo,
  // 6.995 quede representado como 6.99499999... y redondee hacia abajo.
  const factor = 10 ** decimals;
  const scaled = Math.round(value * 1e6) / 1e6; // limpia ruido de punto flotante
  return Math.floor(scaled * factor + 0.5 + 1e-9) / factor;
}

export function isValidGrade(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_GRADE && value <= MAX_GRADE;
}

/**
 * Promedio ponderado. Devuelve null si no hay notas (no es lo mismo
 * "sin notas" que "promedio 0").
 */
export function weightedAverage(grades: WeightedGrade[], decimals = 2): number | null {
  if (grades.length === 0) return null;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const { value, weight = 1 } of grades) {
    if (!isValidGrade(value)) {
      throw new RangeError(`Nota fuera de rango: ${value} (debe estar entre ${MIN_GRADE} y ${MAX_GRADE})`);
    }
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`Peso inválido: ${weight}`);
    }
    weightedSum += toHundredths(value) * toHundredths(weight);
    totalWeight += toHundredths(weight);
  }

  if (totalWeight === 0) return null;
  return roundGrade(weightedSum / totalWeight / 100, decimals);
}

/** Promedio simple: todas las notas pesan lo mismo. */
export function simpleAverage(values: number[], decimals = 2): number | null {
  return weightedAverage(
    values.map((value) => ({ value })),
    decimals,
  );
}

/**
 * Promedio anual a partir de los promedios de cada período. Los períodos sin
 * nota (null) se ignoran; si ninguno tiene nota devuelve null.
 */
export function annualAverage(periodAverages: (number | null)[], decimals = 2): number | null {
  const shown = periodAverages
    .filter((avg): avg is number => avg !== null)
    .map((avg) => roundGrade(avg, decimals));
  return simpleAverage(shown, decimals);
}

export function isPassing(average: number | null, passingGrade: number): boolean {
  return average !== null && toHundredths(average) >= toHundredths(passingGrade);
}

/** Formatea una nota para mostrar con coma decimal (estilo argentino). */
export function formatGrade(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  return roundGrade(value, decimals).toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ─────────────────────────────────────────────────────────────
// Carga en la planilla
// ─────────────────────────────────────────────────────────────

export type GradeInput =
  | { kind: "empty" }
  | { kind: "absent" }
  | { kind: "value"; value: number }
  | { kind: "invalid"; message: string };

/**
 * Interpreta lo que se escribe en una celda: "7", "7,5", "7.50", "A" (ausente)
 * o vacío. Acepta coma o punto decimal, hasta dos decimales.
 */
export function parseGradeInput(raw: string): GradeInput {
  const text = raw.trim().toLowerCase();
  if (text === "" || text === "-") return { kind: "empty" };
  if (text === "a" || text === "aus" || text === "ausente") return { kind: "absent" };
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(text)) {
    return { kind: "invalid", message: 'Escribí una nota de 1 a 10 (por ejemplo 7 o 7,5) o "A" si estuvo ausente' };
  }
  const value = Number(text.replace(",", "."));
  if (!isValidGrade(value)) return { kind: "invalid", message: `La nota tiene que estar entre ${MIN_GRADE} y ${MAX_GRADE}` };
  return { kind: "value", value };
}

/** Cómo se muestra una nota guardada en la planilla ("7,5", "A" o ""). */
export function gradeToText(grade: { value: number | null; absent: boolean } | undefined): string {
  if (!grade) return "";
  if (grade.absent) return "A";
  if (grade.value === null) return "";
  return grade.value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/**
 * Promedio de un alumno en un período. Las evaluaciones en las que estuvo
 * ausente o que todavía no tienen nota no cuentan.
 */
export function periodAverage(
  assessments: { id: string; weight: number }[],
  gradeFor: (assessmentId: string) => GradeInput,
  decimals = 2,
): number | null {
  const graded: WeightedGrade[] = [];
  for (const assessment of assessments) {
    const grade = gradeFor(assessment.id);
    if (grade.kind === "value") graded.push({ value: grade.value, weight: assessment.weight });
  }
  return weightedAverage(graded, decimals);
}

// ─────────────────────────────────────────────────────────────
// Resultado final de una materia
// ─────────────────────────────────────────────────────────────

export type FinalStatus = "APROBADA" | "DICIEMBRE" | "FEBRERO" | "PREVIA" | "EN_CURSO";

export type SubjectResult = {
  /** Promedio de los períodos regulares (cuatrimestres). */
  annual: number | null;
  status: FinalStatus;
  /** Nota con la que aprobó (la anual o la de la instancia compensatoria). */
  finalGrade: number | null;
  /** En qué instancia aprobó. */
  approvedIn: "ANUAL" | "DICIEMBRE" | "FEBRERO" | null;
};

/**
 * Regla de la ETec: aprueba con promedio anual >= nota de aprobación. Si no,
 * rinde en diciembre; si tampoco aprueba, en febrero; si no, queda previa.
 *
 * @param regular promedios de cada cuatrimestre (null si no tiene notas)
 * @param regularComplete true cuando terminaron todos los períodos regulares
 * @param december / february nota de cada instancia (null si no rindió todavía)
 * @param compensatoryClosed qué instancias ya cerraron (para saber si "no rindió" ya es definitivo)
 */
export function subjectResult({
  regular,
  regularComplete,
  december,
  february,
  decemberClosed = false,
  februaryClosed = false,
  passingGrade,
  decimals = 2,
}: {
  regular: (number | null)[];
  regularComplete: boolean;
  december: number | null;
  february: number | null;
  decemberClosed?: boolean;
  februaryClosed?: boolean;
  passingGrade: number;
  decimals?: number;
}): SubjectResult {
  const annual = annualAverage(regular, decimals);
  if (!regularComplete) return { annual, status: "EN_CURSO", finalGrade: null, approvedIn: null };
  if (isPassing(annual, passingGrade)) return { annual, status: "APROBADA", finalGrade: annual, approvedIn: "ANUAL" };
  if (isPassing(december, passingGrade)) {
    return { annual, status: "APROBADA", finalGrade: roundGrade(december!, decimals), approvedIn: "DICIEMBRE" };
  }
  if (!decemberClosed) return { annual, status: "DICIEMBRE", finalGrade: null, approvedIn: null };
  if (isPassing(february, passingGrade)) {
    return { annual, status: "APROBADA", finalGrade: roundGrade(february!, decimals), approvedIn: "FEBRERO" };
  }
  if (!februaryClosed) return { annual, status: "FEBRERO", finalGrade: null, approvedIn: null };
  return { annual, status: "PREVIA", finalGrade: null, approvedIn: null };
}

export const FINAL_STATUS_LABELS: Record<FinalStatus, string> = {
  APROBADA: "Aprobada",
  DICIEMBRE: "Diciembre",
  FEBRERO: "Febrero",
  PREVIA: "Previa",
  EN_CURSO: "En curso",
};

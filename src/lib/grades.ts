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

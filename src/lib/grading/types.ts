import type { AssessmentKind } from "@prisma/client";

/** Evaluación tal como la usa la planilla del lado del cliente. */
export type AssessmentDTO = {
  id: string;
  title: string;
  kind: AssessmentKind;
  /** aaaa-mm-dd o null */
  date: string | null;
  weight: number;
};

export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  EXAMEN: "Examen",
  TRABAJO_PRACTICO: "Trabajo práctico",
  ORAL: "Oral",
  CONCEPTO: "Concepto",
  OTRO: "Otro",
};

export const ASSESSMENT_KIND_SHORT: Record<AssessmentKind, string> = {
  EXAMEN: "Ex",
  TRABAJO_PRACTICO: "TP",
  ORAL: "Oral",
  CONCEPTO: "Conc",
  OTRO: "Otro",
};

/** Clave de una celda: evaluación + matrícula. */
export function cellKey(assessmentId: string, enrollmentId: string) {
  return `${assessmentId}|${enrollmentId}`;
}

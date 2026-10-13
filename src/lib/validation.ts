import { z } from "zod";

/** Estado que devuelven las server actions de formularios. */
export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export function fromZodError(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { error: "Revisá los datos marcados", fieldErrors };
}

/** Saca puntos, espacios y guiones: "40.123.456" → "40123456". */
export function normalizeDni(value: string) {
  return value.replace(/[.\s-]/g, "");
}

export const dniSchema = z
  .string()
  .trim()
  .transform(normalizeDni)
  .pipe(z.string().regex(/^\d{7,9}$/, "DNI inválido (7 a 9 números)"));

/** Texto opcional: "" se guarda como null. */
export const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((value) => (value ? value : null))
  .pipe(z.email("Email inválido").nullable());

/** Fecha opcional desde <input type="date"> o "dd/mm/aaaa". */
export const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const date = parseDate(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Fecha inválida" });
      return z.NEVER;
    }
    return date;
  });

export const requiredDate = z
  .string()
  .trim()
  .min(1, "Completá la fecha")
  .transform((value, ctx) => {
    const date = parseDate(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Fecha inválida" });
      return z.NEVER;
    }
    return date;
  });

/** Acepta "aaaa-mm-dd" y "dd/mm/aaaa". Devuelve la fecha en UTC (para columnas @db.Date). */
export function parseDate(value: string): Date | null {
  let year: number, month: number, day: number;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const local = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (local) [year, month, day] = [Number(local[3]), Number(local[2]), Number(local[1])];
  else return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date : null;
}

/**
 * Interpreta cómo se escribe un curso en las planillas: "1° A", "1A", "1 a",
 * "1ºA", "1er A". Devuelve null si no se entiende.
 */
export function parseCourseLabel(value: string): { grade: number; division: string } | null {
  const match = value
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})\s*(?:°|º|ER|DO|RO|TO|MO|VO|NO)?\s*(?:AÑO)?\s*["“]?([A-Z])["”]?$/);
  if (!match) return null;
  return { grade: Number(match[1]), division: match[2] };
}

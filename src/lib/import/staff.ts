/**
 * Importación del personal (directivos, preceptores, docentes y
 * administración) desde una planilla. Una fila = una persona. Pura (sin base
 * de datos) para poder testearla.
 */
import type { Role } from "@prisma/client";
import { z } from "zod";
import { normalizeDni, optionalEmail, parseCourseLabel } from "@/lib/validation";
import type { RowError } from "./students";

export const STAFF_COLUMNS = [
  { key: "apellido", required: true },
  { key: "nombre", required: true },
  { key: "dni", required: true },
  { key: "rol", required: true },
  { key: "email", required: false },
  { key: "telefono", required: false },
  { key: "cursos", required: false },
] as const;

const ROLE_WORDS: [RegExp, Role][] = [
  [/^direct(or|ora|ivo|iva)$|^vicedirect(or|ora)$|^rector(a)?$/, "DIRECTIVO"],
  [/^preceptor(a)?$/, "PRECEPTOR"],
  [/^docente$|^profesor(a)?$/, "DOCENTE"],
  [/^administrativ(o|a)$|^administraci[oó]n$|^secretari[oa]$/, "ADMINISTRATIVO"],
];

/** "Preceptora, Docente" → ["PRECEPTOR", "DOCENTE"]. Devuelve null si alguna palabra no se reconoce. */
export function parseStaffRoles(value: string): Role[] | null {
  const words = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s*(?:,|\/|\+|\by\b)\s*/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return null;
  const roles: Role[] = [];
  for (const word of words) {
    const match = ROLE_WORDS.find(([re]) => re.test(word));
    if (!match) return null;
    if (!roles.includes(match[1])) roles.push(match[1]);
  }
  return roles;
}

/** "1° A, 1° B" → [{1,A},{1,B}]. Devuelve null si algún curso no se entiende. */
export function parseCourseList(value: string) {
  const parts = value
    .split(/[,;/]|\by\b/)
    .map((p) => p.trim())
    .filter(Boolean);
  const courses = parts.map(parseCourseLabel);
  return courses.every(Boolean) ? (courses as { grade: number; division: string }[]) : null;
}

export type ParsedStaff = {
  line: number;
  dni: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
  /** Cursos de los que es preceptor/a. */
  courses: { grade: number; division: string }[];
};

const rowSchema = z
  .object({
    apellido: z.string({ error: "Falta el apellido" }).min(1, "Falta el apellido"),
    nombre: z.string({ error: "Falta el nombre" }).min(1, "Falta el nombre"),
    dni: z
      .string({ error: "Falta el DNI" })
      .transform(normalizeDni)
      .pipe(z.string().regex(/^\d{7,9}$/, "DNI inválido")),
    rol: z.string({ error: "Falta el rol" }).transform((value, ctx) => {
      const roles = parseStaffRoles(value);
      if (!roles) {
        ctx.addIssue({ code: "custom", message: `Rol "${value}" no reconocido (Directivo, Preceptor, Docente o Administrativo)` });
        return z.NEVER;
      }
      return roles;
    }),
    email: optionalEmail,
    telefono: z.string().optional(),
    cursos: z
      .string()
      .optional()
      .transform((value, ctx) => {
        if (!value) return [];
        const courses = parseCourseList(value);
        if (!courses) {
          ctx.addIssue({ code: "custom", message: `Cursos "${value}" no reconocidos (usá por ejemplo "1° A, 1° B")` });
          return z.NEVER;
        }
        return courses;
      }),
  })
  .superRefine((row, ctx) => {
    if (row.cursos.length > 0 && !row.rol.includes("PRECEPTOR")) {
      ctx.addIssue({ code: "custom", path: ["cursos"], message: "Sólo se asignan cursos a preceptores" });
    }
  });

export function parseStaffRecords(records: { line: number; values: Partial<Record<string, string>> }[]) {
  const staff: ParsedStaff[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  const courseOwner = new Map<string, number>();

  for (const record of records) {
    const values = Object.fromEntries(Object.entries(record.values).filter(([, v]) => v !== ""));
    const parsed = rowSchema.safeParse(values);
    if (!parsed.success) {
      errors.push({ line: record.line, messages: [...new Set(parsed.error.issues.map((i) => i.message))] });
      continue;
    }
    const row = parsed.data;
    if (seen.has(row.dni)) {
      errors.push({ line: record.line, messages: [`El DNI ${row.dni} ya aparece en la fila ${seen.get(row.dni)}`] });
      continue;
    }
    const clash = row.cursos.find((c) => courseOwner.has(`${c.grade}${c.division}`));
    if (clash) {
      errors.push({
        line: record.line,
        messages: [`El curso ${clash.grade}° ${clash.division} ya tiene preceptor en la fila ${courseOwner.get(`${clash.grade}${clash.division}`)}`],
      });
      continue;
    }
    seen.set(row.dni, record.line);
    row.cursos.forEach((c) => courseOwner.set(`${c.grade}${c.division}`, record.line));
    staff.push({
      line: record.line,
      dni: row.dni,
      firstName: row.nombre,
      lastName: row.apellido,
      email: row.email,
      phone: row.telefono || null,
      roles: row.rol,
      courses: row.cursos,
    });
  }
  return { staff, errors };
}

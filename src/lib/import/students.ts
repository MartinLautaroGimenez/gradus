/**
 * Importación de alumnos y familias desde una planilla.
 *
 * Una fila = un alumno con (opcionalmente) un adulto responsable. Si un alumno
 * tiene dos tutores, se repite la fila con el mismo DNI de alumno y otro tutor.
 * Esta parte es pura (sin base de datos) para poder testearla.
 */
import type { GuardianRelationship } from "@prisma/client";
import { z } from "zod";
import { normalizeDni, optionalDate, optionalEmail, parseCourseLabel } from "@/lib/validation";

export const IMPORT_COLUMNS = [
  { key: "apellido", required: true },
  { key: "nombre", required: true },
  { key: "dni", required: true },
  { key: "curso", required: true },
  { key: "legajo", required: false },
  { key: "email", required: false },
  { key: "fecha_nacimiento", required: false },
  { key: "tutor_apellido", required: false },
  { key: "tutor_nombre", required: false },
  { key: "tutor_dni", required: false },
  { key: "tutor_email", required: false },
  { key: "tutor_telefono", required: false },
  { key: "vinculo", required: false },
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number]["key"];
export const MAX_IMPORT_ROWS = 2000;

/** "Fecha de nacimiento" → "fecha_de_nacimiento"; también acepta algunos alias. */
export function normalizeHeader(header: string): string {
  const key = header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const aliases: Record<string, string> = {
    apellidos: "apellido",
    nombres: "nombre",
    documento: "dni",
    division: "curso",
    curso_division: "curso",
    fecha_de_nacimiento: "fecha_nacimiento",
    nacimiento: "fecha_nacimiento",
    parentesco: "vinculo",
    relacion: "vinculo",
    mail: "email",
    correo: "email",
    tutor_mail: "tutor_email",
    tutor_correo: "tutor_email",
  };
  return aliases[key] ?? key;
}

export type RawRecord = { line: number; values: Partial<Record<ImportColumn, string>> };

/** Primera fila = encabezados. Ignora filas vacías. `line` es el número de fila en la planilla. */
export function rowsToRecords(rows: string[][]): { records: RawRecord[]; missingColumns: string[] } {
  const [header = [], ...body] = rows;
  const keys = header.map((cell) => normalizeHeader(String(cell ?? "")));
  const missingColumns = IMPORT_COLUMNS.filter((col) => col.required && !keys.includes(col.key)).map((col) => col.key);

  const records: RawRecord[] = [];
  body.forEach((row, index) => {
    if (row.every((cell) => !String(cell ?? "").trim())) return;
    const values: RawRecord["values"] = {};
    keys.forEach((key, col) => {
      if (IMPORT_COLUMNS.some((c) => c.key === key)) values[key as ImportColumn] = String(row[col] ?? "").trim();
    });
    records.push({ line: index + 2, values });
  });
  return { records, missingColumns };
}

export function parseRelationship(value: string | undefined): GuardianRelationship {
  const v = (value ?? "").trim().toLowerCase();
  if (v.startsWith("madre")) return "MADRE";
  if (v.startsWith("padre")) return "PADRE";
  if (v.startsWith("tutor")) return "TUTOR_LEGAL";
  return v ? "OTRO" : "TUTOR_LEGAL";
}

const dni = (label: string) =>
  z
    .string({ error: `Falta el ${label}` })
    .transform(normalizeDni)
    .pipe(z.string().regex(/^\d{7,9}$/, `${label} inválido`));

const rowSchema = z
  .object({
    apellido: z.string({ error: "Falta el apellido" }).min(1, "Falta el apellido"),
    nombre: z.string({ error: "Falta el nombre" }).min(1, "Falta el nombre"),
    dni: dni("DNI"),
    curso: z.string({ error: "Falta el curso" }).transform((value, ctx) => {
      const course = parseCourseLabel(value);
      if (!course) {
        ctx.addIssue({ code: "custom", message: `Curso "${value}" no reconocido (usá por ejemplo "1° A")` });
        return z.NEVER;
      }
      return course;
    }),
    legajo: z.string().optional(),
    email: optionalEmail,
    fecha_nacimiento: optionalDate,
    tutor_apellido: z.string().optional(),
    tutor_nombre: z.string().optional(),
    tutor_dni: z.string().optional(),
    tutor_email: optionalEmail,
    tutor_telefono: z.string().optional(),
    vinculo: z.string().optional(),
  })
  .superRefine((row, ctx) => {
    const anyGuardian = row.tutor_apellido || row.tutor_nombre || row.tutor_dni;
    if (!anyGuardian) return;
    if (!row.tutor_apellido || !row.tutor_nombre) {
      ctx.addIssue({ code: "custom", path: ["tutor_nombre"], message: "Falta nombre o apellido del tutor" });
    }
    if (!row.tutor_dni || !/^\d{7,9}$/.test(normalizeDni(row.tutor_dni))) {
      ctx.addIssue({ code: "custom", path: ["tutor_dni"], message: "DNI del tutor faltante o inválido" });
    }
  });

export type ParsedGuardian = {
  dni: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  relationship: GuardianRelationship;
};

export type ParsedStudent = {
  lines: number[];
  dni: string;
  firstName: string;
  lastName: string;
  email: string | null;
  fileNumber: string;
  course: { grade: number; division: string };
  birthDate: Date | null;
  guardians: ParsedGuardian[];
};

export type RowError = { line: number; messages: string[] };

export function parseStudentRecords(records: RawRecord[]): { students: ParsedStudent[]; errors: RowError[] } {
  const byDni = new Map<string, ParsedStudent>();
  const errors: RowError[] = [];

  for (const record of records) {
    // Las celdas vacías se tratan como "no informado".
    const values = Object.fromEntries(Object.entries(record.values).filter(([, v]) => v !== ""));
    const parsed = rowSchema.safeParse(values);
    if (!parsed.success) {
      errors.push({ line: record.line, messages: [...new Set(parsed.error.issues.map((issue) => issue.message))] });
      continue;
    }
    const row = parsed.data;

    let student = byDni.get(row.dni);
    if (!student) {
      student = {
        lines: [],
        dni: row.dni,
        firstName: row.nombre,
        lastName: row.apellido,
        email: row.email,
        fileNumber: row.legajo || row.dni,
        course: row.curso,
        birthDate: row.fecha_nacimiento,
        guardians: [],
      };
      byDni.set(row.dni, student);
    } else if (student.course.grade !== row.curso.grade || student.course.division !== row.curso.division) {
      errors.push({ line: record.line, messages: [`El alumno DNI ${row.dni} aparece en dos cursos distintos`] });
      continue;
    }
    student.lines.push(record.line);

    if (row.tutor_dni) {
      const guardianDni = normalizeDni(row.tutor_dni);
      if (guardianDni === row.dni) {
        errors.push({ line: record.line, messages: ["El tutor no puede tener el mismo DNI que el alumno"] });
        continue;
      }
      if (!student.guardians.some((g) => g.dni === guardianDni)) {
        student.guardians.push({
          dni: guardianDni,
          firstName: row.tutor_nombre!,
          lastName: row.tutor_apellido!,
          email: row.tutor_email,
          phone: row.tutor_telefono || null,
          relationship: parseRelationship(row.vinculo),
        });
      }
    }
  }

  return { students: [...byDni.values()], errors };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CONFIG_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { defaultPeriods } from "@/lib/periods";
import { type FormState, fromZodError, requiredDate } from "@/lib/validation";

const schoolSchema = z.object({
  name: z.string().trim().min(3, "Nombre demasiado corto"),
  shortName: z.string().trim().min(1, "Completá la sigla"),
  passingGrade: z.coerce.number().min(1, "Entre 1 y 10").max(10, "Entre 1 y 10"),
  gradeDecimals: z.coerce.number().int().min(0).max(2),
  maxAbsences: z.coerce.number().int("Número entero").min(1, "Debe ser mayor a 0"),
  lateValue: z.coerce.number().min(0, "Entre 0 y 1").max(1, "Entre 0 y 1"),
  earlyLeaveValue: z.coerce.number().min(0, "Entre 0 y 1").max(1, "Entre 0 y 1"),
  justifiedCount: z.literal("on").optional().transform((v) => v === "on"),
});

export async function updateSchool(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(CONFIG_ROLES);
  const parsed = schoolSchema.safeParse(
    // Se acepta coma decimal ("0,25").
    Object.fromEntries([...formData].map(([k, v]) => [k, typeof v === "string" ? v.replace(",", ".") : v])),
  );
  if (!parsed.success) return fromZodError(parsed.error);

  const school = await db.school.findFirst();
  if (school) await db.school.update({ where: { id: school.id }, data: parsed.data });
  else await db.school.create({ data: parsed.data });

  revalidatePath("/", "layout");
  return { ok: true, message: "Datos guardados" };
}

const createYearSchema = z.object({
  year: z.coerce.number().int().min(2000, "Año inválido").max(2100, "Año inválido"),
  copyFrom: z.string().optional(),
});

export async function createAcademicYear(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(CONFIG_ROLES);
  const parsed = createYearSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const { year, copyFrom } = parsed.data;

  if (await db.academicYear.findUnique({ where: { year } })) {
    return { error: `El ciclo ${year} ya existe`, fieldErrors: { year: ["Ya existe"] } };
  }

  const periods = defaultPeriods(year);
  const created = await db.$transaction(async (tx) => {
    const academicYear = await tx.academicYear.create({
      data: {
        year,
        startDate: periods[0].startDate,
        endDate: periods.at(-1)!.endDate,
        periods: { create: periods },
      },
    });

    // Copia la estructura (cursos, preceptores, materias y docentes), no los alumnos.
    if (copyFrom) {
      const source = await tx.course.findMany({ where: { academicYearId: copyFrom }, include: { subjects: true } });
      for (const course of source) {
        await tx.course.create({
          data: {
            academicYearId: academicYear.id,
            level: course.level,
            grade: course.grade,
            division: course.division,
            shift: course.shift,
            preceptorId: course.preceptorId,
            subjects: {
              create: course.subjects.map(({ subjectId, teacherId }) => ({ subjectId, teacherId })),
            },
          },
        });
      }
    }
    return academicYear;
  });

  revalidatePath("/configuracion");
  redirect(`/configuracion/ciclos/${created.id}`);
}

const yearDatesSchema = z.object({ startDate: requiredDate, endDate: requiredDate }).refine(
  (data) => data.startDate < data.endDate,
  { message: "La fecha de fin debe ser posterior al inicio", path: ["endDate"] },
);

export async function updateAcademicYear(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(CONFIG_ROLES);
  const parsed = yearDatesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  await db.academicYear.update({ where: { id }, data: parsed.data });
  revalidatePath(`/configuracion/ciclos/${id}`);
  return { ok: true, message: "Fechas guardadas" };
}

export async function activateAcademicYear(id: string) {
  await requireRole(CONFIG_ROLES);
  await db.$transaction([
    db.academicYear.updateMany({ where: { active: true }, data: { active: false } }),
    db.academicYear.update({ where: { id }, data: { active: true } }),
  ]);
  revalidatePath("/", "layout");
}

const periodSchema = z
  .object({
    name: z.string().trim().min(1, "Completá el nombre"),
    kind: z.enum(["REGULAR", "COMPENSATORIO"]),
    startDate: requiredDate,
    endDate: requiredDate,
    closed: z.literal("on").optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "El fin no puede ser anterior al inicio",
    path: ["endDate"],
  });

export async function updatePeriod(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(CONFIG_ROLES);
  const parsed = periodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const { closed, ...data } = parsed.data;
  const period = await db.gradingPeriod.update({ where: { id }, data: { ...data, closed: closed === "on" } });
  revalidatePath(`/configuracion/ciclos/${period.academicYearId}`);
  return { ok: true, message: "Guardado" };
}

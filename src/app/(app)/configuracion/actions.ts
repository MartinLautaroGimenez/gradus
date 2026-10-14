"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
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
  require2faForStaff: z.literal("on").optional().transform((v) => v === "on"),
});

export async function updateSchool(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole(CONFIG_ROLES);
  const parsed = schoolSchema.safeParse(
    // Se acepta coma decimal ("0,25").
    Object.fromEntries([...formData].map(([k, v]) => [k, typeof v === "string" ? v.replace(",", ".") : v])),
  );
  if (!parsed.success) return fromZodError(parsed.error);

  const school = await db.school.findFirst();
  if (parsed.data.require2faForStaff && !user.twoFactorEnabled) {
    return {
      error: "Para exigir la verificación en dos pasos, activala primero en tu cuenta (Seguridad de la cuenta).",
      fieldErrors: { require2faForStaff: ["Activala primero en tu cuenta"] },
    };
  }
  if (school) await db.school.update({ where: { id: school.id }, data: parsed.data });
  else await db.school.create({ data: parsed.data });

  const changed = school
    ? (Object.keys(parsed.data) as (keyof typeof parsed.data)[]).filter((key) => String(school[key]) !== String(parsed.data[key]))
    : Object.keys(parsed.data);
  if (changed.length) {
    await audit({
      actorId: user.id,
      action: "config.escuela",
      entity: "School",
      entityId: school?.id,
      summary: `Cambió la configuración de la escuela (${changed.join(", ")})`,
      details: {
        before: school ? Object.fromEntries(changed.map((key) => [key, String(school[key as keyof typeof school])])) : null,
        after: Object.fromEntries(changed.map((key) => [key, String(parsed.data[key as keyof typeof parsed.data])])),
      },
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Datos guardados" };
}

const createYearSchema = z.object({
  year: z.coerce.number().int().min(2000, "Año inválido").max(2100, "Año inválido"),
  copyFrom: z.string().optional(),
});

export async function createAcademicYear(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole(CONFIG_ROLES);
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

  await audit({ actorId: user.id, action: "config.ciclo_crear", entity: "AcademicYear", entityId: created.id, summary: `Creó el ciclo lectivo ${year}` });
  revalidatePath("/configuracion");
  redirect(`/configuracion/ciclos/${created.id}`);
}

const yearDatesSchema = z.object({ startDate: requiredDate, endDate: requiredDate }).refine(
  (data) => data.startDate < data.endDate,
  { message: "La fecha de fin debe ser posterior al inicio", path: ["endDate"] },
);

export async function updateAcademicYear(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole(CONFIG_ROLES);
  const parsed = yearDatesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const updated = await db.academicYear.update({ where: { id }, data: parsed.data });
  await audit({ actorId: user.id, action: "config.ciclo_fechas", entity: "AcademicYear", entityId: id, summary: `Cambió las fechas del ciclo ${updated.year}` });
  revalidatePath(`/configuracion/ciclos/${id}`);
  return { ok: true, message: "Fechas guardadas" };
}

export async function activateAcademicYear(id: string) {
  const user = await requireRole(CONFIG_ROLES);
  const [, activated] = await db.$transaction([
    db.academicYear.updateMany({ where: { active: true }, data: { active: false } }),
    db.academicYear.update({ where: { id }, data: { active: true } }),
  ]);
  await audit({ actorId: user.id, action: "config.ciclo_activar", entity: "AcademicYear", entityId: id, summary: `Activó el ciclo lectivo ${activated.year}` });
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
  const user = await requireRole(CONFIG_ROLES);
  const parsed = periodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const { closed, ...data } = parsed.data;
  const before = await db.gradingPeriod.findUnique({ where: { id }, select: { closed: true } });
  const period = await db.gradingPeriod.update({ where: { id }, data: { ...data, closed: closed === "on" } });
  const toggled = before && before.closed !== period.closed;
  await audit({
    actorId: user.id,
    action: toggled ? (period.closed ? "config.periodo_cerrar" : "config.periodo_abrir") : "config.periodo",
    entity: "GradingPeriod",
    entityId: id,
    summary: toggled
      ? `${period.closed ? "Cerró" : "Reabrió"} el período ${period.name}`
      : `Editó el período ${period.name}`,
  });
  revalidatePath(`/configuracion/ciclos/${period.academicYearId}`);
  return { ok: true, message: "Guardado" };
}

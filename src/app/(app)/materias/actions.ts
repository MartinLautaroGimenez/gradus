"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MANAGE_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { type FormState, fromZodError, optionalText } from "@/lib/validation";

const subjectSchema = z.object({
  name: z.string().trim().min(2, "Nombre demasiado corto"),
  shortName: optionalText,
  grade: z.coerce.number().int().min(1, "Año inválido").max(7, "Año inválido"),
  weeklyHours: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .pipe(z.number().int("Número entero").min(1, "Debe ser mayor a 0").max(40).nullable()),
});

function duplicateError(): FormState {
  return { error: "Ya existe una materia con ese nombre en ese año", fieldErrors: { name: ["Ya existe"] } };
}

export async function createSubject(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(MANAGE_ROLES);
  const parsed = subjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await db.subject.create({ data: { ...parsed.data, level: "SECUNDARIO" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return duplicateError();
    throw error;
  }
  revalidatePath("/materias");
  return { ok: true, message: `Se agregó "${parsed.data.name}"` };
}

export async function updateSubject(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(MANAGE_ROLES);
  const parsed = subjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await db.subject.update({ where: { id }, data: parsed.data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return duplicateError();
    throw error;
  }
  revalidatePath("/materias");
  redirect("/materias");
}

export async function deleteSubject(id: string) {
  await requireRole(MANAGE_ROLES);
  const inUse = await db.courseSubject.count({ where: { subjectId: id } });
  if (inUse > 0) redirect(`/materias/${id}?error=en-uso`);
  await db.subject.delete({ where: { id } });
  revalidatePath("/materias");
  redirect("/materias");
}

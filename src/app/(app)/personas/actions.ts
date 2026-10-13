"use server";

import { Prisma, type Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashInitialPassword } from "@/lib/auth/password";
import { MANAGE_ROLES, assignableRoles, canManageUser } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  type FormState,
  dniSchema,
  fromZodError,
  optionalDate,
  optionalEmail,
  optionalText,
} from "@/lib/validation";

const ROLES = ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO", "PRECEPTOR", "DOCENTE", "TUTOR", "ALUMNO"] as const;

const personSchema = z.object({
  firstName: z.string().trim().min(1, "Completá el nombre"),
  lastName: z.string().trim().min(1, "Completá el apellido"),
  dni: dniSchema,
  email: optionalEmail,
  phone: optionalText,
  roles: z.array(z.enum(ROLES)).min(1, "Elegí al menos un rol"),
});

function readPerson(formData: FormData) {
  return personSchema.safeParse({ ...Object.fromEntries(formData), roles: formData.getAll("roles") });
}

/** Traduce violaciones de unicidad (DNI, email, legajo) a errores de formulario. */
function uniqueError(error: unknown): FormState | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const target = String((error.meta?.target as string[] | undefined)?.join(",") ?? "");
  if (target.includes("dni")) return { error: "Ya existe una persona con ese DNI", fieldErrors: { dni: ["Ya registrado"] } };
  if (target.includes("email")) return { error: "Ese email ya está en uso", fieldErrors: { email: ["Ya registrado"] } };
  if (target.includes("fileNumber")) return { error: "Ese legajo ya existe", fieldErrors: { fileNumber: ["Ya registrado"] } };
  return { error: "Ya existe un registro con esos datos" };
}

const studentExtraSchema = z.object({
  fileNumber: optionalText,
  birthDate: optionalDate,
  courseId: optionalText,
});

export async function createPerson(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireRole(MANAGE_ROLES);
  const parsed = readPerson(formData);
  if (!parsed.success) return fromZodError(parsed.error);
  const { roles, ...data } = parsed.data;

  const allowed = assignableRoles(actor);
  if (!roles.every((role) => allowed.includes(role))) return { error: "No podés otorgar alguno de esos roles" };

  const extra = studentExtraSchema.safeParse(Object.fromEntries(formData));
  if (!extra.success) return fromZodError(extra.error);
  const isStudent = roles.includes("ALUMNO");

  let userId: string;
  try {
    const user = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          ...data,
          roles,
          // Contraseña inicial: el DNI. Se pide cambiarla en el primer ingreso.
          passwordHash: await hashInitialPassword(data.dni),
          mustChangePassword: true,
        },
      });
      if (isStudent) {
        const course = extra.data.courseId
          ? await tx.course.findUnique({ where: { id: extra.data.courseId } })
          : null;
        const last = course
          ? await tx.enrollment.aggregate({ where: { courseId: course.id }, _max: { listNumber: true } })
          : null;
        await tx.student.create({
          data: {
            userId: user.id,
            fileNumber: extra.data.fileNumber ?? data.dni,
            birthDate: extra.data.birthDate,
            enrollments: course
              ? { create: { courseId: course.id, listNumber: (last?._max.listNumber ?? 0) + 1 } }
              : undefined,
          },
        });
      }
      return user;
    });
    userId = user.id;
  } catch (error) {
    const known = uniqueError(error);
    if (known) return known;
    throw error;
  }

  revalidatePath("/personas");
  redirect(`/personas/${userId}?creado=1`);
}

async function loadManageable(actor: { id: string; roles: Role[] }, id: string) {
  const target = await db.user.findUnique({ where: { id } });
  if (!target || !canManageUser(actor, target)) redirect("/personas");
  return target;
}

export async function updatePerson(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireRole(MANAGE_ROLES);
  const target = await loadManageable(actor, id);
  const parsed = readPerson(formData);
  if (!parsed.success) return fromZodError(parsed.error);
  const { roles: requested, ...data } = parsed.data;

  // Nadie se cambia sus propios roles: evita quedarse afuera por error.
  const roles = actor.id === id ? target.roles : requested;
  const allowed = assignableRoles(actor);
  if (!roles.every((role) => allowed.includes(role))) return { error: "No podés otorgar alguno de esos roles" };

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { ...data, roles } });
      // Si se le agrega el rol de alumno, se le crea el legajo.
      if (roles.includes("ALUMNO")) {
        await tx.student.upsert({ where: { userId: id }, update: {}, create: { userId: id, fileNumber: data.dni } });
      }
    });
  } catch (error) {
    const known = uniqueError(error);
    if (known) return known;
    throw error;
  }

  revalidatePath(`/personas/${id}`);
  return { ok: true, message: "Datos guardados" };
}

const studentFileSchema = z.object({
  fileNumber: z.string().trim().min(1, "Completá el legajo"),
  birthDate: optionalDate,
  address: optionalText,
  notes: optionalText,
});

export async function updateStudentFile(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireRole(MANAGE_ROLES);
  await loadManageable(actor, userId);
  const parsed = studentFileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await db.student.update({ where: { userId }, data: parsed.data });
  } catch (error) {
    const known = uniqueError(error);
    if (known) return known;
    throw error;
  }
  revalidatePath(`/personas/${userId}`);
  return { ok: true, message: "Legajo guardado" };
}

const guardianSchema = z.object({
  dni: dniSchema,
  relationship: z.enum(["MADRE", "PADRE", "TUTOR_LEGAL", "OTRO"]),
  isPrimary: z.literal("on").optional(),
  firstName: optionalText,
  lastName: optionalText,
  email: optionalEmail,
  phone: optionalText,
});

/**
 * Vincula un adulto responsable a un alumno. Si ya existe alguien con ese DNI
 * se lo vincula (y se le agrega el rol de familia); si no, se lo crea.
 */
export async function addGuardian(studentUserId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireRole(MANAGE_ROLES);
  await loadManageable(actor, studentUserId);
  const parsed = guardianSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const { dni, relationship, isPrimary, firstName, lastName, email, phone } = parsed.data;

  const student = await db.student.findUnique({ where: { userId: studentUserId }, include: { user: true } });
  if (!student) return { error: "La persona no tiene legajo de alumno" };
  if (student.user.dni === dni) return { error: "El alumno no puede ser su propio tutor", fieldErrors: { dni: ["Es el DNI del alumno"] } };

  let guardian = await db.user.findUnique({ where: { dni } });
  if (guardian && !canManageUser(actor, { roles: [...guardian.roles, "TUTOR"] })) {
    return { error: "No tenés permiso para modificar a esa persona" };
  }
  if (!guardian && (!firstName || !lastName)) {
    return {
      error: "No hay nadie registrado con ese DNI. Completá nombre y apellido para crear su cuenta.",
      fieldErrors: { firstName: firstName ? undefined : ["Requerido"], lastName: lastName ? undefined : ["Requerido"] },
    };
  }

  try {
    await db.$transaction(async (tx) => {
      if (guardian) {
        if (!guardian.roles.includes("TUTOR")) {
          guardian = await tx.user.update({ where: { id: guardian.id }, data: { roles: { push: "TUTOR" } } });
        }
      } else {
        guardian = await tx.user.create({
          data: {
            dni,
            firstName: firstName!,
            lastName: lastName!,
            email,
            phone,
            roles: ["TUTOR"],
            passwordHash: await hashInitialPassword(dni),
            mustChangePassword: true,
          },
        });
      }
      await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
        update: { relationship, isPrimary: isPrimary === "on" },
        create: { studentId: student.id, guardianId: guardian.id, relationship, isPrimary: isPrimary === "on" },
      });
    });
  } catch (error) {
    const known = uniqueError(error);
    if (known) return known;
    throw error;
  }

  revalidatePath(`/personas/${studentUserId}`);
  return { ok: true, message: "Adulto responsable vinculado" };
}

export async function removeGuardian(linkId: string) {
  const actor = await requireRole(MANAGE_ROLES);
  const link = await db.studentGuardian.findUnique({ where: { id: linkId }, include: { student: true } });
  if (!link) return;
  await loadManageable(actor, link.student.userId);
  await db.studentGuardian.delete({ where: { id: linkId } });
  revalidatePath(`/personas/${link.student.userId}`);
}

export async function resetPassword(userId: string): Promise<FormState> {
  const actor = await requireRole(MANAGE_ROLES);
  const target = await loadManageable(actor, userId);
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { passwordHash: await hashInitialPassword(target.dni), mustChangePassword: true },
    }),
    db.session.deleteMany({ where: { userId } }),
  ]);
  return { ok: true, message: "Listo: la contraseña volvió a ser el DNI. Se le pedirá cambiarla al ingresar." };
}

export async function setUserActive(userId: string, active: boolean) {
  const actor = await requireRole(MANAGE_ROLES);
  if (actor.id === userId) return;
  await loadManageable(actor, userId);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { active } }),
    // Al desactivar se cierran todas sus sesiones abiertas.
    ...(active ? [] : [db.session.deleteMany({ where: { userId } })]),
  ]);
  revalidatePath(`/personas/${userId}`);
}

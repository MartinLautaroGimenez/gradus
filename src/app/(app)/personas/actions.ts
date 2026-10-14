"use server";

import { Prisma, type Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { generateInitialPassword } from "@/lib/auth/initial-password";
import { hashInitialPassword } from "@/lib/auth/password";
import { ROLE_LABELS } from "@/lib/auth/roles";
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
  const password = generateInitialPassword();
  const passwordHash = await hashInitialPassword(password);

  let userId: string;
  try {
    const user = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          ...data,
          roles,
          // Contraseña inicial al azar. Se pide cambiarla en el primer ingreso.
          passwordHash,
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

  const name = `${data.firstName} ${data.lastName}`;
  await audit({
    actorId: actor.id,
    action: "persona.crear",
    entity: "User",
    entityId: userId,
    summary: `Creó la cuenta de ${name} (${roles.map((role) => ROLE_LABELS[role]).join(", ")})`,
  });
  revalidatePath("/personas");
  return { ok: true, credentials: { name, dni: data.dni, password, href: `/personas/${userId}` } };
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
  const rolesChanged = [...roles].sort().join() !== [...target.roles].sort().join();

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { ...data, roles } });
      // Si cambian los roles, se cierran sus sesiones para que tomen efecto ya.
      if (rolesChanged) await tx.session.deleteMany({ where: { userId: id } });
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

  const changes = (Object.keys(data) as (keyof typeof data)[]).filter((key) => (data[key] ?? null) !== (target[key] ?? null));
  if (rolesChanged || changes.length) {
    await audit({
      actorId: actor.id,
      action: rolesChanged ? "persona.roles" : "persona.editar",
      entity: "User",
      entityId: id,
      summary: rolesChanged
        ? `Cambió los roles de ${target.firstName} ${target.lastName}: ${target.roles.map((r) => ROLE_LABELS[r]).join(", ")} → ${roles.map((r) => ROLE_LABELS[r]).join(", ")}`
        : `Editó los datos de ${target.firstName} ${target.lastName} (${changes.join(", ")})`,
      details: { before: { roles: target.roles, ...Object.fromEntries(changes.map((k) => [k, target[k]])) }, after: { roles, ...Object.fromEntries(changes.map((k) => [k, data[k] ?? null])) } },
    });
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

  const password = guardian ? null : generateInitialPassword();
  const passwordHash = password ? await hashInitialPassword(password) : null;

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
            passwordHash: passwordHash!,
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

  const guardianName = `${guardian!.firstName} ${guardian!.lastName}`;
  await audit({
    actorId: actor.id,
    action: "familia.vincular",
    entity: "User",
    entityId: studentUserId,
    summary: `Vinculó a ${guardianName} como responsable de ${student.user.firstName} ${student.user.lastName}${password ? " (cuenta nueva)" : ""}`,
  });
  revalidatePath(`/personas/${studentUserId}`);
  return password
    ? { ok: true, message: "Adulto responsable vinculado", credentials: { name: guardianName, dni, password, href: `/personas/${guardian!.id}` } }
    : { ok: true, message: "Adulto responsable vinculado" };
}

export async function removeGuardian(linkId: string) {
  const actor = await requireRole(MANAGE_ROLES);
  const link = await db.studentGuardian.findUnique({ where: { id: linkId }, include: { student: true } });
  if (!link) return;
  await loadManageable(actor, link.student.userId);
  await db.studentGuardian.delete({ where: { id: linkId } });
  await audit({ actorId: actor.id, action: "familia.desvincular", entity: "User", entityId: link.student.userId, summary: `Desvinculó a un responsable (usuario ${link.guardianId})`, details: { guardianId: link.guardianId } });
  revalidatePath(`/personas/${link.student.userId}`);
}

export async function resetPassword(userId: string): Promise<FormState> {
  const actor = await requireRole(MANAGE_ROLES);
  const target = await loadManageable(actor, userId);
  if (actor.id === userId) return { error: "Para tu propia cuenta usá Seguridad de la cuenta." };
  const password = generateInitialPassword();
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { passwordHash: await hashInitialPassword(password), mustChangePassword: true },
    }),
    db.session.deleteMany({ where: { userId } }),
  ]);
  const name = `${target.firstName} ${target.lastName}`;
  await audit({ actorId: actor.id, action: "contrasena.restablecer", entity: "User", entityId: userId, summary: `Restableció la contraseña de ${name}` });
  return { ok: true, credentials: { name, dni: target.dni, password } };
}

/** Quita la verificación en dos pasos (por ejemplo, si la persona perdió el teléfono). */
export async function resetTwoFactor(userId: string): Promise<FormState> {
  const actor = await requireRole(["SUPERADMIN", "DIRECTIVO"]);
  const target = await loadManageable(actor, userId);
  if (actor.id === userId) return { error: "Para tu propia cuenta usá Seguridad de la cuenta." };
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null } }),
    db.recoveryCode.deleteMany({ where: { userId } }),
    db.session.deleteMany({ where: { userId } }),
  ]);
  await audit({ actorId: actor.id, action: "2fa.quitar", entity: "User", entityId: userId, summary: `Quitó la verificación en dos pasos de ${target.firstName} ${target.lastName}` });
  revalidatePath(`/personas/${userId}`);
  return { ok: true, message: "Listo. Va a poder ingresar sólo con la contraseña y volver a activarla." };
}

export async function setUserActive(userId: string, active: boolean) {
  const actor = await requireRole(MANAGE_ROLES);
  if (actor.id === userId) return;
  const target = await loadManageable(actor, userId);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { active } }),
    // Al desactivar se cierran todas sus sesiones abiertas.
    ...(active ? [] : [db.session.deleteMany({ where: { userId } })]),
  ]);
  await audit({
    actorId: actor.id,
    action: active ? "persona.reactivar" : "persona.desactivar",
    entity: "User",
    entityId: userId,
    summary: `${active ? "Reactivó" : "Desactivó"} la cuenta de ${target.firstName} ${target.lastName}`,
  });
  revalidatePath(`/personas/${userId}`);
}

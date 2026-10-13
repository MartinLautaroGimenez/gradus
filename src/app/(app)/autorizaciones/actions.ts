"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { todayInMendoza } from "@/lib/attendance";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";
import { managedCourses } from "@/lib/scope";
import { type FormState, fromZodError, optionalDate, optionalText } from "@/lib/validation";

const schema = z
  .object({
    title: z.string().trim().min(3, "Poné un título").max(120),
    description: z.string().trim().min(5, "Explicá de qué se trata").max(4000),
    eventDate: optionalDate,
    deadline: optionalDate,
    courseIds: z.array(z.string()).min(1, "Elegí al menos un curso"),
    addToCalendar: z.boolean(),
  })
  .refine((d) => !d.deadline || !d.eventDate || d.deadline <= d.eventDate, {
    message: "El plazo para responder tiene que ser antes de la actividad",
    path: ["deadline"],
  });

const shortDate = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "UTC" });

/** Adultos responsables de los alumnos activos de los cursos, con qué alumno los vincula. */
async function guardiansOf(courseIds: string[], onlyEnrollments?: string[]) {
  return db.studentGuardian.findMany({
    where: {
      guardian: { active: true },
      student: {
        enrollments: {
          some: { status: "ACTIVA", courseId: { in: courseIds }, ...(onlyEnrollments ? { id: { in: onlyEnrollments } } : {}) },
        },
      },
    },
    select: { guardianId: true },
  });
}

export async function createAuthorization(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const courses = await managedCourses(user);
  if (courses.length === 0) return { error: "No tenés permiso para pedir autorizaciones" };
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData),
    courseIds: formData.getAll("courseIds"),
    addToCalendar: formData.get("addToCalendar") === "on",
  });
  if (!parsed.success) return fromZodError(parsed.error);
  const { courseIds, addToCalendar, ...data } = parsed.data;
  const allowed = new Set(courses.map((c) => c.id));
  if (courseIds.some((id) => !allowed.has(id))) return { error: "Curso inválido" };

  const request = await db.authorizationRequest.create({
    data: { ...data, createdById: user.id, courses: { create: courseIds.map((courseId) => ({ courseId })) } },
  });
  if (addToCalendar && data.eventDate) {
    await db.calendarEvent.create({
      data: {
        title: data.title,
        description: data.description,
        kind: "SALIDA",
        startDate: data.eventDate,
        createdById: user.id,
        courses: { create: courseIds.map((courseId) => ({ courseId })) },
      },
    });
  }
  const guardians = await guardiansOf(courseIds);
  await notify(
    guardians.map((g) => g.guardianId),
    {
      kind: "AUTORIZACION",
      title: `Autorización: ${data.title}`,
      body: data.deadline ? `Respondé antes del ${shortDate(data.deadline)}.` : "Entrá para autorizar o no.",
      link: `/autorizaciones/${request.id}`,
    },
  );
  revalidatePath("/autorizaciones");
  redirect(`/autorizaciones/${request.id}?creada=1`);
}

const responseSchema = z.object({
  enrollmentId: z.string(),
  authorized: z.enum(["si", "no"]),
  comment: optionalText.pipe(z.string().max(1000).nullable()),
});

export async function respondAuthorization(requestId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = responseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Elegí si autorizás o no" };
  const { enrollmentId, authorized, comment } = parsed.data;

  const request = await db.authorizationRequest.findUnique({ where: { id: requestId }, include: { courses: true } });
  if (!request) return { error: "La autorización ya no existe" };
  if (request.deadline && request.deadline.toISOString().slice(0, 10) < todayInMendoza()) {
    return { error: "Venció el plazo para responder. Comunicate con la escuela." };
  }
  const enrollment = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { student: { include: { guardians: true } } },
  });
  const valid =
    enrollment &&
    enrollment.status === "ACTIVA" &&
    request.courses.some((c) => c.courseId === enrollment.courseId) &&
    enrollment.student.guardians.some((g) => g.guardianId === user.id);
  if (!valid) return { error: "Sólo puede responder un adulto responsable del alumno" };

  await db.authorizationResponse.upsert({
    where: { requestId_enrollmentId: { requestId, enrollmentId } },
    update: { authorized: authorized === "si", comment, guardianId: user.id, respondedAt: new Date() },
    create: { requestId, enrollmentId, authorized: authorized === "si", comment, guardianId: user.id },
  });
  revalidatePath(`/autorizaciones/${requestId}`);
  revalidatePath("/autorizaciones");
  return { ok: true, message: authorized === "si" ? "Autorizado" : "Registramos que no lo autorizás" };
}

async function loadManageable(requestId: string) {
  const user = await requireUser();
  const request = await db.authorizationRequest.findUnique({ where: { id: requestId }, include: { courses: true, responses: true } });
  if (!request || (request.createdById !== user.id && !hasAnyRole(user, STAFF_ROLES))) return null;
  return request;
}

export async function remindAuthorization(requestId: string): Promise<FormState> {
  const request = await loadManageable(requestId);
  if (!request) return { error: "Sin permiso" };
  const pending = await db.enrollment.findMany({
    where: {
      status: "ACTIVA",
      courseId: { in: request.courses.map((c) => c.courseId) },
      id: { notIn: request.responses.map((r) => r.enrollmentId) },
    },
    select: { id: true },
  });
  const guardians = await guardiansOf(
    request.courses.map((c) => c.courseId),
    pending.map((p) => p.id),
  );
  await notify(
    guardians.map((g) => g.guardianId),
    {
      kind: "AUTORIZACION",
      title: `Recordatorio: falta responder "${request.title}"`,
      body: request.deadline ? `El plazo vence el ${shortDate(request.deadline)}.` : null,
      link: `/autorizaciones/${requestId}`,
    },
  );
  return { ok: true, message: `Recordatorio enviado a ${new Set(guardians.map((g) => g.guardianId)).size} familias` };
}

export async function deleteAuthorization(requestId: string) {
  const request = await loadManageable(requestId);
  if (!request) return;
  await db.authorizationRequest.delete({ where: { id: requestId } });
  await db.notification.deleteMany({ where: { link: `/autorizaciones/${requestId}` } });
  revalidatePath("/autorizaciones");
  redirect("/autorizaciones");
}

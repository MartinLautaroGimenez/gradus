"use server";

import type { EventKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveRecipients } from "@/lib/announcements/audience";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { EVENT_LABELS } from "@/lib/calendar";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";
import { managedCourses } from "@/lib/scope";
import { type FormState, fromZodError, optionalDate, optionalText, requiredDate } from "@/lib/validation";

/** Tipos que pueden cargar docentes y preceptores (feriados y recesos los carga la escuela). */
const COURSE_KINDS: EventKind[] = ["EVALUACION", "SALIDA", "REUNION", "OTRO", "ACTO"];

const schema = z
  .object({
    title: z.string().trim().min(2, "Poné un título").max(120),
    description: optionalText,
    kind: z.enum(Object.keys(EVENT_LABELS) as [EventKind, ...EventKind[]]),
    startDate: requiredDate,
    endDate: optionalDate,
    time: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .pipe(z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida").nullable()),
    location: optionalText,
    scope: z.enum(["escuela", "cursos"]),
    courseIds: z.array(z.string()),
    notify: z.boolean(),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, { message: "El fin no puede ser antes del inicio", path: ["endDate"] });

function read(formData: FormData) {
  return schema.safeParse({
    ...Object.fromEntries(formData),
    scope: formData.get("scope") ?? "cursos",
    courseIds: formData.getAll("courseIds"),
    notify: formData.get("notify") === "on",
  });
}

async function validateScope(user: Awaited<ReturnType<typeof requireUser>>, data: z.infer<typeof schema>): Promise<FormState | string[]> {
  const staff = hasAnyRole(user, STAFF_ROLES);
  const courses = await managedCourses(user);
  if (courses.length === 0) return { error: "No tenés permiso para cargar eventos" };
  if (!staff && !COURSE_KINDS.includes(data.kind)) return { error: "Ese tipo de evento lo carga la escuela" };
  const courseIds = data.scope === "escuela" ? [] : data.courseIds;
  if (courseIds.length === 0 && !staff) return { error: "Elegí al menos un curso", fieldErrors: { courseIds: ["Elegí al menos un curso"] } };
  if (data.scope === "cursos" && courseIds.length === 0) return { error: "Elegí al menos un curso", fieldErrors: { courseIds: ["Elegí al menos un curso"] } };
  const allowed = new Set(courses.map((c) => c.id));
  if (courseIds.some((id) => !allowed.has(id))) return { error: "Curso inválido" };
  return courseIds;
}

function eventDay(date: Date) {
  return date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export async function createEvent(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = read(formData);
  if (!parsed.success) return fromZodError(parsed.error);
  const courseIds = await validateScope(user, parsed.data);
  if (!Array.isArray(courseIds)) return courseIds;
  const { scope: _scope, courseIds: _ids, notify: shouldNotify, ...data } = parsed.data;

  const event = await db.calendarEvent.create({
    data: { ...data, createdById: user.id, courses: { create: courseIds.map((courseId) => ({ courseId })) } },
  });

  if (shouldNotify) {
    const year = await db.academicYear.findFirst({ where: { active: true } });
    if (year) {
      const recipients = await resolveRecipients({ roles: ["TUTOR", "ALUMNO"], courseIds, yearId: year.id });
      await notify(
        recipients.filter((id) => id !== user.id),
        {
          kind: "CALENDARIO",
          title: `${EVENT_LABELS[data.kind]}: ${data.title}`,
          body: `${eventDay(data.startDate)}${data.time ? ` a las ${data.time}` : ""}${data.location ? ` · ${data.location}` : ""}`,
          link: `/calendario/${event.id}`,
        },
      );
    }
  }
  revalidatePath("/calendario");
  redirect(`/calendario?mes=${data.startDate.toISOString().slice(0, 7)}`);
}

async function loadEditable(id: string) {
  const user = await requireUser();
  const event = await db.calendarEvent.findUnique({ where: { id } });
  if (!event || (event.createdById !== user.id && !hasAnyRole(user, STAFF_ROLES))) return null;
  return { user, event };
}

export async function updateEvent(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const loaded = await loadEditable(id);
  if (!loaded) return { error: "No podés editar este evento" };
  const parsed = read(formData);
  if (!parsed.success) return fromZodError(parsed.error);
  const courseIds = await validateScope(loaded.user, parsed.data);
  if (!Array.isArray(courseIds)) return courseIds;
  const { scope: _scope, courseIds: _ids, notify: _notify, ...data } = parsed.data;
  await db.$transaction([
    db.calendarEventCourse.deleteMany({ where: { eventId: id } }),
    db.calendarEvent.update({ where: { id }, data: { ...data, courses: { create: courseIds.map((courseId) => ({ courseId })) } } }),
  ]);
  revalidatePath("/calendario");
  redirect(`/calendario/${id}`);
}

export async function deleteEvent(id: string) {
  const loaded = await loadEditable(id);
  if (!loaded) return;
  await db.calendarEvent.delete({ where: { id } });
  await db.notification.deleteMany({ where: { link: `/calendario/${id}` } });
  revalidatePath("/calendario");
  redirect(`/calendario?mes=${loaded.event.startDate.toISOString().slice(0, 7)}`);
}

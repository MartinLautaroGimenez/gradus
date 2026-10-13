"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { INCIDENT_LABELS, allowedKinds } from "@/lib/discipline";
import { notify } from "@/lib/notifications/notify";
import { type FormState, fromZodError, optionalText, requiredDate } from "@/lib/validation";

const schema = z.object({
  enrollmentId: z.string().min(1, "Elegí un alumno"),
  kind: z.enum(Object.keys(INCIDENT_LABELS) as [keyof typeof INCIDENT_LABELS, ...(keyof typeof INCIDENT_LABELS)[]]),
  date: requiredDate,
  description: z.string().trim().min(5, "Describí lo sucedido").max(4000),
  measures: optionalText,
  requiresSignature: z.boolean(),
});

export async function createIncident(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse({ ...Object.fromEntries(formData), requiresSignature: formData.get("requiresSignature") === "on" });
  if (!parsed.success) return fromZodError(parsed.error);
  const data = parsed.data;

  const enrollment = await db.enrollment.findUnique({
    where: { id: data.enrollmentId },
    include: {
      course: { include: { subjects: { select: { teacherId: true } } } },
      student: { include: { user: true, guardians: { select: { guardianId: true } } } },
    },
  });
  if (!enrollment || enrollment.status !== "ACTIVA") return { error: "Alumno inválido" };
  const kinds = allowedKinds(user, {
    preceptorId: enrollment.course.preceptorId,
    teacherIds: enrollment.course.subjects.flatMap((s) => (s.teacherId ? [s.teacherId] : [])),
  });
  if (!kinds.includes(data.kind)) return { error: "No podés registrar ese tipo de hecho para este alumno" };

  const incident = await db.incident.create({
    data: {
      enrollmentId: enrollment.id,
      kind: data.kind,
      date: data.date,
      description: data.description,
      measures: data.measures,
      requiresSignature: data.requiresSignature,
      createdById: user.id,
    },
  });

  const name = enrollment.student.user.firstName;
  const guardians = enrollment.student.guardians.map((g) => g.guardianId);
  await notify([...guardians, enrollment.student.userId], {
    kind: "CONVIVENCIA",
    title:
      data.kind === "RECONOCIMIENTO"
        ? `Reconocimiento para ${name}`
        : `${INCIDENT_LABELS[data.kind]} — ${name}${data.requiresSignature ? " (requiere firma)" : ""}`,
    body: data.description.slice(0, 300),
    link: `/convivencia/${incident.id}`,
  });

  revalidatePath("/convivencia");
  redirect(`/convivencia/${incident.id}?creado=1`);
}

const signSchema = z.object({ comment: optionalText.pipe(z.string().max(2000).nullable()) });

/** La familia firma que se notificó (con comentario o descargo opcional). */
export async function signIncident(incidentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: { enrollment: { include: { student: { include: { guardians: true } } } } },
  });
  if (!incident || !incident.enrollment.student.guardians.some((g) => g.guardianId === user.id)) {
    return { error: "Sólo puede firmar un adulto responsable del alumno" };
  }
  const parsed = signSchema.safeParse({ comment: formData.get("comment") ?? undefined });
  if (!parsed.success) return fromZodError(parsed.error);
  await db.incidentSignature.upsert({
    where: { incidentId_userId: { incidentId, userId: user.id } },
    update: {},
    create: { incidentId, userId: user.id, comment: parsed.data.comment },
  });
  if (incident.createdById && parsed.data.comment) {
    await notify([incident.createdById], {
      kind: "CONVIVENCIA",
      title: `${user.firstName} ${user.lastName} firmó y dejó un comentario`,
      body: parsed.data.comment,
      link: `/convivencia/${incidentId}`,
    });
  }
  revalidatePath(`/convivencia/${incidentId}`);
  return { ok: true, message: "Firmado" };
}

export async function deleteIncident(incidentId: string) {
  const user = await requireUser();
  const incident = await db.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return;
  if (incident.createdById !== user.id && !hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO"])) return;
  await db.incident.delete({ where: { id: incidentId } });
  await db.notification.deleteMany({ where: { link: `/convivencia/${incidentId}` } });
  revalidatePath("/convivencia");
  redirect("/convivencia");
}

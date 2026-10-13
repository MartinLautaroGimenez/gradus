"use server";

import type { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AUDIENCE_ROLES, canManageAnnouncement, resolveRecipients, sendingScope } from "@/lib/announcements/audience";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";
import { MAX_ATTACHMENTS, deleteStored, saveUpload, validateUpload } from "@/lib/storage";
import { type FormState, fromZodError } from "@/lib/validation";

const schema = z.object({
  title: z.string().trim().min(3, "Poné un título").max(120, "Máximo 120 caracteres"),
  body: z.string().trim().min(1, "Escribí el comunicado").max(10000, "Demasiado largo"),
  roles: z.array(z.enum(AUDIENCE_ROLES as [Role, ...Role[]])).min(1, "Elegí a quién va dirigido"),
  scope: z.enum(["escuela", "cursos"]),
  courseIds: z.array(z.string()),
  requiresAck: z.boolean(),
});

export async function createAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const scope = await sendingScope(user);
  if (!scope) return { error: "No tenés permiso para enviar comunicados" };

  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    roles: formData.getAll("roles"),
    scope: formData.get("scope") ?? "cursos",
    courseIds: formData.getAll("courseIds"),
    requiresAck: formData.get("requiresAck") === "on",
  });
  if (!parsed.success) return fromZodError(parsed.error);
  const data = parsed.data;

  if (data.roles.some((role) => !scope.roles.includes(role))) return { error: "No podés enviar a alguno de esos destinatarios" };
  const courseIds = data.scope === "escuela" ? [] : data.courseIds;
  if (courseIds.length === 0 && !scope.canSendSchoolWide) {
    return { error: "Elegí al menos un curso", fieldErrors: { courseIds: ["Elegí al menos un curso"] } };
  }
  if (data.scope === "cursos" && courseIds.length === 0) {
    return { error: "Elegí al menos un curso", fieldErrors: { courseIds: ["Elegí al menos un curso"] } };
  }
  const allowedCourses = new Set(scope.courses.map((c) => c.id));
  if (courseIds.some((id) => !allowedCourses.has(id))) return { error: "Curso inválido" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_ATTACHMENTS) return { error: `Máximo ${MAX_ATTACHMENTS} adjuntos` };
  for (const file of files) {
    const problem = validateUpload(file);
    if (problem) return { error: problem, fieldErrors: { files: [problem] } };
  }

  const recipients = (await resolveRecipients({ roles: data.roles, courseIds, yearId: scope.yearId })).filter(
    (id) => id !== user.id,
  );
  if (recipients.length === 0) return { error: "Con esos filtros no hay ningún destinatario" };

  const saved = await Promise.all(files.map(saveUpload));
  let announcementId: string;
  try {
    const announcement = await db.announcement.create({
      data: {
        title: data.title,
        body: data.body,
        requiresAck: data.requiresAck,
        targetRoles: data.roles,
        authorId: user.id,
        courses: { create: courseIds.map((courseId) => ({ courseId })) },
        recipients: { createMany: { data: recipients.map((userId) => ({ userId })) } },
        attachments: { createMany: { data: saved.map((file) => ({ ...file, uploadedById: user.id })) } },
      },
    });
    announcementId = announcement.id;
  } catch (error) {
    await Promise.all(saved.map((file) => deleteStored(file.storageKey)));
    throw error;
  }

  await notify(recipients, {
    kind: "COMUNICADO",
    title: data.requiresAck ? `Comunicado (requiere notificarse): ${data.title}` : `Comunicado: ${data.title}`,
    body: data.body.slice(0, 300),
    link: `/comunicados/${announcementId}`,
  });

  revalidatePath("/comunicados");
  redirect(`/comunicados/${announcementId}?enviado=1`);
}

export async function acknowledgeAnnouncement(announcementId: string) {
  const user = await requireUser();
  await db.announcementRecipient.updateMany({
    where: { announcementId, userId: user.id, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), readAt: new Date() },
  });
  revalidatePath(`/comunicados/${announcementId}`);
  revalidatePath("/comunicados");
}

/** Vuelve a avisar a quienes todavía no leyeron (o no se notificaron, si lo pide). */
export async function remindPending(announcementId: string): Promise<FormState> {
  const user = await requireUser();
  const announcement = await db.announcement.findUnique({ where: { id: announcementId } });
  if (!announcement || !(canManageAnnouncement(user, announcement.authorId))) return { error: "Sin permiso" };
  const pending = await db.announcementRecipient.findMany({
    where: { announcementId, ...(announcement.requiresAck ? { acknowledgedAt: null } : { readAt: null }) },
    select: { userId: true },
  });
  await notify(
    pending.map((p) => p.userId),
    {
      kind: "COMUNICADO",
      title: `Recordatorio: ${announcement.title}`,
      body: announcement.requiresAck ? "Todavía no te notificaste de este comunicado." : "Todavía no leíste este comunicado.",
      link: `/comunicados/${announcementId}`,
    },
  );
  return { ok: true, message: `Se envió un recordatorio a ${pending.length} ${pending.length === 1 ? "persona" : "personas"}` };
}

export async function deleteAnnouncement(announcementId: string) {
  const user = await requireUser();
  const announcement = await db.announcement.findUnique({ where: { id: announcementId }, include: { attachments: true } });
  if (!announcement || !(canManageAnnouncement(user, announcement.authorId))) return;
  await db.announcement.delete({ where: { id: announcementId } });
  await Promise.all(announcement.attachments.map((a) => deleteStored(a.storageKey)));
  await db.notification.deleteMany({ where: { link: `/comunicados/${announcementId}` } });
  revalidatePath("/comunicados");
  redirect("/comunicados?vista=enviados");
}

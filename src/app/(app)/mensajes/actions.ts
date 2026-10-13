"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { canMessage } from "@/lib/messaging/contacts";
import { notify } from "@/lib/notifications/notify";
import type { FormState } from "@/lib/validation";

const bodySchema = z.string().trim().min(1, "Escribí un mensaje").max(4000, "Máximo 4000 caracteres");

async function deliver(conversationId: string, senderId: string, senderName: string, body: string) {
  const now = new Date();
  await db.$transaction([
    db.message.create({ data: { conversationId, senderId, body, createdAt: now } }),
    db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
    db.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: senderId } },
      data: { lastReadAt: now },
    }),
  ]);
  const link = `/mensajes/${conversationId}`;
  const others = await db.conversationParticipant.findMany({ where: { conversationId, userId: { not: senderId } } });
  for (const other of others) {
    // Un aviso por conversación mientras no lo lea: no se llena la bandeja.
    const pending = await db.notification.findFirst({ where: { userId: other.userId, link, readAt: null } });
    if (!pending) {
      await notify([other.userId], { kind: "MENSAJE", title: `Mensaje de ${senderName}`, body: body.slice(0, 200), link });
    }
  }
}

export async function sendMessage(conversationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const participant = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
  });
  if (!participant) return { error: "No participás de esta conversación" };
  const parsed = bodySchema.safeParse(formData.get("body"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await deliver(conversationId, user.id, `${user.firstName} ${user.lastName}`, parsed.data);
  revalidatePath(`/mensajes/${conversationId}`);
  revalidatePath("/mensajes");
  return { ok: true };
}

export async function startConversation(recipientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await canMessage(user, recipientId))) return { error: "No podés escribirle a esa persona" };
  const parsed = bodySchema.safeParse(formData.get("body"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Si ya hay una conversación entre los dos, se sigue en esa.
  const existing = await db.conversation.findFirst({
    where: { AND: [{ participants: { some: { userId: user.id } } }, { participants: { some: { userId: recipientId } } }] },
  });
  const conversation =
    existing ??
    (await db.conversation.create({
      data: { participants: { create: [{ userId: user.id }, { userId: recipientId }] } },
    }));
  await deliver(conversation.id, user.id, `${user.firstName} ${user.lastName}`, parsed.data);
  revalidatePath("/mensajes");
  redirect(`/mensajes/${conversation.id}`);
}

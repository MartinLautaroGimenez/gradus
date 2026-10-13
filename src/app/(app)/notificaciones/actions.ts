"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function markAllRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function setEmailNotifications(enabled: boolean) {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { emailNotifications: enabled } });
  revalidatePath("/notificaciones");
}

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function savePushSubscription(raw: unknown, userAgent: string) {
  const user = await requireUser();
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const { endpoint, keys } = parsed.data;
  await db.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent.slice(0, 255) },
    create: { endpoint, userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent.slice(0, 255) },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const user = await requireUser();
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true };
}

/** Manda un aviso de prueba a la propia persona, para verificar que el push llega. */
export async function sendTestNotification() {
  const user = await requireUser();
  const { notify } = await import("@/lib/notifications/notify");
  await notify([user.id], {
    kind: "SISTEMA",
    title: "Prueba de notificaciones",
    body: "Si ves este aviso en tu celular o computadora, las notificaciones funcionan.",
    link: "/notificaciones",
  });
  revalidatePath("/", "layout");
}

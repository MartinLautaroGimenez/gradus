import "server-only";
import type { NotificationKind } from "@prisma/client";
import { after } from "next/server";
import { db } from "@/lib/db";
import { emailEnabled, sendEmail } from "./email";
import { pushEnabled, sendPush } from "./push";

export type NotificationPayload = {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
};

/**
 * Crea el aviso en la bandeja de cada persona y, después de responder la
 * request, lo envía por push y email. La bandeja es la fuente de verdad: si el
 * push o el email fallan, el aviso igual está ahí.
 */
export async function notify(userIds: string[], payload: NotificationPayload) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const created = await db.notification.createManyAndReturn({
    data: unique.map((userId) => ({ userId, ...payload, body: payload.body?.slice(0, 500) ?? null })),
    select: { id: true, userId: true },
  });
  if (!pushEnabled() && !emailEnabled()) return;
  after(() => deliver(created, payload));
}

async function deliver(created: { id: string; userId: string }[], payload: NotificationPayload) {
  const users = await db.user.findMany({
    where: { id: { in: created.map((c) => c.userId) }, active: true },
    select: { id: true, email: true, emailNotifications: true, pushSubscriptions: true },
  });
  const byUser = new Map(users.map((u) => [u.id, u]));

  for (const { id, userId } of created) {
    const user = byUser.get(userId);
    if (!user) continue;
    let pushed = false;
    for (const subscription of user.pushSubscriptions) {
      const result = await sendPush(subscription, payload);
      if (result === "sent") pushed = true;
      if (result === "gone") await db.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
    }
    const emailed = user.email && user.emailNotifications ? await sendEmail(user.email, payload) : false;
    if (pushed || emailed) {
      await db.notification.update({
        where: { id },
        data: { pushSentAt: pushed ? new Date() : undefined, emailSentAt: emailed ? new Date() : undefined },
      });
    }
  }
}

/** Adultos responsables de los alumnos indicados (por matrícula). */
export async function guardiansOfEnrollments(enrollmentIds: string[]) {
  const links = await db.studentGuardian.findMany({
    where: { student: { enrollments: { some: { id: { in: enrollmentIds } } } }, guardian: { active: true } },
    select: { guardianId: true, student: { select: { enrollments: { select: { id: true } } } } },
  });
  return links;
}

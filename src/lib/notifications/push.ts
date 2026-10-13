import "server-only";
import webpush from "web-push";

let configured: boolean | null = null;

/** Web Push sólo funciona si están las claves VAPID (ver docs/DESPLIEGUE.md). */
export function pushEnabled() {
  if (configured === null) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    configured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
    if (configured) {
      webpush.setVapidDetails(VAPID_SUBJECT || "mailto:admin@localhost", VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
    }
  }
  return configured;
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export type PushResult = "sent" | "gone" | "failed";

export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body?: string | null; link?: string | null },
): Promise<PushResult> {
  if (!pushEnabled()) return "failed";
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // 404/410: el navegador dio de baja la suscripción.
    if (status === 404 || status === 410) return "gone";
    console.error("[push] error", status, (error as Error).message);
    return "failed";
  }
}

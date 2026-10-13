import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transport: Transporter | null | undefined;

/** El email es opcional: se activa configurando SMTP_URL (ver docs/DESPLIEGUE.md). */
export function emailEnabled() {
  if (transport === undefined) {
    transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL, { pool: true } as object) : null;
  }
  return transport !== null;
}

function absoluteUrl(path: string) {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendEmail(to: string, notification: { title: string; body?: string | null; link?: string | null }) {
  if (!emailEnabled()) return false;
  const link = notification.link ? absoluteUrl(notification.link) : absoluteUrl("/notificaciones");
  const body = notification.body ?? "";
  try {
    await transport!.sendMail({
      from: process.env.MAIL_FROM ?? "Gradus <no-responder@localhost>",
      to,
      subject: notification.title,
      text: `${notification.title}\n\n${body}\n\nVer en Gradus: ${link}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="font-size:18px">${escapeHtml(notification.title)}</h2>
        <p style="white-space:pre-line;color:#334155">${escapeHtml(body)}</p>
        <p><a href="${link}" style="display:inline-block;background:#3b5bdb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ver en Gradus</a></p>
        <p style="color:#94a3b8;font-size:12px">Podés desactivar estos emails desde Gradus → Notificaciones.</p>
      </div>`,
    });
    return true;
  } catch (error) {
    console.error("[email] error", (error as Error).message);
    return false;
  }
}

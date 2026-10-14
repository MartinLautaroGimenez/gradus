import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { getReadyUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { readStored } from "@/lib/storage";

/** Descarga de adjuntos con control de permisos. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getReadyUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { id } = await params;

  const file = await db.attachment.findUnique({ where: { id }, include: { announcement: true } });
  if (!file) return new Response("No encontrado", { status: 404 });

  let allowed = hasAnyRole(user, STAFF_ROLES) || file.uploadedById === user.id;
  if (!allowed && file.announcementId) {
    allowed =
      file.announcement?.authorId === user.id ||
      !!(await db.announcementRecipient.findUnique({
        where: { announcementId_userId: { announcementId: file.announcementId, userId: user.id } },
      }));
  }
  if (!allowed) return new Response("No encontrado", { status: 404 });

  const data = await readStored(file.storageKey);
  // Imágenes y PDF se abren en el navegador; el resto se descarga.
  const inline = file.mimeType.startsWith("image/") || file.mimeType === "application/pdf";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      // Aunque un archivo tuviera código, el navegador no lo ejecuta. (El visor de
      // PDF de Chrome no abre en modo sandbox; los PDF ya se validan por contenido.)
      ...(file.mimeType === "application/pdf"
        ? {}
        : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

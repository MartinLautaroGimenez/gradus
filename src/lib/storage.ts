import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { SIGNATURE_BYTES, matchesSignature } from "./file-signature";

/** Carpeta donde se guardan los adjuntos. En el servidor conviene una ruta absoluta con backup. */
const ROOT = path.resolve(process.env.STORAGE_DIR ?? "./storage");

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

const ALLOWED: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
};

export async function validateUpload(file: File): Promise<string | null> {
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED[ext]) return `"${file.name}": formato no permitido (PDF, imágenes, Word, Excel, PowerPoint o texto)`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `"${file.name}" supera los 10 MB`;
  if (file.size === 0) return `"${file.name}" está vacío`;
  const head = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
  if (!matchesSignature(ext, head)) return `"${file.name}": el contenido no corresponde a un archivo ${ext.slice(1).toUpperCase()}`;
  return null;
}

/** Guarda el archivo con un nombre aleatorio (nunca el nombre original) y devuelve sus datos. */
export async function saveUpload(file: File) {
  const ext = path.extname(file.name).toLowerCase();
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}${ext}`;
  const target = path.join(ROOT, key);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o750 });
  // Sólo el usuario del servicio puede leerlo (y el grupo, para backups).
  await writeFile(target, Buffer.from(await file.arrayBuffer()), { mode: 0o640, flag: "wx" });
  return {
    storageKey: key,
    fileName: file.name.slice(0, 200),
    mimeType: ALLOWED[ext],
    size: file.size,
  };
}

function resolveKey(key: string) {
  const target = path.join(ROOT, key);
  // Evita que una clave manipulada lea fuera de la carpeta.
  if (!target.startsWith(ROOT + path.sep)) throw new Error("Clave de archivo inválida");
  return target;
}

export function readStored(key: string) {
  return readFile(resolveKey(key));
}

export async function deleteStored(key: string) {
  await unlink(resolveKey(key)).catch(() => {});
}

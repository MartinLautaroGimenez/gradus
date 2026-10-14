/**
 * Verifica que el contenido de un archivo coincida con su extensión mirando
 * los primeros bytes ("firma"). Así no se puede subir, por ejemplo, un HTML o
 * un ejecutable renombrado como .pdf o .jpg.
 */
const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, i) => bytes[offset + i] === value);

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // docx, xlsx, pptx
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // doc, xls, ppt

const CHECKS: Record<string, (bytes: Uint8Array) => boolean> = {
  ".pdf": (b) => startsWith(b, ascii("%PDF-")),
  ".png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ".jpg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  ".jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  ".gif": (b) => startsWith(b, ascii("GIF87a")) || startsWith(b, ascii("GIF89a")),
  ".webp": (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8),
  ".docx": (b) => startsWith(b, ZIP),
  ".xlsx": (b) => startsWith(b, ZIP),
  ".pptx": (b) => startsWith(b, ZIP),
  ".doc": (b) => startsWith(b, OLE),
  ".xls": (b) => startsWith(b, OLE),
  ".ppt": (b) => startsWith(b, OLE),
  // Texto: sin bytes nulos (los binarios casi siempre los tienen).
  ".txt": (b) => !b.includes(0),
};

/** Cuántos bytes hay que leer del principio del archivo. */
export const SIGNATURE_BYTES = 4096;

export function matchesSignature(extension: string, head: Uint8Array) {
  const check = CHECKS[extension.toLowerCase()];
  return !!check && check(head);
}

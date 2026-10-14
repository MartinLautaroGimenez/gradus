import { describe, expect, it } from "vitest";
import { matchesSignature } from "./file-signature";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));

describe("matchesSignature", () => {
  it("acepta archivos cuyo contenido coincide con la extensión", () => {
    expect(matchesSignature(".pdf", bytes("%PDF-1.7\n"))).toBe(true);
    expect(matchesSignature(".PNG", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(true);
    expect(matchesSignature(".jpg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesSignature(".webp", bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe(true);
    expect(matchesSignature(".docx", bytes("PK", 3, 4, 20))).toBe(true);
    expect(matchesSignature(".xls", bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBe(true);
    expect(matchesSignature(".txt", bytes("Hola, familias"))).toBe(true);
  });

  it("rechaza archivos renombrados", () => {
    expect(matchesSignature(".pdf", bytes("<html><script>alert(1)</script>"))).toBe(false);
    expect(matchesSignature(".jpg", bytes("MZ", 0x90, 0))).toBe(false);
    expect(matchesSignature(".docx", bytes("%PDF-1.4"))).toBe(false);
    expect(matchesSignature(".txt", bytes("MZ", 0, 0, 0))).toBe(false);
    expect(matchesSignature(".exe", bytes("MZ"))).toBe(false);
  });
});

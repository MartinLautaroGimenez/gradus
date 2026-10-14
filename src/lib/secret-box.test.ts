import { describe, expect, it } from "vitest";
import { seal, unseal } from "./secret-box";

describe("secret-box", () => {
  it("cifra y descifra", () => {
    const sealed = seal("JBSWY3DPEHPK3PXP");
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(unseal(sealed)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("cada cifrado es distinto", () => {
    expect(seal("abc")).not.toBe(seal("abc"));
  });

  it("rechaza datos alterados", () => {
    const parts = seal("abc").split(":");
    parts[3] = Buffer.from("xyz").toString("base64url");
    expect(() => unseal(parts.join(":"))).toThrow();
  });
});

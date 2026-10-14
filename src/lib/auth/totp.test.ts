import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, hotp, normalizeRecoveryCode, verifyTotp } from "./totp";

// Vectores de prueba del RFC 6238 (SHA1): secreto "12345678901234567890".
const SECRET = Buffer.from("12345678901234567890");
const SECRET_B32 = base32Encode(SECRET);

describe("TOTP", () => {
  it("base32 ida y vuelta", () => {
    expect(SECRET_B32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(SECRET_B32).equals(SECRET)).toBe(true);
  });

  it("coincide con los vectores del RFC 6238", () => {
    // T = 59 s → 94287082 (8 dígitos); T = 1111111109 → 07081804
    expect(hotp(SECRET, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(hotp(SECRET, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(hotp(SECRET, Math.floor(1234567890 / 30), 8)).toBe("89005924");
  });

  it("acepta el código actual y los vecinos, y rechaza otros", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    const code = hotp(SECRET, step);
    expect(verifyTotp(SECRET_B32, code, now)).toBe(step);
    expect(verifyTotp(SECRET_B32, hotp(SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(SECRET_B32, hotp(SECRET, step - 3), now)).toBeNull();
    expect(verifyTotp(SECRET_B32, "12345", now)).toBeNull();
    expect(verifyTotp(SECRET_B32, "abcdef", now)).toBeNull();
  });

  it("códigos de recuperación únicos y normalizables", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(normalizeRecoveryCode(" ABCD-EF23 ")).toBe("abcdef23");
  });
});

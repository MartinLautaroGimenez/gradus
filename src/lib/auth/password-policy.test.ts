import { describe, expect, it } from "vitest";
import { passwordProblem } from "./password-policy";

const person = { dni: "40123456", firstName: "Valentina", lastName: "González", email: "vale.gonzalez@example.com" };

describe("passwordProblem", () => {
  it("acepta frases o contraseñas razonables", () => {
    expect(passwordProblem("la casa verde 22", person)).toBeNull();
    expect(passwordProblem("Mate&Factura9", person)).toBeNull();
  });

  it.each([
    ["corta", "al menos 10"],
    ["1234567890", "fácil de adivinar"],
    ["abcdefghij", "fácil de adivinar"],
    ["aaaaaaaaaaaa", "fácil de adivinar"],
    ["contraseña", "fácil de adivinar"],
    ["mi40123456dni", "DNI"],
    ["valentina2026", "nombre"],
    ["GONZALEZ-1990", "nombre"],
    ["ababababab", "caracteres distintos"],
  ])("rechaza %j", (password, reason) => {
    expect(passwordProblem(password, person)).toContain(reason);
  });
});

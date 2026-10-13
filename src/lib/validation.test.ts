import { describe, expect, it } from "vitest";
import { dniSchema, parseCourseLabel, parseDate } from "./validation";

describe("dniSchema", () => {
  it("normaliza puntos y espacios", () => {
    expect(dniSchema.parse("40.123.456")).toBe("40123456");
    expect(dniSchema.parse(" 40 123 456 ")).toBe("40123456");
  });

  it("rechaza valores que no son DNI", () => {
    expect(dniSchema.safeParse("abc").success).toBe(false);
    expect(dniSchema.safeParse("123").success).toBe(false);
  });
});

describe("parseDate", () => {
  it("acepta ISO y formato argentino", () => {
    expect(parseDate("2026-03-01")?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(parseDate("1/3/2026")?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("rechaza fechas imposibles", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("mañana")).toBeNull();
  });
});

describe("parseCourseLabel", () => {
  it.each([
    ["1° A", { grade: 1, division: "A" }],
    ["1A", { grade: 1, division: "A" }],
    ["4 b", { grade: 4, division: "B" }],
    ["3ºC", { grade: 3, division: "C" }],
    ["1er A", { grade: 1, division: "A" }],
    ["5to año B", { grade: 5, division: "B" }],
  ])("%s", (input, expected) => {
    expect(parseCourseLabel(input)).toEqual(expected);
  });

  it("devuelve null si no entiende", () => {
    expect(parseCourseLabel("primero")).toBeNull();
    expect(parseCourseLabel("")).toBeNull();
  });
});

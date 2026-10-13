import { describe, expect, it } from "vitest";
import { monthGrid, occursOn, shiftMonth } from "./calendar";

describe("monthGrid", () => {
  it("arma semanas de lunes a domingo que cubren el mes", () => {
    const { weeks, first, last } = monthGrid("2026-10");
    expect(first).toBe("2026-10-01");
    expect(last).toBe("2026-10-31");
    // El 1/10/2026 es jueves: la grilla empieza el lunes 28/9.
    expect(weeks[0][0]).toEqual({ date: "2026-09-28", inMonth: false });
    expect(weeks[0][3]).toEqual({ date: "2026-10-01", inMonth: true });
    expect(weeks.at(-1)!.at(-1)!.date).toBe("2026-11-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("febrero que empieza en lunes", () => {
    const { weeks } = monthGrid("2027-02");
    expect(weeks[0][0].date).toBe("2027-02-01");
    expect(weeks).toHaveLength(4);
  });
});

describe("shiftMonth", () => {
  it("cruza años", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("occursOn", () => {
  it("eventos de un día y de varios días", () => {
    expect(occursOn({ start: "2026-07-13", end: null }, "2026-07-13")).toBe(true);
    expect(occursOn({ start: "2026-07-13", end: "2026-07-24" }, "2026-07-20")).toBe(true);
    expect(occursOn({ start: "2026-07-13", end: "2026-07-24" }, "2026-07-25")).toBe(false);
  });
});

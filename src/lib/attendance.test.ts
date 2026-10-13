import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTENDANCE_SETTINGS as settings,
  absenceValue,
  addDays,
  attendanceAlert,
  attendanceTotals,
  nextSchoolDay,
  todayInMendoza,
} from "./attendance";

const r = (status: "PRESENTE" | "AUSENTE" | "TARDE" | "RETIRO", justified = false) => ({ status, justified });

describe("attendanceTotals", () => {
  it("suma faltas, tardes y retiros con sus valores", () => {
    const totals = attendanceTotals([r("AUSENTE"), r("TARDE"), r("TARDE"), r("RETIRO"), r("PRESENTE")], settings);
    expect(totals).toEqual({ total: 2, absent: 1, late: 2, earlyLeave: 1, justified: 0, days: 5 });
  });

  it("4 tardes de 0,25 son exactamente 1 falta", () => {
    expect(attendanceTotals([r("TARDE"), r("TARDE"), r("TARDE"), r("TARDE")], settings).total).toBe(1);
  });

  it("las justificadas cuentan o no según la configuración", () => {
    const records = [r("AUSENTE", true), r("AUSENTE")];
    expect(attendanceTotals(records, settings).total).toBe(2);
    expect(attendanceTotals(records, { ...settings, justifiedCount: false }).total).toBe(1);
    expect(attendanceTotals(records, settings).justified).toBe(1);
  });

  it("respeta valores configurados", () => {
    expect(absenceValue(r("TARDE"), { ...settings, lateValue: 0.5 })).toBe(0.5);
  });
});

describe("attendanceAlert", () => {
  it.each([
    [14.75, "OK"],
    [15, "ATENCION"],
    [18, "CRITICO"],
    [19.75, "CRITICO"],
    [20, "LIBRE"],
    [25, "LIBRE"],
  ])("%d de 20 → %s", (total, expected) => {
    expect(attendanceAlert(total, 20)).toBe(expected);
  });
});

describe("fechas", () => {
  it("hoy en Mendoza aunque el servidor esté en UTC", () => {
    // 02:00 UTC del 14/10 son las 23:00 del 13/10 en Mendoza (UTC-3).
    expect(todayInMendoza(new Date("2026-10-14T02:00:00Z"))).toBe("2026-10-13");
  });

  it("suma días y saltea fines de semana", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(nextSchoolDay("2026-10-16", 1)).toBe("2026-10-19"); // viernes → lunes
    expect(nextSchoolDay("2026-10-19", -1)).toBe("2026-10-16");
  });
});

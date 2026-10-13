import { describe, expect, it } from "vitest";
import {
  annualAverage,
  formatGrade,
  isPassing,
  roundGrade,
  simpleAverage,
  weightedAverage,
} from "./grades";

describe("roundGrade", () => {
  it("redondea mitad hacia arriba", () => {
    expect(roundGrade(6.995)).toBe(7);
    expect(roundGrade(6.994)).toBe(6.99);
    expect(roundGrade(6.9949)).toBe(6.99);
    expect(roundGrade(6.5, 0)).toBe(7);
    expect(roundGrade(6.49, 0)).toBe(6);
    expect(roundGrade(8.25, 1)).toBe(8.3);
  });

  it("no se deja engañar por el punto flotante", () => {
    // 1.005 en binario es 1.00499999...; un Math.round ingenuo da 1.00.
    expect(roundGrade(1.005)).toBe(1.01);
    expect(roundGrade(0.1 + 0.2 + 7)).toBe(7.3);
  });
});

describe("weightedAverage", () => {
  it("devuelve null sin notas", () => {
    expect(weightedAverage([])).toBeNull();
  });

  it("calcula el promedio simple", () => {
    expect(simpleAverage([7, 8, 9])).toBe(8);
    expect(simpleAverage([7, 8])).toBe(7.5);
    expect(simpleAverage([10, 9, 9])).toBe(9.33);
    expect(simpleAverage([6, 6, 7])).toBe(6.33);
    expect(simpleAverage([7.1, 7.2])).toBe(7.15);
  });

  it("respeta los pesos", () => {
    // Trabajo práctico (peso 1) y examen (peso 2).
    expect(weightedAverage([{ value: 10 }, { value: 7, weight: 2 }])).toBe(8);
    expect(weightedAverage([{ value: 4, weight: 0.3 }, { value: 9, weight: 0.7 }])).toBe(7.5);
  });

  it("ignora pesos cero pero no da 0 si todos son cero", () => {
    expect(weightedAverage([{ value: 4, weight: 0 }, { value: 8 }])).toBe(8);
    expect(weightedAverage([{ value: 4, weight: 0 }])).toBeNull();
  });

  it("rechaza notas fuera de escala", () => {
    expect(() => simpleAverage([11])).toThrow(RangeError);
    expect(() => simpleAverage([0])).toThrow(RangeError);
    expect(() => simpleAverage([Number.NaN])).toThrow(RangeError);
  });
});

describe("annualAverage", () => {
  it("promedia lo que se ve en pantalla", () => {
    // Trimestres de 6.666... → se muestra 6.67; anual = (6.67 + 6.67 + 7) / 3 = 6.78
    expect(annualAverage([20 / 3, 20 / 3, 7])).toBe(6.78);
  });

  it("ignora períodos sin nota", () => {
    expect(annualAverage([8, null, null])).toBe(8);
    expect(annualAverage([null, null])).toBeNull();
  });
});

describe("isPassing", () => {
  it("compara contra la nota de aprobación", () => {
    expect(isPassing(6, 6)).toBe(true);
    expect(isPassing(5.99, 6)).toBe(false);
    expect(isPassing(null, 6)).toBe(false);
  });
});

describe("formatGrade", () => {
  it("usa coma decimal", () => {
    expect(formatGrade(7.5)).toBe("7,50");
    expect(formatGrade(8, 0)).toBe("8");
    expect(formatGrade(null)).toBe("—");
  });
});

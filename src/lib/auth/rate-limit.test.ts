import { describe, expect, it } from "vitest";
import { hit, isLimited, reset } from "./rate-limit";

describe("rate limit", () => {
  const limit = { max: 3, windowMs: 1000 };

  it("bloquea después del máximo y se libera al pasar la ventana", () => {
    const t = 1_000_000;
    expect(hit("a", limit, t)).toBe(true);
    expect(hit("a", limit, t + 1)).toBe(true);
    expect(hit("a", limit, t + 2)).toBe(true);
    expect(isLimited("a", limit, t + 3)).toBe(true);
    expect(hit("a", limit, t + 4)).toBe(false);
    expect(isLimited("a", limit, t + 1001)).toBe(false);
    expect(hit("a", limit, t + 1001)).toBe(true);
  });

  it("las claves son independientes y se pueden reiniciar", () => {
    const t = 2_000_000;
    for (let i = 0; i < 3; i++) hit("b", limit, t);
    expect(isLimited("b", limit, t)).toBe(true);
    expect(isLimited("c", limit, t)).toBe(false);
    reset("b");
    expect(isLimited("b", limit, t)).toBe(false);
  });
});

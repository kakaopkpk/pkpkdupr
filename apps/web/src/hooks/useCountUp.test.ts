import { describe, expect, it } from "vitest";
import { getCountUpValue } from "./useCountUp";

describe("getCountUpValue", () => {
  it("경과 0 이하이면 from이다", () => {
    expect(getCountUpValue(10, 50, 0, 600)).toBe(10);
    expect(getCountUpValue(10, 50, -100, 600)).toBe(10);
  });

  it("durationMs 이상이면 to다", () => {
    expect(getCountUpValue(10, 50, 600, 600)).toBe(50);
    expect(getCountUpValue(10, 50, 1000, 600)).toBe(50);
  });

  it("올라갈 때는 단조 증가한다", () => {
    let previous = getCountUpValue(0, 100, 0, 600);
    for (let elapsed = 30; elapsed <= 600; elapsed += 30) {
      const current = getCountUpValue(0, 100, elapsed, 600);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it("내려갈 때는 단조 감소한다", () => {
    let previous = getCountUpValue(100, 0, 0, 600);
    for (let elapsed = 30; elapsed <= 600; elapsed += 30) {
      const current = getCountUpValue(100, 0, elapsed, 600);
      expect(current).toBeLessThan(previous);
      previous = current;
    }
  });

  it("절반 시점 값이 직선 보간의 절반보다 to에 가깝다(감속)", () => {
    expect(getCountUpValue(0, 100, 300, 600)).toBeGreaterThan(50);
    expect(getCountUpValue(100, 0, 300, 600)).toBeLessThan(50);
  });
});

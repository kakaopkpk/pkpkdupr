import { describe, expect, it } from "vitest";
import {
  getDecayedConfidenceByInactivity,
  getDuprCategoryForMatchType,
} from "../services/RatingContract";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("RatingContract", () => {
  it("2주 유예 후 1일마다 1.5씩 confidence가 감소하고 floor는 0이다", () => {
    expect(getDecayedConfidenceByInactivity(50, 14 * DAY_MS)).toBe(50);
    expect(getDecayedConfidenceByInactivity(50, 15 * DAY_MS)).toBe(48.5);
    expect(getDecayedConfidenceByInactivity(50, 20 * DAY_MS)).toBe(41);
    expect(getDecayedConfidenceByInactivity(5, 30 * DAY_MS)).toBe(0);
  });

  it("단식 subtype은 singles, 복식 subtype은 doubles 트랙으로 분류한다", () => {
    expect(getDuprCategoryForMatchType("singles")).toBe("singles");
    expect(getDuprCategoryForMatchType("unrestricted-singles")).toBe("singles");

    for (const type of [
      "mixed-doubles",
      "men-doubles",
      "women-doubles",
      "unrestricted-doubles",
    ] as const) {
      expect(getDuprCategoryForMatchType(type)).toBe("doubles");
    }
  });
});

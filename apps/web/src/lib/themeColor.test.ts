import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_COLOR,
  combineDimAlphas,
  getDimmedThemeColor,
} from "./themeColor";

describe("getDimmedThemeColor", () => {
  it("딤이 없으면 기본색이다", () => {
    expect(getDimmedThemeColor([])).toBe(DEFAULT_THEME_COLOR);
  });

  it("바텀시트 딤(45%) 한 겹을 기본색 위에 섞는다", () => {
    expect(getDimmedThemeColor([0.45])).toBe("#8c919a");
  });

  it("딤을 겹치면 더 어두워진다", () => {
    expect(combineDimAlphas([0.45, 0.45])).toBeCloseTo(0.6975);
    expect(getDimmedThemeColor([0.45, 0.45])).toBe("#545a66");
  });
});

import { describe, expect, it } from "vitest";
import { getActiveSlideIndex } from "./carouselPosition";

// 카드 330px + 사이 8px
const OFFSETS = [0, 338, 676, 1014];
const MAX_SCROLL = 1014 - 28;

describe("getActiveSlideIndex", () => {
  it("맞춤 위치에 가장 가까운 카드를 고른다", () => {
    expect(getActiveSlideIndex({ scrollLeft: 0, maxScrollLeft: MAX_SCROLL, slideOffsets: OFFSETS })).toBe(0);
    expect(getActiveSlideIndex({ scrollLeft: 160, maxScrollLeft: MAX_SCROLL, slideOffsets: OFFSETS })).toBe(0);
    expect(getActiveSlideIndex({ scrollLeft: 180, maxScrollLeft: MAX_SCROLL, slideOffsets: OFFSETS })).toBe(1);
    expect(getActiveSlideIndex({ scrollLeft: 676, maxScrollLeft: MAX_SCROLL, slideOffsets: OFFSETS })).toBe(2);
  });

  it("끝까지 넘기면 왼쪽 끝까지 오지 못한 마지막 카드다", () => {
    expect(getActiveSlideIndex({ scrollLeft: MAX_SCROLL, maxScrollLeft: MAX_SCROLL, slideOffsets: OFFSETS })).toBe(3);
  });

  it("카드가 없거나 넘길 거리가 없으면 첫 카드다", () => {
    expect(getActiveSlideIndex({ scrollLeft: 0, maxScrollLeft: 0, slideOffsets: [] })).toBe(0);
    expect(getActiveSlideIndex({ scrollLeft: 0, maxScrollLeft: 0, slideOffsets: [0, 0] })).toBe(0);
  });
});

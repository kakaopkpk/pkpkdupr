import { describe, expect, it } from "vitest";
import {
  FLICK_MIN_DISTANCE_PX,
  FLICK_MIN_VELOCITY_PX_PER_MS,
  getActiveSlideIndex,
  getSwipeTargetIndex,
} from "./carouselPosition";

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

describe("getSwipeTargetIndex", () => {
  const base = { startIndex: 1, count: 4, slideWidth: 330 };

  it("살짝 끌거나 살짝 튕기면 시작 카드로 돌아온다", () => {
    expect(getSwipeTargetIndex({ ...base, deltaX: -40, velocityX: -0.2 })).toBe(1);
    // 아무리 빨라도 끈 거리가 짧으면 넘기지 않는다
    expect(getSwipeTargetIndex({ ...base, deltaX: -(FLICK_MIN_DISTANCE_PX - 1), velocityX: -3 })).toBe(1);
  });

  it("카드 폭의 일정 비율 이상 끌면 천천히 놓아도 한 장 넘긴다", () => {
    expect(getSwipeTargetIndex({ ...base, deltaX: -110, velocityX: 0 })).toBe(2);
    expect(getSwipeTargetIndex({ ...base, deltaX: 110, velocityX: 0 })).toBe(0);
  });

  it("충분히 끈 채로 빠르게 튕기면 한 장 넘긴다", () => {
    expect(
      getSwipeTargetIndex({ ...base, deltaX: -FLICK_MIN_DISTANCE_PX, velocityX: -FLICK_MIN_VELOCITY_PX_PER_MS }),
    ).toBe(2);
  });

  it("끈 방향과 반대로 튕기며 놓으면 넘기지 않는다", () => {
    expect(getSwipeTargetIndex({ ...base, deltaX: -80, velocityX: 1 })).toBe(1);
    // 카드 폭의 30% 넘게 끌었어도 반대로 빠르게 되돌리며 놓으면 취소다
    expect(getSwipeTargetIndex({ ...base, deltaX: -200, velocityX: FLICK_MIN_VELOCITY_PX_PER_MS })).toBe(1);
    // 반대 방향이어도 느리게 움직이며 놓으면 거리로 판정한다
    expect(getSwipeTargetIndex({ ...base, deltaX: -200, velocityX: 0.1 })).toBe(2);
  });

  it("아무리 세게 멀리 넘겨도 한 번에 한 장만 넘긴다", () => {
    expect(getSwipeTargetIndex({ ...base, deltaX: -900, velocityX: -5 })).toBe(2);
    expect(getSwipeTargetIndex({ ...base, deltaX: 900, velocityX: 5 })).toBe(0);
  });

  it("처음·마지막 카드 바깥으로는 넘기지 않는다", () => {
    expect(getSwipeTargetIndex({ ...base, startIndex: 0, deltaX: 200, velocityX: 2 })).toBe(0);
    expect(getSwipeTargetIndex({ ...base, startIndex: 3, deltaX: -200, velocityX: -2 })).toBe(3);
  });
});

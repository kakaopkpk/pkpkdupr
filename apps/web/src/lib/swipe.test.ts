import { describe, expect, it } from "vitest";
import { getPanelSwipeStep } from "./swipe";

const WIDTH = 400;

describe("getPanelSwipeStep", () => {
  it("왼쪽으로 폭의 25% 이상 끌면 다음 판, 오른쪽이면 이전 판이다", () => {
    expect(getPanelSwipeStep({ deltaX: -100, velocityX: 0, width: WIDTH })).toBe(1);
    expect(getPanelSwipeStep({ deltaX: 100, velocityX: 0, width: WIDTH })).toBe(-1);
  });

  it("조금만 끌고 천천히 놓으면 그대로다", () => {
    expect(getPanelSwipeStep({ deltaX: -99, velocityX: 0, width: WIDTH })).toBe(0);
    expect(getPanelSwipeStep({ deltaX: 0, velocityX: 0, width: WIDTH })).toBe(0);
  });

  it("충분히 끈 채로 빠르게 튕기면 짧아도 옮긴다", () => {
    expect(getPanelSwipeStep({ deltaX: -40, velocityX: -0.4, width: WIDTH })).toBe(1);
    expect(getPanelSwipeStep({ deltaX: 40, velocityX: 0.6, width: WIDTH })).toBe(-1);
  });

  it("살짝 튕기기는 옮기지 않는다", () => {
    expect(getPanelSwipeStep({ deltaX: -39, velocityX: -2, width: WIDTH })).toBe(0);
  });

  it("끈 방향과 반대로 빠르게 튕기며 놓으면 많이 끌었어도 그대로다", () => {
    expect(getPanelSwipeStep({ deltaX: -200, velocityX: 0.5, width: WIDTH })).toBe(0);
  });

  it("폭을 모르면 튕기기로만 옮긴다", () => {
    expect(getPanelSwipeStep({ deltaX: -300, velocityX: 0, width: 0 })).toBe(0);
    expect(getPanelSwipeStep({ deltaX: -60, velocityX: -1, width: 0 })).toBe(1);
  });
});

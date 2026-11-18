import { getSwipeStep, type SwipeThresholds } from "@/lib/swipe";

/** 달력은 카드 캐러셀보다 짧게 밀어도 달이 넘어간다 */
export const MONTH_SWIPE_THRESHOLDS: SwipeThresholds = {
  distanceRatio: 0.25,
  flickMinDistancePx: 40,
  flickMinVelocityPxPerMs: 0.4,
};

/** 손가락을 놓았을 때 옮길 달 수(1 다음 달, -1 이전 달, 0 그대로). 왼쪽으로 밀면(deltaX 음수) 다음 달이다 */
export const getMonthSwipeStep = (input: {
  deltaX: number;
  velocityX: number;
  width: number;
}) => getSwipeStep(input, MONTH_SWIPE_THRESHOLDS);

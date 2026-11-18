import { getSwipeStep, type SwipeThresholds } from "@/lib/swipe";

/**
 * 가로 스크롤 위치에서 지금 카드 번호를 고른다. 각 카드의 맞춤 위치(왼쪽 끝 - 스크롤 여백)에
 * 가장 가까운 카드이고, 끝까지 넘겼으면 마지막 카드다(마지막 카드는 왼쪽 끝까지 오지 못한다).
 * 넘길 거리가 없으면(숨은 탭이라 크기가 0인 경우 포함) 첫 카드다
 */
export const getActiveSlideIndex = ({
  scrollLeft,
  maxScrollLeft,
  slideOffsets,
}: {
  scrollLeft: number;
  maxScrollLeft: number;
  /** 각 카드의 맞춤 위치 */
  slideOffsets: readonly number[];
}) => {
  if (slideOffsets.length === 0 || maxScrollLeft <= 0) return 0;
  if (scrollLeft >= maxScrollLeft - 1) return slideOffsets.length - 1;
  let nearest = 0;
  slideOffsets.forEach((offset, index) => {
    if (Math.abs(offset - scrollLeft) < Math.abs(slideOffsets[nearest] - scrollLeft)) {
      nearest = index;
    }
  });
  return nearest;
};

/** 카드 폭의 30% 이상 끌거나, 60px 이상 끈 채 0.5px/ms 이상으로 튕기면 넘어간다 */
export const CAROUSEL_SWIPE_THRESHOLDS: SwipeThresholds = {
  distanceRatio: 0.3,
  flickMinDistancePx: 60,
  flickMinVelocityPxPerMs: 0.5,
};

/**
 * 손가락을 놓았을 때 멈출 카드. 한 번에 최대 한 장만 넘기며, 넘길지는 getSwipeStep이 정하고
 * 아니면 시작 카드로 돌아온다. deltaX·velocityX는 손가락 이동 방향 기준이라 음수(왼쪽으로 밀기)면 다음 카드다
 */
export const getSwipeTargetIndex = ({
  startIndex,
  count,
  deltaX,
  velocityX,
  slideWidth,
}: {
  startIndex: number;
  count: number;
  deltaX: number;
  velocityX: number;
  slideWidth: number;
}) => {
  const step = getSwipeStep(
    { deltaX, velocityX, width: slideWidth },
    CAROUSEL_SWIPE_THRESHOLDS,
  );
  return Math.max(0, Math.min(startIndex + step, count - 1));
};

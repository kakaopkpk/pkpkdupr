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

/** 카드 폭의 이 비율 이상 끌고 놓으면 넘어간다 */
export const SWIPE_DISTANCE_RATIO = 0.3;
/** 빠르게 튕겨 넘기려면 적어도 이만큼은 끌어야 한다(살짝 튕기기는 넘기지 않는다) */
export const FLICK_MIN_DISTANCE_PX = 60;
/** 놓기 직전 이 속도(px/ms) 이상으로 같은 방향으로 움직였으면 튕긴 것으로 본다 */
export const FLICK_MIN_VELOCITY_PX_PER_MS = 0.5;

/**
 * 손가락을 놓았을 때 멈출 카드. 한 번에 최대 한 장만 넘기며, 카드 폭의 일정 비율 이상 끌었거나
 * 충분히 끈 채로 빠르게 튕겼을 때만 넘기고 아니면 시작 카드로 돌아온다. 끈 방향과 반대로 빠르게
 * 튕기며 놓으면 많이 끌었어도 되돌린 것으로 보고 시작 카드로 돌아온다.
 * deltaX·velocityX는 손가락 이동 방향 기준이라 음수(왼쪽으로 밀기)면 다음 카드다
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
  // 끈 방향 기준 속도. 음수면 끈 방향과 반대로 움직이며 놓은 것이다
  const velocityAlongDrag = velocityX * Math.sign(deltaX);
  const isFlickedBack = velocityAlongDrag <= -FLICK_MIN_VELOCITY_PX_PER_MS;
  const isDragged = slideWidth > 0 && Math.abs(deltaX) >= slideWidth * SWIPE_DISTANCE_RATIO;
  const isFlicked =
    Math.abs(deltaX) >= FLICK_MIN_DISTANCE_PX &&
    velocityAlongDrag >= FLICK_MIN_VELOCITY_PX_PER_MS;
  const shouldMove = !isFlickedBack && (isDragged || isFlicked);
  const nextIndex = shouldMove ? startIndex + (deltaX < 0 ? 1 : -1) : startIndex;
  return Math.max(0, Math.min(nextIndex, count - 1));
};

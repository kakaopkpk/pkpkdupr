/** 달력 폭의 이 비율 이상 끌고 놓으면 달을 옮긴다 */
export const MONTH_SWIPE_DISTANCE_RATIO = 0.25;
/** 빠르게 튕겨 옮기려면 적어도 이만큼은 끌어야 한다(살짝 튕기기는 옮기지 않는다) */
export const MONTH_FLICK_MIN_DISTANCE_PX = 40;
/** 놓기 직전 이 속도(px/ms) 이상으로 끈 방향으로 움직였으면 튕긴 것으로 본다 */
export const MONTH_FLICK_MIN_VELOCITY_PX_PER_MS = 0.4;

/**
 * 손가락을 놓았을 때 옮길 달 수(1 다음 달, -1 이전 달, 0 그대로). 달력 폭의 일정 비율 이상 끌었거나
 * 충분히 끈 채로 빠르게 튕겼을 때만 옮기고, 끈 방향과 반대로 빠르게 튕기며 놓으면 되돌린 것으로 본다.
 * deltaX·velocityX는 손가락 이동 방향 기준이라 음수(왼쪽으로 밀기)면 다음 달이다
 */
export const getMonthSwipeStep = ({
  deltaX,
  velocityX,
  width,
}: {
  deltaX: number;
  velocityX: number;
  width: number;
}): -1 | 0 | 1 => {
  if (deltaX === 0) return 0;
  // 끈 방향 기준 속도. 음수면 끈 방향과 반대로 움직이며 놓은 것이다
  const velocityAlongDrag = velocityX * Math.sign(deltaX);
  if (velocityAlongDrag <= -MONTH_FLICK_MIN_VELOCITY_PX_PER_MS) return 0;
  const distance = Math.abs(deltaX);
  const isDragged = width > 0 && distance >= width * MONTH_SWIPE_DISTANCE_RATIO;
  const isFlicked =
    distance >= MONTH_FLICK_MIN_DISTANCE_PX &&
    velocityAlongDrag >= MONTH_FLICK_MIN_VELOCITY_PX_PER_MS;
  if (!isDragged && !isFlicked) return 0;
  return deltaX < 0 ? 1 : -1;
};

import React, { useRef, useSyncExternalStore } from "react";
import { cx } from "@/components/ui/cx";
import type { PullToRefreshStore } from "@/lib/pullToRefreshStore";

interface PullToRefreshIndicatorProps {
  store: PullToRefreshStore;
  threshold: number;
}

const RING_SIZE = 20.8;
const RING_CIRCLE_PROPS = {
  cx: RING_SIZE / 2,
  cy: RING_SIZE / 2,
  r: 9.4,
  fill: "none",
  strokeWidth: 2,
};
// 끝까지 당겼을 때 호 길이이자, 임계 거리만큼 당겼을 때 링 회전 각도
const RING_FULL_DEGREES = 270;
// 놓은 뒤 한 바퀴 도는 시간(ms)
const SPIN_DURATION_MS = 1000;

const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  store,
  threshold,
}) => {
  const { distance, status } = useSyncExternalStore(
    store.subscribe,
    store.get,
    store.get,
  );
  const isVisible = status !== "idle";
  const isPullGestureActive = status === "pulling" || status === "armed";
  const rawProgress = distance / threshold;
  const progress = Math.min(rawProgress, 1);
  // 놓은 뒤(새로고침 중·오류 표시)
  const isReleased = status === "refreshing" || status === "error";
  const isArmed = status === "armed";
  const translateY = isReleased ? 117 : -70.2 + progress * 187.2;

  // 놓으면 distance가 0으로 돌아가므로, 마지막 제스처 각도를 기억해 그 자리에서 이어서 돈다.
  const lastAngleRef = useRef(0);
  if (isPullGestureActive) {
    lastAngleRef.current = Math.round(rawProgress * RING_FULL_DEGREES);
  }
  const angle = lastAngleRef.current;
  // 호는 당긴 만큼(회전 각도와 같은 값, 최대 270°) 차오르고 놓은 뒤에는 270°다.
  const arcDegrees = isReleased
    ? RING_FULL_DEGREES
    : Math.min(angle, RING_FULL_DEGREES);

  return (
    <div
      aria-hidden={!isVisible}
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `translateY(${translateY}px)`,
        transition:
          isPullGestureActive
            ? "opacity 120ms ease-out"
            : status === "idle"
              ? "transform 84ms ease-in, opacity 1ms linear 84ms"
              : "transform 180ms ease-out, opacity 180ms ease-out",
      }}
    >
      <div
        role="status"
        aria-live="polite"
        aria-label={
          isArmed
            ? "새로고침 준비 완료"
            : status === "refreshing"
              ? "새로고침 중"
              : "새로고침"
        }
        className={cx(
          "flex size-[46.8px] items-center justify-center rounded-full border border-sky-100/90 bg-white/90 shadow-sm backdrop-blur transition-transform",
          isArmed && "scale-110",
        )}
      >
        <span
          aria-hidden="true"
          className={cx("block size-[20.8px]", isReleased && "animate-spin")}
          style={
            isReleased
              ? {
                  animationDuration: `${SPIN_DURATION_MS}ms`,
                  // 음수 지연으로 회전 위상을 놓는 순간의 각도에 맞춘다.
                  animationDelay: `${-((angle % 360) / 360) * SPIN_DURATION_MS}ms`,
                  // 오류 표시 동안은 돌던 자리에서 멈춘다.
                  animationPlayState: status === "error" ? "paused" : "running",
                }
              : { transform: `rotate(${angle}deg)` }
          }
        >
          <svg
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="size-full -rotate-90"
          >
            <circle {...RING_CIRCLE_PROPS} className="stroke-sky-100" />
            <circle
              {...RING_CIRCLE_PROPS}
              pathLength={360}
              strokeDasharray={`${arcDegrees} 360`}
              className="stroke-pk-primary"
            />
          </svg>
        </span>
      </div>
    </div>
  );
};

export default PullToRefreshIndicator;

import React from "react";
import { IoCheckmark } from "react-icons/io5";

export type PullToRefreshStatus =
  | "idle"
  | "pulling"
  | "armed"
  | "refreshing"
  | "error";

interface PullToRefreshIndicatorProps {
  distance: number;
  status: PullToRefreshStatus;
  threshold: number;
}

const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  distance,
  status,
  threshold,
}) => {
  const isVisible = status !== "idle";
  const isPullGestureActive = status === "pulling" || status === "armed";
  const progress = Math.min(distance / threshold, 1);
  const isRefreshing = status === "refreshing";
  const isArmed = status === "armed";
  const translateY =
    status === "refreshing" || status === "error"
      ? 117
      : -70.2 + progress * 187.2;
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
        className={`flex size-[46.8px] items-center justify-center rounded-full border shadow-sm backdrop-blur transition-transform ${
          isArmed
            ? "scale-110 border-pk-primary bg-pk-primary"
            : "border-sky-100/90 bg-white/90"
        }`}
      >
        {isArmed ? (
          <IoCheckmark
            aria-hidden="true"
            className="size-[26px] text-white"
          />
        ) : (
          <span
            aria-hidden="true"
            className={`size-[20.8px] rounded-full border-2 border-sky-100 border-t-pk-primary ${
              isRefreshing ? "animate-spin" : ""
            }`}
            style={
              isRefreshing
                ? undefined
                : { transform: `rotate(${Math.round(progress * 270)}deg)` }
            }
          />
        )}
      </div>
    </div>
  );
};

export default PullToRefreshIndicator;

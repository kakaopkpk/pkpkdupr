import { useCallback, useEffect, useRef, useState } from "react";
import { triggerHapticFeedback } from "@/lib/haptics";
import {
  createPullToRefreshStore,
  type PullToRefreshStatus,
} from "@/lib/pullToRefreshStore";

export const PULL_TO_REFRESH_THRESHOLD = 129.6;
export const PULL_TO_REFRESH_BASE_RESISTANCE = 0.75;
export const PULL_TO_REFRESH_MIN_RESISTANCE = 0.6;

const PULL_GESTURE_DIRECTION_THRESHOLD = 8;

interface UsePullToRefreshParams {
  container: HTMLElement | null;
  onRefresh?: () => Promise<void>;
  isEnabled?: boolean;
}

export const usePullToRefresh = ({
  container,
  onRefresh,
  isEnabled = true,
}: UsePullToRefreshParams) => {
  const [store] = useState(createPullToRefreshStore);
  const startRef = useRef<{
    identifier: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const isArmedRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const isGestureActiveRef = useRef(false);
  const axisRef = useRef<"undecided" | "vertical" | "horizontal">(
    "undecided",
  );
  const resetTimeoutRef = useRef<number | null>(null);
  const handlerRef = useRef(onRefresh);

  useEffect(() => {
    handlerRef.current = onRefresh;
  }, [onRefresh]);

  const reset = useCallback(
    (nextStatus: PullToRefreshStatus = "idle") => {
      startRef.current = null;
      isArmedRef.current = false;
      isGestureActiveRef.current = false;
      axisRef.current = "undecided";
      container?.style.removeProperty("overflow");
      store.set({ distance: 0, status: nextStatus });
    },
    [container, store],
  );

  const updateDistance = useCallback(
    (touch: Touch) => {
      const start = startRef.current;
      if (!start || isRefreshingRef.current) return false;

      if (axisRef.current !== "vertical") {
        const totalDeltaX = touch.clientX - start.startX;
        const totalDeltaY = touch.clientY - start.startY;
        if (
          Math.max(Math.abs(totalDeltaX), Math.abs(totalDeltaY)) <
          PULL_GESTURE_DIRECTION_THRESHOLD
        ) {
          return true;
        }

        if (Math.abs(totalDeltaX) > Math.abs(totalDeltaY)) {
          axisRef.current = "horizontal";
          reset();
          return false;
        }

        axisRef.current = "vertical";
      }

      const deltaY = touch.clientY - start.lastY;
      startRef.current = { ...start, lastX: touch.clientX, lastY: touch.clientY };

      let pullDeltaY = deltaY;
      if (!isGestureActiveRef.current) {
        if (deltaY <= 0) return true;

        const scrollTop = Math.max(container?.scrollTop ?? 0, 0);
        if (scrollTop > 0) {
          if (deltaY <= scrollTop) return true;

          container!.scrollTop = 0;
          pullDeltaY = deltaY - scrollTop;
        }
      }

      const currentDistance = store.get().distance;
      const progress = Math.min(currentDistance / PULL_TO_REFRESH_THRESHOLD, 1);
      const resistance =
        PULL_TO_REFRESH_BASE_RESISTANCE -
        (PULL_TO_REFRESH_BASE_RESISTANCE - PULL_TO_REFRESH_MIN_RESISTANCE) *
          progress;
      const adjustedDeltaY =
        pullDeltaY > 0
          ? pullDeltaY * resistance
          : pullDeltaY * PULL_TO_REFRESH_BASE_RESISTANCE;
      const nextDistance = Math.min(
        Math.max(0, currentDistance + adjustedDeltaY),
        PULL_TO_REFRESH_THRESHOLD * 1.25,
      );

      const isArmed = nextDistance >= PULL_TO_REFRESH_THRESHOLD;
      if (isArmed && !isArmedRef.current) triggerHapticFeedback(15);
      isArmedRef.current = isArmed;
      const isGestureActive = nextDistance > 0;
      if (isGestureActive !== isGestureActiveRef.current) {
        isGestureActiveRef.current = isGestureActive;
        if (isGestureActive) container?.style.setProperty("overflow", "hidden");
        else container?.style.removeProperty("overflow");
      }
      store.set({
        distance: nextDistance,
        status: nextDistance === 0 ? "idle" : isArmed ? "armed" : "pulling",
      });
      return true;
    },
    [container, reset, store],
  );

  useEffect(() => {
    if (!container || !isEnabled || !onRefresh) {
      reset();
      return undefined;
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (
        event.touches.length !== 1 ||
        isRefreshingRef.current
      ) {
        return;
      }

      const touch = event.touches[0];
      startRef.current = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
      };
      store.set({ distance: 0 });
      isArmedRef.current = false;
      isGestureActiveRef.current = false;
      axisRef.current = "undecided";
    };

    const handleTouchMove = (event: TouchEvent) => {
      const start = startRef.current;
      if (!start) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }

      const touch = Array.from(event.touches).find(
        (candidate) => candidate.identifier === start.identifier,
      );
      if (!touch || !updateDistance(touch)) return;
      if (isGestureActiveRef.current && event.cancelable) event.preventDefault();
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const start = startRef.current;
      if (!start) return;
      const touch = Array.from(event.changedTouches).find(
        (candidate) => candidate.identifier === start.identifier,
      );
      if (!touch || !updateDistance(touch) || !isArmedRef.current) {
        reset();
        return;
      }

      startRef.current = null;
      isGestureActiveRef.current = false;
      container.style.removeProperty("overflow");
      isRefreshingRef.current = true;
      store.set({ distance: 0, status: "refreshing" });

      const refresh = handlerRef.current;
      if (!refresh) {
        isRefreshingRef.current = false;
        reset();
        return;
      }

      void (async () => {
        let delay = 350;
        try {
          await refresh();
        } catch {
          delay = 1600;
          store.set({ status: "error" });
        } finally {
          resetTimeoutRef.current = window.setTimeout(() => {
            isRefreshingRef.current = false;
            reset();
          }, delay);
        }
      })();
    };

    const handleTouchCancel = () => reset();

    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: false });
    container.addEventListener("touchcancel", handleTouchCancel, {
      passive: false,
    });
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [container, isEnabled, onRefresh, reset, store, updateDistance]);

  useEffect(
    () => () => {
      if (resetTimeoutRef.current !== null) window.clearTimeout(resetTimeoutRef.current);
    },
    [],
  );

  return store;
};

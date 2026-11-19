import React, { useCallback, useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
import { getMonthSwipeStep } from "./monthSwipe";

/** 이만큼 움직인 뒤에 가로/세로 방향을 정한다 */
const AXIS_LOCK_PX = 8;
/** 속도는 최근 이 시간 안의 이동으로 잰다 */
const VELOCITY_WINDOW_MS = 100;
/** 손가락을 뗀 뒤 판이 제자리로 오거나 옆 달이 들어오는 시간 */
const SETTLE_DURATION_MS = 280;
/** 끌어서 넘긴 손가락을 뗀 뒤 이 시간 안의 클릭은 날짜 버튼에 닿지 않게 막는다 */
const CLICK_SUPPRESS_MS = 400;
/** 트랙에 이어 붙인 달 판 수(이전·이번·다음) */
const PANEL_COUNT = 3;

interface SwipeState {
  mode: "pending" | "drag" | "ignore";
  startX: number;
  startY: number;
  /** 끌기를 시작할 때 트랙의 위치. 정착 연출 중에 다시 끌면 그 자리에서 이어 간다 */
  baseOffset: number;
  /** 움직임 줄이기면 판을 옮기지 않고 달만 바꾼다. 끌기를 시작할 때 한 번 읽는다 */
  reduceMotion: boolean;
  samples: { x: number; time: number }[];
}

/**
 * 달력 영역(touch-action: pan-y)의 좌우 밀기로 달을 옮긴다. trackRef는 이전·이번·다음 달 판을 가로로
 * 이어 붙이고 CSS로 가운데 판을 보이게 둔 트랙이며, 여기서는 그 위에 transform으로 끈 거리만 더한다.
 * 처음 움직임이 가로면 세 판이 손가락을 따라오고, 놓을 때 거리·속도로 옮길지 정해 onSwipe(1 다음 달, -1 이전 달)를 부른다.
 * 옮기면 새 달이 렌더된 뒤에도 보던 자리에서 이어 가운데로 들어오고, 아니면 제자리로 돌아온다. 세로 움직임은 브라우저 스크롤에 맡긴다.
 * 돌려주는 slideIn(step)은 버튼·다른 달 날짜로 달을 옮기기 직전에 불러 같은 슬라이드로 넘긴다
 */
export const useMonthSwipe = (
  areaRef: React.RefObject<HTMLElement | null>,
  trackRef: React.RefObject<HTMLElement | null>,
  onSwipe: (step: 1 | -1) => void,
) => {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  const slideInRef = useRef<(step: 1 | -1) => void>(() => {});

  useEffect(() => {
    const area = areaRef.current;
    const track = trackRef.current;
    if (!area || !track) return;

    let state: SwipeState | null = null;
    let suppressClickUntil = -Infinity;

    const getPanelWidth = () => track.offsetWidth / PANEL_COUNT;

    const setOffset = (offset: number) => {
      track.style.transform = offset === 0 ? "" : `translate3d(${offset}px, 0, 0)`;
    };

    /** 트랙을 가운데 판 자리로 보낸다 */
    const settle = (animate: boolean) => {
      track.style.transition = animate
        ? `transform ${SETTLE_DURATION_MS}ms var(--ease-pk-move)`
        : "";
      setOffset(0);
    };

    /**
     * 달이 step만큼 바뀌어 판이 한 칸씩 밀려 렌더되기 전에 부른다. 보던 화면이 그대로 남도록
     * 판 한 칸만큼 반대로 옮겨 두고 가운데로 정착시킨다. 새 달은 이 이벤트가 끝나고 그리기 전에 렌더된다
     */
    const slideFrom = (offset: number, step: 1 | -1) => {
      track.style.transition = "";
      setOffset(offset + step * getPanelWidth());
      track.getBoundingClientRect();
      settle(true);
    };

    slideInRef.current = (step) => {
      state = null;
      if (prefersReducedMotion()) return;
      slideFrom(new DOMMatrixReadOnly(getComputedStyle(track).transform).m41, step);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        state = null;
        return;
      }
      // 새 터치가 시작됐으면 이전 끌기의 클릭은 이미 지나갔으므로 이번 탭은 막지 않는다
      suppressClickUntil = -Infinity;
      const touch = event.touches[0];
      state = {
        mode: "pending",
        startX: touch.clientX,
        startY: touch.clientY,
        baseOffset: 0,
        reduceMotion: false,
        samples: [{ x: touch.clientX, time: event.timeStamp }],
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!state || state.mode === "ignore") return;
      if (event.touches.length !== 1) {
        // 두 번째 손가락이 닿으면 밀기를 멈추고 제자리로 돌린다
        handleTouchCancel();
        return;
      }
      const touch = event.touches[0];
      const deltaX = touch.clientX - state.startX;
      const deltaY = touch.clientY - state.startY;

      if (state.mode === "pending") {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AXIS_LOCK_PX) return;
        if (Math.abs(deltaY) >= Math.abs(deltaX)) {
          state.mode = "ignore";
          return;
        }
        state.mode = "drag";
        state.reduceMotion = prefersReducedMotion();
        state.baseOffset = new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
        track.style.transition = "";
      }

      if (event.cancelable) event.preventDefault();
      if (!state.reduceMotion) {
        // 옆 달 판 너머(빈 자리)까지는 끌리지 않게 한 칸으로 막는다
        const width = getPanelWidth();
        setOffset(Math.max(-width, Math.min(width, state.baseOffset + deltaX)));
      }
      state.samples.push({ x: touch.clientX, time: event.timeStamp });
      const cutoff = event.timeStamp - VELOCITY_WINDOW_MS;
      while (state.samples.length > 2 && state.samples[0].time < cutoff) {
        state.samples.shift();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (state?.mode !== "drag") {
        state = null;
        return;
      }
      suppressClickUntil = event.timeStamp + CLICK_SUPPRESS_MS;
      const first = state.samples[0];
      const last = state.samples[state.samples.length - 1];
      const elapsed = last.time - first.time;
      // 손가락을 멈췄다 떼면 touchmove가 더 오지 않으므로, 마지막 이동이 오래됐으면 멈춘 것으로 본다
      const isPaused = event.timeStamp - last.time > VELOCITY_WINDOW_MS;
      const deltaX = last.x - state.startX;
      const step = getMonthSwipeStep({
        deltaX,
        velocityX: !isPaused && elapsed > 0 ? (last.x - first.x) / elapsed : 0,
        width: area.clientWidth,
      });
      const { reduceMotion } = state;
      state = null;

      if (step === 0) {
        settle(!reduceMotion);
        return;
      }
      const offset = new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
      onSwipeRef.current(step);
      if (reduceMotion) {
        settle(false);
      } else {
        slideFrom(offset, step);
      }
    };

    const handleTouchCancel = () => {
      if (state?.mode === "drag") settle(!state.reduceMotion);
      state = null;
    };

    // 끌어서 넘긴 손가락을 뗄 때 날짜 버튼이 눌리지 않게 한다
    const handleClickCapture = (event: MouseEvent) => {
      if (event.timeStamp > suppressClickUntil) return;
      suppressClickUntil = -Infinity;
      event.preventDefault();
      event.stopPropagation();
    };

    area.addEventListener("touchstart", handleTouchStart, { passive: true });
    area.addEventListener("touchmove", handleTouchMove, { passive: false });
    area.addEventListener("touchend", handleTouchEnd);
    area.addEventListener("touchcancel", handleTouchCancel);
    area.addEventListener("click", handleClickCapture, true);
    return () => {
      area.removeEventListener("touchstart", handleTouchStart);
      area.removeEventListener("touchmove", handleTouchMove);
      area.removeEventListener("touchend", handleTouchEnd);
      area.removeEventListener("touchcancel", handleTouchCancel);
      area.removeEventListener("click", handleClickCapture, true);
      slideInRef.current = () => {};
      settle(false);
    };
  }, [areaRef, trackRef]);

  return useCallback((step: 1 | -1) => slideInRef.current(step), []);
};

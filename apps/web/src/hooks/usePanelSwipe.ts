import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
import { getPanelSwipeStep } from "@/lib/swipe";

/** 이만큼 움직인 뒤에 가로/세로 방향을 정한다 */
const AXIS_LOCK_PX = 8;
/** 속도는 최근 이 시간 안의 이동으로 잰다 */
const VELOCITY_WINDOW_MS = 100;
/** 손가락을 뗀 뒤 판이 제자리로 오거나 옆 판이 들어오는 시간 */
export const PANEL_SETTLE_DURATION_MS = 280;
/** 끌어서 넘긴 손가락을 뗀 뒤 이 시간 안의 클릭은 판 안 버튼에 닿지 않게 막는다 */
const CLICK_SUPPRESS_MS = 400;
/** 넘어갈 수 없는 쪽으로 끌면 손가락 이동의 이 비율만 따라온다 */
const BLOCKED_DRAG_RATIO = 0.2;

export type PanelSwipeStep = 1 | -1;

interface PanelSwipeHandlers {
  /** 손가락을 놓아 넘기기로 정했을 때 부른다(1 다음, -1 이전). 끄는 도중에는 부르지 않는다 */
  onSwipe: (step: PanelSwipeStep) => void;
  /** false인 쪽은 조금만 끌리다 제자리로 돌아오고 넘어가지 않는다 */
  canSwipe: (step: PanelSwipeStep) => boolean;
  /** 판 한 칸을 넘길 때 트랙이 움직이는 거리 */
  getPanelWidth: (track: HTMLElement) => number;
  onSlidingChange: (isSliding: boolean) => void;
}

interface SwipeState {
  mode: "pending" | "drag" | "ignore";
  startX: number;
  startY: number;
  /** 끌기를 시작할 때 트랙의 위치. 정착 연출 중에 다시 끌면 그 자리에서 이어 간다 */
  baseOffset: number;
  /** 끌기를 시작할 때 잰 판 한 칸 폭. 끄는 동안 레이아웃을 다시 읽지 않는다 */
  panelWidth: number;
  /** 움직임 줄이기면 판을 옮기지 않고 번호만 바꾼다. 끌기를 시작할 때 한 번 읽는다 */
  reduceMotion: boolean;
  samples: { x: number; time: number }[];
}

/**
 * area의 터치로 track을 끌어 판을 넘기는 리스너를 붙이고, 버튼용 slideIn과 떼기 함수를 돌려준다.
 * 지금 판 위치는 track의 CSS translate가 정하고, 여기서는 그 위에 transform으로 끈 거리만 더한다
 */
export const attachPanelSwipe = (
  area: HTMLElement,
  track: HTMLElement,
  handlers: PanelSwipeHandlers,
) => {
  let state: SwipeState | null = null;
  let suppressClickUntil = -Infinity;
  // 끝난 전환은 transitionend가 오지 않을 수 있어(움직일 거리가 없거나 끊김) 시간으로 정착을 알린다
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const getOffset = () => new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;

  /** 옆 판 너머가 보이지 않게 판 한 칸 안에서 옮긴다 */
  const setOffset = (offset: number, panelWidth = handlers.getPanelWidth(track)) => {
    const clamped = Math.max(-panelWidth, Math.min(panelWidth, offset));
    track.style.transform = clamped === 0 ? "" : `translate3d(${clamped}px, 0, 0)`;
  };

  /** 트랙을 지금 판 자리로 보낸다 */
  const settle = (animate: boolean) => {
    track.style.transition = animate
      ? `transform ${PANEL_SETTLE_DURATION_MS}ms var(--ease-pk-move)`
      : "";
    setOffset(0);
    clearTimeout(settleTimer);
    if (animate) {
      settleTimer = setTimeout(() => handlers.onSlidingChange(false), PANEL_SETTLE_DURATION_MS);
    } else {
      handlers.onSlidingChange(false);
    }
  };

  /**
   * 판 번호가 step만큼 바뀌어 다시 렌더되기 전에 부른다. 보던 화면이 그대로 남도록 판 한 칸만큼
   * 반대로 옮겨 두고 지금 판 자리로 정착시킨다. 새 번호는 이 이벤트가 끝나고 그리기 전에 렌더된다
   */
  const slideFrom = (offset: number, step: PanelSwipeStep) => {
    const panelWidth = handlers.getPanelWidth(track);
    track.style.transition = "";
    setOffset(offset + step * panelWidth, panelWidth);
    track.getBoundingClientRect();
    handlers.onSlidingChange(true);
    settle(true);
  };

  const slideIn = (step: PanelSwipeStep) => {
    state = null;
    if (prefersReducedMotion()) return;
    slideFrom(getOffset(), step);
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
      panelWidth: 0,
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
      state.baseOffset = getOffset();
      state.panelWidth = handlers.getPanelWidth(track);
      track.style.transition = "";
    }

    if (event.cancelable) event.preventDefault();
    if (!state.reduceMotion) {
      // 오른쪽으로 끌면 이전 판(-1), 왼쪽이면 다음 판(1)이 들어온다
      const isBlocked = deltaX !== 0 && !handlers.canSwipe(deltaX > 0 ? -1 : 1);
      setOffset(
        state.baseOffset + (isBlocked ? deltaX * BLOCKED_DRAG_RATIO : deltaX),
        state.panelWidth,
      );
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
    const swipeStep = getPanelSwipeStep({
      deltaX,
      velocityX: !isPaused && elapsed > 0 ? (last.x - first.x) / elapsed : 0,
      width: area.clientWidth,
    });
    const step = swipeStep !== 0 && handlers.canSwipe(swipeStep) ? swipeStep : 0;
    const { reduceMotion } = state;
    state = null;

    if (step === 0) {
      settle(!reduceMotion);
      return;
    }
    const offset = getOffset();
    handlers.onSwipe(step);
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

  // 끌어서 넘긴 손가락을 뗄 때 판 안 버튼이 눌리지 않게 한다
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

  const detach = () => {
    area.removeEventListener("touchstart", handleTouchStart);
    area.removeEventListener("touchmove", handleTouchMove);
    area.removeEventListener("touchend", handleTouchEnd);
    area.removeEventListener("touchcancel", handleTouchCancel);
    area.removeEventListener("click", handleClickCapture, true);
    clearTimeout(settleTimer);
    track.style.transition = "";
    setOffset(0);
  };

  return { slideIn, detach };
};

/** 판 한 칸 폭은 첫 판에서 둘째 판까지의 거리라 판 폭·사이 간격이 바뀌어도 맞는다 */
const getPanelStep = (track: HTMLElement) => {
  const [first, second] = Array.from(track.children) as HTMLElement[];
  return first && second ? second.offsetLeft - first.offsetLeft : track.offsetWidth;
};

/**
 * 판 넘기기 영역(touch-action: pan-y)의 좌우 밀기로 판을 옮긴다(달력 월 넘김·규칙 안내 카드).
 * track은 판을 가로로 이어 붙이고 CSS translate로 지금 판을 보이게 둔 트랙이다. 처음 움직임이 가로면 판이
 * 손가락을 따라오고(한 칸 넘게는 끌리지 않음), 놓을 때 거리·속도로 넘길지 정해 onSwipe를 한 번만 부른다.
 * 넘기면 새 번호가 렌더된 뒤에도 보던 자리에서 이어 지금 판 자리로 들어오고, 아니면 제자리로 돌아온다.
 * 정착 연출 중에 다시 끌면 그 자리에서 이어 가므로 빠르게 연달아 밀어도 한 번에 한 칸씩 넘어간다.
 * 끄는 동안에는 번호를 바꾸지 않아, 판 내용이 다시 그려져 손가락 아래 요소가 문서에서 떨어지는 일이 없다.
 * area·track은 콜백 ref로 받은 요소라 늦게 그려지는 화면에도 붙는다.
 * 돌려주는 slideIn(step)은 버튼으로 번호를 옮기기 직전에 불러 같은 슬라이드로 넘기고,
 * isSliding은 옮기는 슬라이드가 시작돼 멈출 때까지 true다(움직임 줄이기면 늘 false)
 */
export const usePanelSwipe = (
  area: HTMLElement | null,
  track: HTMLElement | null,
  onSwipe: (step: PanelSwipeStep) => void,
  canSwipe: (step: PanelSwipeStep) => boolean = () => true,
) => {
  const handlersRef = useRef({ onSwipe, canSwipe });
  handlersRef.current = { onSwipe, canSwipe };
  const slideInRef = useRef<(step: PanelSwipeStep) => void>(() => {});
  const [isSliding, setIsSliding] = useState(false);

  useEffect(() => {
    if (!area || !track) return;
    const { slideIn, detach } = attachPanelSwipe(area, track, {
      onSwipe: (step) => handlersRef.current.onSwipe(step),
      canSwipe: (step) => handlersRef.current.canSwipe(step),
      getPanelWidth: getPanelStep,
      onSlidingChange: setIsSliding,
    });
    slideInRef.current = slideIn;
    return () => {
      slideInRef.current = () => {};
      detach();
    };
  }, [area, track]);

  const slideIn = useCallback((step: PanelSwipeStep) => slideInRef.current(step), []);
  return { slideIn, isSliding };
};

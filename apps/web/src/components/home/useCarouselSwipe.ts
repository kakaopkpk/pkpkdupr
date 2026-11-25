import React, { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
import { getActiveSlideIndex, getSwipeTargetIndex } from "./carouselPosition";

/** 이만큼 움직인 뒤에 가로/세로 방향을 정한다 */
const AXIS_LOCK_PX = 8;
/** 속도는 최근 이 시간 안의 이동으로 잰다 */
const VELOCITY_WINDOW_MS = 100;
/** 손가락 밖(트랙패드·키보드 포커스)으로 스크롤이 멈추고 이 시간이 지나면 가까운 카드에 맞춘다 */
const SCROLL_SETTLE_DELAY_MS = 150;
/** 첫·마지막 카드 바깥으로 끌면 손가락 이동의 이 비율만 따라온다 */
const EDGE_RESISTANCE = 0.3;
const EDGE_SETTLE_DURATION_MS = 180;
/** 끌어서 넘긴 손가락을 뗀 뒤 이 시간 안의 클릭은 카드 안 버튼에 닿지 않게 막는다 */
const CLICK_SUPPRESS_MS = 400;

interface SwipeState {
  mode: "pending" | "drag" | "ignore";
  startX: number;
  startY: number;
  startScrollLeft: number;
  maxScrollLeft: number;
  startIndex: number;
  samples: { x: number; time: number }[];
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

const getSlides = (track: HTMLElement) => Array.from(track.children) as HTMLElement[];

const getMaxScrollLeft = (track: HTMLElement) =>
  Math.max(0, track.scrollWidth - track.clientWidth);

/** 각 카드의 맞춤 위치(트랙 기준 왼쪽 끝 - 스크롤 여백) */
const getSlideOffsets = (track: HTMLElement) => {
  const scrollPadding = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
  return getSlides(track).map((slide) => slide.offsetLeft - scrollPadding);
};

const getNearestSlideIndex = (track: HTMLElement) =>
  getActiveSlideIndex({
    scrollLeft: track.scrollLeft,
    maxScrollLeft: getMaxScrollLeft(track),
    slideOffsets: getSlideOffsets(track),
  });

/** index번째 카드로 스크롤한다. 마지막 카드는 왼쪽 끝까지 오지 못하므로 끝까지만 간다 */
const scrollToSlide = (track: HTMLElement, index: number, animate: boolean) => {
  track.scrollTo({
    left: clamp(getSlideOffsets(track)[index] ?? 0, 0, getMaxScrollLeft(track)),
    behavior: animate && !prefersReducedMotion() ? "smooth" : "auto",
  });
};

/** 첫 카드로 부드럽게 되돌린다 */
export const scrollCarouselToStart = (track: HTMLElement) => {
  scrollToSlide(track, 0, true);
};

/** index번째 카드로 부드럽게 넘긴다(이전·다음 버튼) */
export const scrollCarouselToIndex = (track: HTMLElement, index: number) => {
  scrollToSlide(track, clamp(index, 0, track.children.length - 1), true);
};

/**
 * 가로 스크롤 트랙(touch-action: pan-y)의 카드 넘기기. 손가락 가로 끌기는 브라우저 스크롤 대신 직접
 * 처리해, 놓을 때 거리·속도로 멈출 카드를 하나만 고른다(살짝 튕기기로 넘어가거나 관성으로 여러 장
 * 지나치지 않게). 그 밖의 스크롤은 멈춘 뒤 가까운 카드에 맞추고, 폭이 바뀌면 보던 카드에 다시 맞춘다.
 * 지금 카드 번호를 돌려준다
 */
export const useCarouselSwipe = (
  trackRef: React.RefObject<HTMLElement | null>,
  /** 카드 수. 바뀌면 다시 맞춘다 */
  count: number,
) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let state: SwipeState | null = null;
    let frame: number | null = null;
    let settleTimeout: number | null = null;
    let edgeOffset = 0;
    let suppressClickUntil = -Infinity;

    const updateActiveIndex = () => {
      frame = null;
      setActiveIndex(getNearestSlideIndex(track));
    };

    const clearSettleTimeout = () => {
      if (settleTimeout !== null) {
        window.clearTimeout(settleTimeout);
        settleTimeout = null;
      }
    };

    // 가장자리 바깥으로 끈 만큼은 스크롤로 갈 수 없어 카드들을 직접 옮겨 보여 준다
    const setEdgeOffset = (offset: number, animate: boolean) => {
      if (offset === edgeOffset) return;
      edgeOffset = offset;
      const transition =
        animate && !prefersReducedMotion() ? `transform ${EDGE_SETTLE_DURATION_MS}ms ease-out` : "";
      for (const slide of getSlides(track)) {
        slide.style.transition = transition;
        slide.style.transform = offset === 0 ? "" : `translate3d(${offset}px, 0, 0)`;
      }
    };

    const handleScroll = () => {
      if (frame === null) frame = requestAnimationFrame(updateActiveIndex);
      // 손가락으로 넘길 때는 놓는 순간 멈출 카드를 정하므로, 그 밖의 스크롤만 멈춘 뒤 가까운 카드에 맞춘다
      if (state?.mode === "drag") return;
      clearSettleTimeout();
      settleTimeout = window.setTimeout(() => {
        settleTimeout = null;
        scrollToSlide(track, getNearestSlideIndex(track), true);
      }, SCROLL_SETTLE_DELAY_MS);
    };

    const finishDrag = (targetIndex: number) => {
      state = null;
      setEdgeOffset(0, true);
      scrollToSlide(track, targetIndex, true);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        state = null;
        return;
      }
      const touch = event.touches[0];
      state = {
        mode: "pending",
        startX: touch.clientX,
        startY: touch.clientY,
        startScrollLeft: track.scrollLeft,
        maxScrollLeft: getMaxScrollLeft(track),
        startIndex: getNearestSlideIndex(track),
        samples: [{ x: touch.clientX, time: event.timeStamp }],
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!state || state.mode === "ignore") return;
      if (event.touches.length !== 1) {
        // 두 번째 손가락이 닿으면 넘기기를 멈추고 시작 카드로 돌린다
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
        clearSettleTimeout();
      }

      if (event.cancelable) event.preventDefault();
      const nextScrollLeft = state.startScrollLeft - deltaX;
      const overscroll = nextScrollLeft - clamp(nextScrollLeft, 0, state.maxScrollLeft);
      track.scrollLeft = nextScrollLeft;
      setEdgeOffset(-overscroll * EDGE_RESISTANCE, false);
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
      const elapsed = event.timeStamp - first.time;
      finishDrag(
        getSwipeTargetIndex({
          startIndex: state.startIndex,
          count: track.children.length,
          deltaX: last.x - state.startX,
          velocityX: elapsed > 0 ? (last.x - first.x) / elapsed : 0,
          slideWidth: getSlides(track)[0]?.offsetWidth ?? 0,
        }),
      );
    };

    const handleTouchCancel = () => {
      if (state?.mode !== "drag") {
        state = null;
        return;
      }
      finishDrag(state.startIndex);
    };

    // 끌어서 넘긴 손가락을 뗄 때 카드 안 버튼이 눌리지 않게 한다
    const handleClickCapture = (event: MouseEvent) => {
      if (event.timeStamp > suppressClickUntil) return;
      suppressClickUntil = -Infinity;
      event.preventDefault();
      event.stopPropagation();
    };

    // 카드 수가 바뀌거나, 숨은 탭이 다시 보이거나 폭이 바뀌면 스크롤 이벤트 없이 위치가 달라질 수 있어
    // 다시 고르고 그 카드에 맞춘다. observe 직후 콜백이 한 번 불려 카드 수 변경도 함께 처리된다
    const observer = new ResizeObserver(() => {
      // 숨은 탭(크기 0)에서는 위치를 건드리지 않아 다시 보일 때 보던 카드가 남는다
      if (track.clientWidth > 0 && state?.mode !== "drag") {
        scrollToSlide(track, getNearestSlideIndex(track), false);
      }
      updateActiveIndex();
    });
    observer.observe(track);

    track.addEventListener("scroll", handleScroll, { passive: true });
    track.addEventListener("touchstart", handleTouchStart, { passive: true });
    track.addEventListener("touchmove", handleTouchMove, { passive: false });
    track.addEventListener("touchend", handleTouchEnd);
    track.addEventListener("touchcancel", handleTouchCancel);
    track.addEventListener("click", handleClickCapture, true);
    return () => {
      observer.disconnect();
      track.removeEventListener("scroll", handleScroll);
      track.removeEventListener("touchstart", handleTouchStart);
      track.removeEventListener("touchmove", handleTouchMove);
      track.removeEventListener("touchend", handleTouchEnd);
      track.removeEventListener("touchcancel", handleTouchCancel);
      track.removeEventListener("click", handleClickCapture, true);
      if (frame !== null) cancelAnimationFrame(frame);
      clearSettleTimeout();
      setEdgeOffset(0, false);
    };
  }, [trackRef, count]);

  return activeIndex;
};

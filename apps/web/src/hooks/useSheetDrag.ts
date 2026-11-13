import React from "react";

/** 본문 밖(그랩바·헤더)에서 시트 위쪽 이 높이 안을 잡으면 끌린다 */
const HANDLE_ZONE_PX = 56;
/** 이만큼 움직인 뒤에 가로/세로 방향을 정한다 */
const AXIS_LOCK_PX = 4;
/** 위로 끌면 손가락 이동의 1/3만 따라온다 */
const UPWARD_RESISTANCE = 1 / 3;
const DISMISS_DISTANCE_RATIO = 0.25;
const DISMISS_VELOCITY_PX_PER_MS = 0.5;
/** 속도는 최근 이 시간 안의 이동으로 잰다 */
const VELOCITY_WINDOW_MS = 100;
const SETTLE_DURATION_MS = 180;
/** 닫기를 요청했는데 부모가 닫지 않으면 이 시간 뒤 제자리로 돌린다 */
const DISMISS_FALLBACK_MS = 1000;
/** 끄는 만큼 딤을 옅게 하는 배율(1→0). index.css `.app-bottom-sheet-backdrop`이 읽는다 */
const DRAG_FADE_PROPERTY = "--sheet-drag-fade";

interface UseSheetDragOptions {
  /** 끌려 움직이는 시트 표면 */
  surfaceRef: React.RefObject<HTMLElement | null>;
  /** 끄는 만큼 옅어지는 딤 */
  dimRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  isOpen: boolean;
  onDismiss: () => void;
}

type DragMode = "pending" | "drag" | "ignore";

interface DragState {
  mode: DragMode;
  /** 본문에서 시작했으면 아래로 끌 때만 시트를 끈다 */
  isFromBody: boolean;
  startX: number;
  startY: number;
  offset: number;
  samples: { y: number; time: number }[];
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 바텀시트 끌어 닫기. 그랩바·헤더를 잡거나, 손을 댄 순간 본문이 맨 위였을 때 본문을
 * 아래로 끌면 시트가 따라 내려간다. 놓을 때 충분히 내려갔거나 빠르게 튕겼으면
 * onDismiss를 부르고(시트는 그 자리에서 BottomSheet의 닫힘 전환으로 이어진다),
 * 아니면 제자리로 돌아간다. 매 프레임 렌더를 피하려고 스타일은 DOM에 직접 쓴다.
 */
export function useSheetDrag({
  surfaceRef,
  dimRef,
  enabled,
  isOpen,
  onDismiss,
}: UseSheetDragOptions): void {
  const onDismissRef = React.useRef(onDismiss);
  const isOpenRef = React.useRef(isOpen);
  const settleTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const clearSettleTimeout = React.useCallback(() => {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  }, []);

  const applyOffset = React.useCallback(
    (offset: number, transition: string) => {
      const surface = surfaceRef.current;
      const dim = dimRef.current;
      if (surface) {
        surface.style.transition = transition;
        surface.style.transform =
          offset === 0 ? "" : `translate3d(0, ${offset}px, 0)`;
      }
      if (dim) {
        const height = surface?.offsetHeight ?? 0;
        const progress = height > 0 ? Math.max(0, offset) / height : 0;
        dim.style.transition = transition;
        // 딤 opacity는 CSS에서 열림 상태와 이 값을 곱해 정한다(.app-bottom-sheet-backdrop)
        if (progress === 0) {
          dim.style.removeProperty(DRAG_FADE_PROPERTY);
        } else {
          dim.style.setProperty(
            DRAG_FADE_PROPERTY,
            `${Math.max(0, 1 - progress)}`,
          );
        }
      }
    },
    [dimRef, surfaceRef],
  );

  const settleBack = React.useCallback(() => {
    clearSettleTimeout();
    const duration = prefersReducedMotion() ? 0 : SETTLE_DURATION_MS;
    applyOffset(
      0,
      duration > 0
        ? `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`
        : "",
    );
    settleTimeoutRef.current = window.setTimeout(() => {
      applyOffset(0, "");
      settleTimeoutRef.current = null;
    }, duration);
  }, [applyOffset, clearSettleTimeout]);

  React.useEffect(() => {
    isOpenRef.current = isOpen;
    clearSettleTimeout();
    if (isOpen) {
      // 닫는 도중 다시 열리면 끌린 위치를 지운다
      applyOffset(0, "");
      return;
    }
    // 끌다 닫히면 끄는 동안 막아 둔 딤 전환만 풀어, 옅어진 정도에서 BottomSheet의
    // 닫힘 전환으로 이어지게 한다. 시트 표면은 끌린 위치에서 그대로 내려간다.
    if (dimRef.current) {
      dimRef.current.style.transition = "";
    }
  }, [applyOffset, clearSettleTimeout, dimRef, isOpen]);

  React.useEffect(() => clearSettleTimeout, [clearSettleTimeout]);

  React.useEffect(() => {
    const surface = surfaceRef.current;
    if (!enabled || !surface) {
      return undefined;
    }

    let state: DragState | null = null;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        state = null;
        return;
      }

      const touch = event.touches[0];
      const target = event.target instanceof Element ? event.target : null;
      const body = target?.closest(".app-bottom-sheet-body");
      // 본문 안의 터치는 위쪽 영역이어도 본문 규칙만 따른다(스크롤된 본문을 되돌리는
      // 스크롤을 가로채지 않도록). 손을 댄 순간 본문이 맨 위일 때만 본문 끌기를
      // 허용하고, 스크롤하다 맨 위에 닿은 같은 터치는 관성 속도가 닫기 판정으로
      // 넘어가지 않게 스크롤만 한다
      const isFromBody = !!body;
      const canDrag = body
        ? body.scrollTop <= 0
        : touch.clientY - surface.getBoundingClientRect().top <= HANDLE_ZONE_PX;

      if (!canDrag) {
        state = null;
        return;
      }

      clearSettleTimeout();
      state = {
        mode: "pending",
        isFromBody,
        startX: touch.clientX,
        startY: touch.clientY,
        offset: 0,
        samples: [{ y: touch.clientY, time: event.timeStamp }],
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!state || state.mode === "ignore") {
        return;
      }

      const touch = event.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;

      if (state.mode === "pending") {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) {
          return;
        }
        // 가로 움직임(점수 칩 같은 가로 스크롤)과 본문에서 위로 미는 스크롤은 넘긴다
        if (Math.abs(dx) > Math.abs(dy) || (state.isFromBody && dy < 0)) {
          state.mode = "ignore";
          return;
        }
        state.mode = "drag";
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      state.offset = dy > 0 ? dy : dy * UPWARD_RESISTANCE;
      state.samples.push({ y: touch.clientY, time: event.timeStamp });
      const cutoff = event.timeStamp - VELOCITY_WINDOW_MS;
      while (state.samples.length > 2 && state.samples[0].time < cutoff) {
        state.samples.shift();
      }
      applyOffset(state.offset, "none");
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const current = state;
      state = null;
      if (!current || current.mode !== "drag") {
        return;
      }

      const first = current.samples[0];
      const last = current.samples[current.samples.length - 1];
      const elapsed = event.timeStamp - first.time;
      const velocity = elapsed > 0 ? (last.y - first.y) / elapsed : 0;
      const height = surface.offsetHeight;
      const shouldDismiss =
        current.offset > 0 &&
        (current.offset > height * DISMISS_DISTANCE_RATIO ||
          velocity > DISMISS_VELOCITY_PX_PER_MS);

      if (!shouldDismiss) {
        settleBack();
        return;
      }

      // 끌린 위치를 유지한 채 BottomSheet의 닫힘 전환이 이어서 내린다
      onDismissRef.current();
      settleTimeoutRef.current = window.setTimeout(() => {
        settleTimeoutRef.current = null;
        if (isOpenRef.current) {
          settleBack();
        }
      }, DISMISS_FALLBACK_MS);
    };

    const handleTouchCancel = () => {
      const current = state;
      state = null;
      if (current?.mode === "drag") {
        settleBack();
      }
    };

    surface.addEventListener("touchstart", handleTouchStart, { passive: true });
    surface.addEventListener("touchmove", handleTouchMove, { passive: false });
    surface.addEventListener("touchend", handleTouchEnd);
    surface.addEventListener("touchcancel", handleTouchCancel);

    return () => {
      surface.removeEventListener("touchstart", handleTouchStart);
      surface.removeEventListener("touchmove", handleTouchMove);
      surface.removeEventListener("touchend", handleTouchEnd);
      surface.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [applyOffset, clearSettleTimeout, enabled, settleBack, surfaceRef]);
}

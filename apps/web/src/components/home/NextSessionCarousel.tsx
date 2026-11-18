import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ParticipationError,
  type ParticipationAction,
} from "@/components/session/SessionBlueCard";
import { cx } from "@/components/ui/cx";
import {
  isSessionParticipant,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import NextSessionCard from "./NextSessionCard";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
import { getActiveSlideIndex, getSwipeTargetIndex } from "./carouselPosition";

/** 이 개수까지는 위치를 점으로, 넘으면 "n / N" 글자로 보인다 */
const MAX_POSITION_DOTS = 10;
/** 이만큼 움직인 뒤에 가로/세로 방향을 정한다 */
const AXIS_LOCK_PX = 8;
/** 속도는 최근 이 시간 안의 이동으로 잰다 */
const VELOCITY_WINDOW_MS = 100;
/** 손가락 밖(트랙패드·키보드 포커스)으로 스크롤이 멈추고 이 시간이 지나면 가까운 카드에 맞춘다 */
const SCROLL_SETTLE_DELAY_MS = 150;

interface SwipeState {
  mode: "pending" | "drag" | "ignore";
  startX: number;
  startY: number;
  startScrollLeft: number;
  startIndex: number;
  samples: { x: number; time: number }[];
}

/** 각 카드의 맞춤 위치(트랙 기준 왼쪽 끝 - 스크롤 여백) */
const getSlideOffsets = (track: HTMLElement) => {
  const scrollPadding = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
  return Array.from(
    track.children,
    (slide) => (slide as HTMLElement).offsetLeft - scrollPadding,
  );
};

const getNearestSlideIndex = (track: HTMLElement) =>
  getActiveSlideIndex({
    scrollLeft: track.scrollLeft,
    maxScrollLeft: track.scrollWidth - track.clientWidth,
    slideOffsets: getSlideOffsets(track),
  });

/** index번째 카드로 스크롤한다. 마지막 카드는 왼쪽 끝까지 오지 못하므로 끝까지만 간다 */
const scrollToSlide = (track: HTMLElement, index: number, animate: boolean) => {
  const offset = getSlideOffsets(track)[index] ?? 0;
  const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
  track.scrollTo({
    left: Math.max(0, Math.min(offset, maxScrollLeft)),
    behavior: animate && !prefersReducedMotion() ? "smooth" : "auto",
  });
};

/** 카드 아래 위치 표시. 지금 카드는 블루로 길게, 나머지는 회색 작은 원 */
const PositionIndicator: React.FC<{ count: number; activeIndex: number }> = ({
  count,
  activeIndex,
}) =>
  count > MAX_POSITION_DOTS ? (
    <p
      aria-hidden="true"
      className="text-center text-pk-12 font-bold text-pk-sub tabular-nums"
    >
      <span className="text-pk-primary">{activeIndex + 1}</span> / {count}
    </p>
  ) : (
    <div aria-hidden="true" className="flex justify-center gap-1.5 py-1">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={cx(
            "h-1.5 rounded-full transition-colors duration-200 motion-reduce:transition-none",
            index === activeIndex ? "w-[18px] bg-pk-primary" : "w-1.5 bg-pk-line",
          )}
        />
      ))}
    </div>
  );

interface NextSessionCarouselProps {
  /** 다가오는 세션. 서버 순서(날짜 오름차순)대로 첫 카드가 다음 세션이다 */
  sessions: readonly MatchSessionDetailInfo[];
  playerId: string | undefined;
  todayKey: string;
  now: Date;
  getPendingAction: (sessionId: string) => ParticipationAction | null;
  getError: (sessionId: string) => string | null;
  onJoin: (sessionId: string) => void;
  onLeave: (sessionId: string) => void;
  onOpenParticipants: (session: MatchSessionDetailInfo) => void;
}

/**
 * 홈의 다가오는 세션 블루 카드 묶음. 세션이 둘 이상이면 가로로 넘기며, 카드 폭을 화면보다 좁게 잡아
 * 다음 카드가 오른쪽에 살짝 보이고 카드 단위로 멈추며, 한 번 넘길 때 한 장만 넘어간다. 어느 카드에서든 참여하기·참여 취소가 된다
 */
const NextSessionCarousel: React.FC<NextSessionCarouselProps> = ({
  sessions,
  playerId,
  todayKey,
  now,
  getPendingAction,
  getError,
  onJoin,
  onLeave,
  onOpenParticipants,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const count = sessions.length;

  const updateActiveIndex = useCallback(() => {
    frameRef.current = null;
    const track = trackRef.current;
    if (!track) return;
    setActiveIndex(getNearestSlideIndex(track));
  }, []);

  const clearSettleTimeout = useCallback(() => {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  }, []);

  const handleScroll = () => {
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(updateActiveIndex);
    }
    if (isDraggingRef.current) return;
    // 손가락으로 넘길 때는 놓는 순간 멈출 카드를 정하므로, 그 밖의 스크롤만 멈춘 뒤 가까운 카드에 맞춘다
    clearSettleTimeout();
    settleTimeoutRef.current = window.setTimeout(() => {
      settleTimeoutRef.current = null;
      const track = trackRef.current;
      if (track && !isDraggingRef.current) {
        scrollToSlide(track, getNearestSlideIndex(track), true);
      }
    }, SCROLL_SETTLE_DELAY_MS);
  };

  // 세션 수가 바뀌거나, 숨은 탭이 다시 보이거나 폭이 바뀌면 스크롤 이벤트 없이 위치가 달라질 수 있어
  // 다시 고르고 그 카드에 맞춘다. observe 직후 콜백이 한 번 불려 세션 수 변경도 함께 처리된다
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => {
      // 숨은 탭(크기 0)에서는 위치를 건드리지 않아 다시 보일 때 보던 카드가 남는다
      if (track.clientWidth > 0 && !isDraggingRef.current) {
        scrollToSlide(track, getNearestSlideIndex(track), false);
      }
      updateActiveIndex();
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [count, updateActiveIndex]);

  // 가로 넘기기는 브라우저 스크롤 대신 직접 처리한다(트랙은 touch-action: pan-y). 놓을 때 거리·속도로
  // 멈출 카드를 하나만 골라, 살짝 튕기기로 넘어가거나 관성으로 여러 장 지나치지 않게 한다
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let state: SwipeState | null = null;
    let shouldSuppressClick = false;

    const handleTouchStart = (event: TouchEvent) => {
      shouldSuppressClick = false;
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
        isDraggingRef.current = true;
        clearSettleTimeout();
      }

      if (event.cancelable) event.preventDefault();
      track.scrollLeft = state.startScrollLeft - deltaX;
      state.samples.push({ x: touch.clientX, time: event.timeStamp });
      const cutoff = event.timeStamp - VELOCITY_WINDOW_MS;
      while (state.samples.length > 2 && state.samples[0].time < cutoff) {
        state.samples.shift();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const current = state;
      state = null;
      if (!current || current.mode !== "drag") return;
      isDraggingRef.current = false;
      shouldSuppressClick = true;

      const first = current.samples[0];
      const last = current.samples[current.samples.length - 1];
      const elapsed = event.timeStamp - first.time;
      const targetIndex = getSwipeTargetIndex({
        startIndex: current.startIndex,
        count: track.children.length,
        deltaX: last.x - current.startX,
        velocityX: elapsed > 0 ? (last.x - first.x) / elapsed : 0,
        slideWidth: (track.children[0] as HTMLElement | undefined)?.offsetWidth ?? 0,
      });
      scrollToSlide(track, targetIndex, true);
    };

    const handleTouchCancel = () => {
      const current = state;
      state = null;
      if (current?.mode !== "drag") return;
      isDraggingRef.current = false;
      scrollToSlide(track, current.startIndex, true);
    };

    // 끌어서 넘긴 손가락을 뗄 때 카드 안 버튼이 눌리지 않게 한다
    const handleClickCapture = (event: MouseEvent) => {
      if (!shouldSuppressClick) return;
      shouldSuppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    track.addEventListener("touchstart", handleTouchStart, { passive: true });
    track.addEventListener("touchmove", handleTouchMove, { passive: false });
    track.addEventListener("touchend", handleTouchEnd);
    track.addEventListener("touchcancel", handleTouchCancel);
    track.addEventListener("click", handleClickCapture, true);
    return () => {
      isDraggingRef.current = false;
      track.removeEventListener("touchstart", handleTouchStart);
      track.removeEventListener("touchmove", handleTouchMove);
      track.removeEventListener("touchend", handleTouchEnd);
      track.removeEventListener("touchcancel", handleTouchCancel);
      track.removeEventListener("click", handleClickCapture, true);
    };
  }, [count, clearSettleTimeout]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      clearSettleTimeout();
    },
    [clearSettleTimeout],
  );

  const renderCard = (session: MatchSessionDetailInfo, className?: string) => (
    <NextSessionCard
      session={session}
      todayKey={todayKey}
      now={now}
      isJoined={isSessionParticipant(session, playerId)}
      pendingAction={getPendingAction(session.id)}
      onJoin={() => onJoin(session.id)}
      onLeave={() => onLeave(session.id)}
      onOpenParticipants={() => onOpenParticipants(session)}
      className={className}
    />
  );

  const activeSession = sessions[Math.min(activeIndex, count - 1)];

  return (
    <div className="flex flex-col gap-2">
      {count === 1 ? (
        renderCard(sessions[0])
      ) : (
        <>
          {/* 홈 본문 좌우 여백(px-4)까지 넓혀 카드가 화면 끝에서 들어오고 나가게 한다.
              relative는 카드 offsetLeft를 트랙 기준으로 재기 위해서고, scroll-px-4는 카드 맞춤 위치의 여백이다 */}
          <div
            ref={trackRef}
            role="region"
            aria-roledescription="carousel"
            aria-label="다가오는 세션"
            onScroll={handleScroll}
            className="relative -mx-4 flex touch-pan-y scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {sessions.map((session, index) => (
              <div
                key={session.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${count}개 중 ${index + 1}번째`}
                className="flex w-[calc(100%-28px)] shrink-0"
              >
                {renderCard(session, "min-w-0 flex-1")}
              </div>
            ))}
          </div>
          <PositionIndicator count={count} activeIndex={activeIndex} />
        </>
      )}
      <ParticipationError error={getError(activeSession.id)} />
    </div>
  );
};

export default NextSessionCarousel;

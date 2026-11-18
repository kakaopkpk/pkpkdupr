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
import { getActiveSlideIndex, MAX_POSITION_DOTS } from "./carouselPosition";

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
 * 다음 카드가 오른쪽에 살짝 보이고 카드 단위로 멈춘다. 어느 카드에서든 참여하기·참여 취소가 된다
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
  const [activeIndex, setActiveIndex] = useState(0);
  const count = sessions.length;

  const updateActiveIndex = useCallback(() => {
    frameRef.current = null;
    const track = trackRef.current;
    if (!track) return;
    const scrollPadding = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
    const slideOffsets = Array.from(
      track.children,
      (slide) => (slide as HTMLElement).offsetLeft - scrollPadding,
    );
    setActiveIndex(
      getActiveSlideIndex({
        scrollLeft: track.scrollLeft,
        maxScrollLeft: track.scrollWidth - track.clientWidth,
        slideOffsets,
      }),
    );
  }, []);

  const handleScroll = () => {
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(updateActiveIndex);
    }
  };

  // 세션이 늘거나 줄면 같은 스크롤 위치에서 지금 카드를 다시 고른다
  useEffect(() => {
    updateActiveIndex();
  }, [count, updateActiveIndex]);

  // 숨은 탭이 다시 보이거나 폭이 바뀌면 스크롤 이벤트 없이 위치가 달라질 수 있어 다시 고른다
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => updateActiveIndex());
    observer.observe(track);
    return () => observer.disconnect();
  }, [count, updateActiveIndex]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
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

  if (count === 1) {
    return (
      <div className="flex flex-col gap-2">
        {renderCard(sessions[0])}
        <ParticipationError error={getError(sessions[0].id)} />
      </div>
    );
  }

  const activeSession = sessions[Math.min(activeIndex, count - 1)];

  return (
    <div className="flex flex-col gap-2">
      {/* 홈 본문 좌우 여백(px-4)까지 넓혀 카드가 화면 끝에서 들어오고 나가게 한다.
          relative는 카드 offsetLeft를 트랙 기준으로 재기 위해서다 */}
      <div
        ref={trackRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="다가오는 세션"
        onScroll={handleScroll}
        className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sessions.map((session, index) => (
          <div
            key={session.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${count}개 중 ${index + 1}번째`}
            className="flex w-[calc(100%-28px)] shrink-0 snap-start"
          >
            {renderCard(session, "min-w-0 flex-1")}
          </div>
        ))}
      </div>
      <PositionIndicator count={count} activeIndex={activeIndex} />
      <ParticipationError error={getError(activeSession.id)} />
    </div>
  );
};

export default NextSessionCarousel;

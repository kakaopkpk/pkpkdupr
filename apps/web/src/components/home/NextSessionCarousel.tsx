import React, { useEffect, useState } from "react";
import {
  ParticipationError,
  type ParticipationAction,
} from "@/components/session/SessionBlueCard";
import { cx } from "@/components/ui/cx";
import { useTabNavigation } from "@/context/TabNavigationContext";
import {
  isSessionParticipant,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import NextSessionCard from "./NextSessionCard";
import { scrollCarouselToStart, useCarouselSwipe } from "./useCarouselSwipe";

/** 이 개수까지는 위치를 점으로, 넘으면 "n / N" 글자로 보인다 */
const MAX_POSITION_DOTS = 10;

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
  getPendingAction: (sessionId: string) => ParticipationAction | null;
  getError: (sessionId: string) => string | null;
  onJoin: (sessionId: string) => void;
  onLeave: (sessionId: string) => void;
  onOpenParticipants: (session: MatchSessionDetailInfo) => void;
  /** 카드 빈 곳을 누르면. 세션 상세 열기 */
  onOpenSession: (sessionId: string) => void;
}

/**
 * 홈의 다가오는 세션 블루 카드 묶음. 세션이 둘 이상이면 가로로 넘기며, 카드 폭을 화면보다 좁게 잡아
 * 다음 카드가 오른쪽에 살짝 보이고 카드 단위로 멈추며, 한 번 넘길 때 한 장만 넘어간다. 어느 카드에서든 참여하기·참여 취소가 된다
 */
const NextSessionCarousel: React.FC<NextSessionCarouselProps> = ({
  sessions,
  playerId,
  todayKey,
  getPendingAction,
  getError,
  onJoin,
  onLeave,
  onOpenParticipants,
  onOpenSession,
}) => {
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const count = sessions.length;
  const activeIndex = useCarouselSwipe(track, count);

  const { registerTabReset } = useTabNavigation();

  // 홈 탭을 다시 누르면 첫 카드로 되돌린다
  useEffect(
    () =>
      registerTabReset("home", () => {
        if (track) scrollCarouselToStart(track);
      }),
    [registerTabReset, track],
  );

  const renderCard = (session: MatchSessionDetailInfo, className?: string) => (
    <NextSessionCard
      session={session}
      todayKey={todayKey}
      isJoined={isSessionParticipant(session, playerId)}
      pendingAction={getPendingAction(session.id)}
      onJoin={() => onJoin(session.id)}
      onLeave={() => onLeave(session.id)}
      onOpenParticipants={() => onOpenParticipants(session)}
      onPress={() => onOpenSession(session.id)}
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
            ref={setTrack}
            role="region"
            aria-roledescription="carousel"
            aria-label="다가오는 세션"
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

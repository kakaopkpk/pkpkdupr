import React from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import SkeletonBlock from "@/components/SkeletonBlock";
import { SessionDominatorBadge } from "@/components/ui/Badges";
import { Card } from "@/components/ui/Card";
import { CountUpText } from "@/components/ui/CountUpText";
import { RatingDelta } from "@/components/ui/Delta";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import { useCountUp } from "@/hooks/useCountUp";
import { usePlayOnShow } from "@/hooks/usePlayOnShow";
import type { MatchSessionHistoryInfo } from "@/lib/rankings";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** dateKey("2026-11-12")를 칩 라벨 "11/12 목"으로 바꾼다 */
export const formatSessionChipLabel = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day} ${weekday}`;
};

const formatRating = (rating: number | null) =>
  rating === null ? "NR" : rating.toFixed(3);

/** 세션 날짜 칩 가로 스크롤. 칩 하나가 세션 하나다 */
export const SessionChips: React.FC<{
  sessions: readonly MatchSessionHistoryInfo[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
}> = ({ sessions, selectedId, onSelect }) => (
  <nav
    aria-label="세션"
    className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {sessions.map((session) => {
      const isSelected = session.id === selectedId;
      const label = formatSessionChipLabel(session.dateKey);
      return (
        <button
          key={session.id}
          type="button"
          aria-pressed={isSelected}
          aria-label={`${label} ${session.name}`}
          onClick={() => {
            if (!isSelected) onSelect(session.id);
          }}
          className={cx(
            "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-pk-13 tabular-nums transition-colors",
            isSelected
              ? "bg-pk-primary font-extrabold text-white"
              : "bg-white font-bold text-pk-sub",
          )}
        >
          {label}
        </button>
      );
    })}
  </nav>
);

export const SessionSummary: React.FC<{ session: MatchSessionHistoryInfo }> = ({
  session,
}) => (
  <div className="flex flex-col gap-0.5 px-1 pb-1">
    <h2 className="text-pk-22 font-extrabold tracking-[-0.02em] text-pk-ink">
      {session.name}
    </h2>
    <span className="text-pk-13 text-pk-sub tabular-nums">
      {[
        session.location,
        `${session.participantCount}명`,
        `${session.matchCount}경기`,
      ]
        .filter(Boolean)
        .join(" · ")}
    </span>
  </div>
);

/** 평점 상승 카운트업 시작·길이(ms). 카드가 보이는 순간부터 잰다 */
const RISE_COUNT_DELAY_MS = 250;
const RISE_COUNT_DURATION_MS = 600;

/**
 * 그 세션에서 평점이 가장 많이 오른 사람(세션 지배자). 아바타에 불꽃 후광을 두른다.
 * 카드가 보일 때마다 왕관 까딱임·칩 흰 빛·평점 상승 카운트업을 한 번 재생한다
 */
export const TopRiserCard: React.FC<{ report: SessionPlayerReport }> = ({
  report,
}) => {
  const { isPlaying, finish } = usePlayOnShow();
  const riseCount = useCountUp(report.ratingDelta, {
    durationMs: RISE_COUNT_DURATION_MS,
    delayMs: RISE_COUNT_DELAY_MS,
  });
  const deltaClassName = "text-pk-22 font-extrabold leading-none";

  return (
    <Card className="flex items-center gap-3 px-4 py-3.5">
      <span className="pk-flame-aura shrink-0">
        <PlayerAvatar player={report.player} size={44} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span
          className="flex"
          onAnimationEnd={(event) => {
            // 칩 흰 빛이 가장 늦게 끝나는 CSS 연출이다
            if (event.animationName === "pk-sheen") finish();
          }}
        >
          <SessionDominatorBadge isPlaying={isPlaying} />
        </span>
        <span className="max-w-full truncate text-pk-17 font-extrabold text-pk-ink">
          {report.player.username}
        </span>
        <span className="text-pk-13 text-pk-sub tabular-nums">
          {formatRating(report.ratingBefore)} → {formatRating(report.ratingAfter)}{" "}
          · {report.matchCount}경기 {report.wins}승
        </span>
      </div>
      {/* 이 화면의 주인공 숫자라 본문 글꼴로 크게 보인다. 세는 동안 폭은 최종 값으로 고정한다 */}
      <CountUpText
        align="end"
        className="shrink-0"
        finalContent={
          <RatingDelta value={report.ratingDelta} className={deltaClassName} />
        }
      >
        <RatingDelta
          value={riseCount.value}
          signValue={report.ratingDelta}
          className={deltaClassName}
        />
      </CountUpText>
    </Card>
  );
};

export const SessionReportSkeleton: React.FC = () => (
  <div aria-hidden="true" className="flex flex-col gap-2.5">
    <div className="flex flex-col gap-1.5 px-1 pb-1">
      <SkeletonBlock className="h-7 w-40 rounded-pk-sm" />
      <SkeletonBlock className="h-4 w-48" />
    </div>
    <SkeletonBlock className="h-[76px] w-full rounded-pk-lg" />
    <SkeletonBlock className="mt-3 h-4 w-14" />
    <SkeletonBlock className="h-56 w-full rounded-pk-lg" />
  </div>
);

export const SessionChipsSkeleton: React.FC = () => (
  <div aria-hidden="true" className="flex gap-2 overflow-hidden pb-1">
    {[0, 1, 2, 3].map((index) => (
      <SkeletonBlock key={index} className="h-9 w-[72px] shrink-0 rounded-full" />
    ))}
  </div>
);

import React from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import SkeletonBlock from "@/components/SkeletonBlock";
import { SessionDominatorBadge } from "@/components/ui/Badges";
import { rowPressClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RankChange, RatingDelta } from "@/components/ui/Delta";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
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

/** 세션 전후 복식 순위 변동(rankBefore - rankAfter, 양수=상승). 둘 중 하나라도 null이면 null */
export const getSessionRankChange = (
  report: Pick<SessionPlayerReport, "rankBefore" | "rankAfter">,
): number | null =>
  report.rankBefore !== null && report.rankAfter !== null
    ? report.rankBefore - report.rankAfter
    : null;

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
        session.startTime
          ? `${formatSessionChipLabel(session.dateKey)} ${session.startTime}`
          : formatSessionChipLabel(session.dateKey),
        session.location,
        `${session.participantCount}명`,
        `${session.matchCount}경기`,
      ]
        .filter(Boolean)
        .join(" · ")}
    </span>
  </div>
);

/** 그 세션에서 평점이 가장 많이 오른 사람(세션 지배자). 아바타에 불꽃 후광을 두른다 */
export const TopRiserCard: React.FC<{ report: SessionPlayerReport }> = ({
  report,
}) => (
  <Card className="flex items-center gap-3 px-4 py-3.5">
    <span className="pk-flame-aura shrink-0">
      <PlayerAvatar player={report.player} size={44} />
    </span>
    <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
      <SessionDominatorBadge />
      <span className="max-w-full truncate text-pk-17 font-extrabold text-pk-ink">
        {report.player.username}
      </span>
      <span className="text-pk-13 text-pk-sub tabular-nums">
        {formatRating(report.ratingBefore)} → {formatRating(report.ratingAfter)}{" "}
        · {report.matchCount}경기 {report.wins}승
      </span>
    </div>
    {/* 이 화면의 주인공 숫자라 본문 글꼴로 크게 보인다 */}
    <RatingDelta
      value={report.ratingDelta}
      className="shrink-0 text-pk-22 font-extrabold leading-none"
    />
  </Card>
);

/**
 * 세션 평점 변화 줄 하나. 왼쪽 아바타·아이디·승패와 평점, 오른쪽 평점 변화와 세션 후 순위·변동.
 * ratingLabel이 "after"면 세션 후 평점만, "before-after"면 "전 → 후"로 보인다.
 */
export const SessionPlayerRatingRow: React.FC<{
  report: SessionPlayerReport;
  ratingLabel: "after" | "before-after";
  /** 주면 줄 앞에 순서 번호를 붙인다 */
  order?: number;
  onPress: () => void;
}> = ({ report, ratingLabel, order, onPress }) => {
  // 세션 전 NR이던 회원도 ratingBefore에 기본값이 들어 있으므로 rankBefore로 판정한다
  const wasUnratedBefore =
    report.rankBefore === null && report.rankAfter !== null;
  const beforeText = wasUnratedBefore
    ? "NR"
    : formatRating(report.ratingBefore);
  const ratingText =
    ratingLabel === "after" || report.ratingAfter === null
      ? formatRating(report.ratingAfter)
      : `${beforeText} → ${formatRating(report.ratingAfter)}`;
  const rankChange = getSessionRankChange(report);

  return (
    <button
      type="button"
      onClick={onPress}
      className={cx(
        "flex min-h-14 w-full items-center gap-3 py-2.5 text-left not-last:border-b not-last:border-pk-divider active:bg-pk-bg",
        rowPressClassName,
      )}
    >
      {order !== undefined ? (
        <span className="w-[18px] shrink-0 text-center text-pk-13 font-bold text-pk-muted tabular-nums">
          {order}
        </span>
      ) : null}
      <PlayerAvatar player={report.player} size={32} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-pk-15 font-bold text-pk-ink">
          {report.player.username}
        </span>
        <span className="truncate text-pk-12 text-pk-muted tabular-nums">
          {report.wins}승 {report.losses}패 · {ratingText}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <RatingDelta
          value={
            report.ratingBefore !== null && report.ratingAfter !== null
              ? report.ratingDelta
              : null
          }
        />
        <span className="flex items-baseline gap-1 text-pk-12 font-bold text-pk-sub tabular-nums">
          {report.rankAfter === null ? "–" : `${report.rankAfter}위`}
          {rankChange !== null && rankChange !== 0 ? (
            <RankChange value={rankChange} />
          ) : null}
        </span>
      </span>
    </button>
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

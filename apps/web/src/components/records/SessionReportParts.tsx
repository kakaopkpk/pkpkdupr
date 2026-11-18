import React from "react";
import { formatSessionTimeRange } from "@pkpkdupr/shared/session";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import SkeletonBlock from "@/components/SkeletonBlock";
import { SessionDominatorBadge } from "@/components/ui/Badges";
import { rowPressClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { WinLossCount } from "@/components/profile/ProfileStatTile";
import {
  COUNT_UP,
  CountUpNumber,
  CountUpPop,
  COUNT_UP_SECOND,
  CountUpRatingDelta,
} from "@/components/ui/CountUpNumber";
import { RankChange, RatingDelta } from "@/components/ui/Delta";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import { usePlayOnShow } from "@/hooks/usePlayOnShow";
import { formatKstShortDate } from "@/lib/format";
import type { MatchSessionHistoryInfo } from "@/lib/rankings";
import { formatRating } from "@/utils/dupr";

/** 세션 전후 복식 순위 변동(rankBefore - rankAfter, 양수=상승). 둘 중 하나라도 null이면 null */
export const getSessionRankChange = (
  report: Pick<SessionPlayerReport, "rankBefore" | "rankAfter">,
): number | null =>
  report.rankBefore !== null && report.rankAfter !== null
    ? report.rankBefore - report.rankAfter
    : null;

/**
 * 세션 전후 평점이 모두 있는지. 세션 전 NR이던 회원도 ratingBefore에 첫 경기 시작 평점(3.0)이 들어 있어
 * 다른 회원처럼 "3.000 → 3.124"와 변화량을 보인다. 첫 평점이 공식 DUPR 조정이면 ratingBefore가 null이다
 */
const hasRatingBeforeAndAfter = (
  report: Pick<SessionPlayerReport, "ratingBefore" | "ratingAfter">,
): boolean => report.ratingBefore !== null && report.ratingAfter !== null;

/**
 * 세션 상세 머리. 메타 줄은 "11월 13일 목 18:00~22:00 · 장소".
 * 종료 시각을 모르면 시작 시각만, 시작 시각도 없으면 날짜만 보인다.
 */
export const SessionSummary: React.FC<{
  session: MatchSessionHistoryInfo;
  /** 세션 상세 조회로 얻은 종료 시각("HH:MM"). 리포트 응답에는 없다 */
  endTime?: string | null;
}> = ({ session, endTime = null }) => {
  const time =
    formatSessionTimeRange({ startTime: session.startTime, endTime }) ??
    session.startTime;
  return (
    <div className="flex flex-col gap-0.5 px-1 pb-1">
      <h2 className="text-pk-22 font-extrabold tracking-[-0.02em] text-pk-ink">
        {session.name}
      </h2>
      <span className="text-pk-13 text-pk-sub tabular-nums">
        {[
          time
            ? `${formatKstShortDate(session.date)} ${time}`
            : formatKstShortDate(session.date),
          session.location,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </div>
  );
};

/**
 * 세션 후 평점. 후 평점이 없으면 "–".
 * 기본은 0.000부터 세고, from을 주면(세션 전 평점을 옆에 보이는 "전 → 후" 줄) 그 값부터 센다
 */
export const SessionRatingCount: React.FC<{
  report: Pick<SessionPlayerReport, "ratingAfter">;
  from?: number;
}> = ({ report, from }) => {
  if (report.ratingAfter === null) return <>–</>;
  return (
    <CountUpNumber
      value={report.ratingAfter}
      from={from}
      format={formatRating}
      {...COUNT_UP}
    />
  );
};

/** 세션 후 순위 "n위". 세션 전 순위에서 세고, 전 순위가 없으면 세지 않는다. 후 순위가 없으면 "–" */
export const SessionRankCount: React.FC<{
  report: Pick<SessionPlayerReport, "rankBefore" | "rankAfter">;
}> = ({ report }) =>
  report.rankAfter === null ? (
    <>–</>
  ) : (
    <span>
      <CountUpNumber
        value={report.rankAfter}
        from={report.rankBefore ?? report.rankAfter}
        {...COUNT_UP}
      />
      위
    </span>
  );

/** 세션 전후 순위 변동 ▲▼. 순위를 다 센 뒤 튀어나온다. 변동이 없거나 모르면 그리지 않는다 */
export const SessionRankChangePop: React.FC<{
  report: Pick<SessionPlayerReport, "rankBefore" | "rankAfter">;
  className?: string;
}> = ({ report, className }) => {
  const rankChange = getSessionRankChange(report);
  return rankChange !== null && rankChange !== 0 ? (
    <CountUpPop delayMs={COUNT_UP_SECOND.delayMs}>
      <RankChange value={rankChange} className={className} />
    </CountUpPop>
  ) : null;
};

/** 세션 평점 변화량. 0부터 세며, 전후 평점 중 하나라도 없으면 "–" */
export const SessionRatingDeltaCount: React.FC<{
  report: Pick<SessionPlayerReport, "ratingBefore" | "ratingAfter" | "ratingDelta">;
  className?: string;
}> = ({ report, className }) =>
  hasRatingBeforeAndAfter(report) ? (
    <CountUpRatingDelta
      value={report.ratingDelta}
      className={className}
      {...COUNT_UP}
    />
  ) : (
    <RatingDelta value={null} className={className} />
  );

/**
 * 그 세션에서 평점이 가장 많이 오른 사람(세션 지배자). 아바타에 불꽃 후광을 두른다.
 * 카드가 보일 때마다 왕관 까딱임·칩 흰 빛·평점 상승 카운트업을 한 번 재생한다
 */
export const TopRiserCard: React.FC<{ report: SessionPlayerReport }> = ({
  report,
}) => {
  const { isPlaying, finish } = usePlayOnShow();

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
          {hasRatingBeforeAndAfter(report)
            ? `${formatRating(report.ratingBefore)} → `
            : null}
          {formatRating(report.ratingAfter)} · {report.matchCount}경기 {report.wins}승
        </span>
      </div>
      {/* 이 화면의 주인공 숫자라 본문 글꼴로 크게 보인다 */}
      <CountUpRatingDelta
        value={report.ratingDelta}
        className="text-pk-22 font-extrabold leading-none"
        {...COUNT_UP}
      />
    </Card>
  );
};

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
  // 세션 전 평점이 없으면(공식 DUPR 조정이 첫 평점) "전 →" 없이 후 평점만 0부터 센다
  const showsBefore =
    ratingLabel === "before-after" && hasRatingBeforeAndAfter(report);
  // "전 → 후"로 보일 때는 후 평점을 전 평점부터 센다
  const ratingFrom = showsBefore ? report.ratingBefore ?? undefined : undefined;
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
          <WinLossCount wins={report.wins} losses={report.losses} />
          {/* 세션 후 평점이 없으면(게스트 등) 평점 부분 없이 승패만 보인다 */}
          {report.ratingAfter !== null ? (
            <>
              {" · "}
              {showsBefore ? `${formatRating(report.ratingBefore)} → ` : null}
              <SessionRatingCount report={report} from={ratingFrom} />
            </>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <SessionRatingDeltaCount report={report} />
        <span className="flex items-baseline gap-1 text-pk-12 font-bold text-pk-sub tabular-nums">
          <SessionRankCount report={report} />
          <SessionRankChangePop report={report} />
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

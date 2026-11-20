import React from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import SkeletonBlock from "@/components/SkeletonBlock";
import {
  SessionDominatorBadge,
  SessionWinStreakBadge,
} from "@/components/ui/Badges";
import { rowPressClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { WinLossCount } from "@/components/profile/ProfileStatTile";
import {
  COUNT_UP,
  CountUpNumber,
  CountUpRatingDelta,
} from "@/components/ui/CountUpNumber";
import { CountUpText } from "@/components/ui/CountUpText";
import { RankChange, RatingDelta } from "@/components/ui/Delta";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SessionWinStreakFrame } from "@/components/ui/WinStreakAvatarFrame";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useCountUp } from "@/hooks/useCountUp";
import { usePlayOnShow } from "@/hooks/usePlayOnShow";
import type { SessionWinStreak } from "@/lib/sessionWinStreak";
import { formatRating } from "@/utils/dupr";

/**
 * 세션 전후 평점이 모두 있는지. 세션 전 NR이던 회원도 ratingBefore에 첫 경기 시작 평점(3.0)이 들어 있어
 * 다른 회원처럼 "3.000 → 3.124"와 변화량을 보인다. 첫 평점이 공식 DUPR 조정이면 ratingBefore가 null이다
 */
export const hasRatingBeforeAndAfter = (
  report: Pick<SessionPlayerReport, "ratingBefore" | "ratingAfter">,
): boolean => report.ratingBefore !== null && report.ratingAfter !== null;

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

/**
 * 세는 중인 순위 기준 변동. SessionRankCount와 같은 박자로 세어 "6위 –" → "5위 ▲1" → "4위 ▲2"처럼
 * 옆 순위와 늘 맞는 값을 보인다. 폭은 최종 변동으로 고정하고 순위 쪽에 붙인다
 */
const RankChangeCount: React.FC<{
  rankBefore: number;
  rankAfter: number;
  className?: string;
}> = ({ rankBefore, rankAfter, className }) => {
  const rank = useCountUp(rankAfter, { from: rankBefore, ...COUNT_UP });
  return (
    <CountUpText
      align="start"
      finalContent={
        <RankChange value={rankBefore - rankAfter} className={className} />
      }
    >
      <RankChange
        value={rankBefore - Math.round(rank.value)}
        className={className}
      />
    </CountUpText>
  );
};

/** 세션 전후 순위 변동 ▲▼. 순위와 함께 센다. 변동이 없거나 모르면 그리지 않는다 */
export const SessionRankChangeCount: React.FC<{
  report: Pick<SessionPlayerReport, "rankBefore" | "rankAfter">;
  className?: string;
}> = ({ report: { rankBefore, rankAfter }, className }) =>
  rankBefore !== null && rankAfter !== null && rankBefore !== rankAfter ? (
    <RankChangeCount
      rankBefore={rankBefore}
      rankAfter={rankAfter}
      className={className}
    />
  ) : null;

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

/** 소식 문장 안 아이디·핵심 단어. 검정 굵게만 하고 색은 바꾸지 않는다 */
export const LineStrong: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <b className="font-extrabold">{children}</b>;

export const lineTextClassName = "text-pk-15 text-pk-ink break-keep";

/** 연승 소식 문장 "<아이디>님이 N연승 중이에요". 홈 소식 연승 줄과 진행 중 세션 지배자 카드 연승 줄이 같이 쓴다 */
export const WinStreakLineText: React.FC<{
  username: string;
  winStreak: number;
}> = ({ username, winStreak }) => (
  <span className={lineTextClassName}>
    <LineStrong>{username}</LineStrong>님이{" "}
    <LineStrong>{winStreak}연승</LineStrong> 중이에요
  </span>
);

/**
 * 회원 한 명의 소식 줄 틀: 아바타 36 + 문장, 최소 높이 60, 줄 사이 구분선.
 * 홈 소식 피드 줄과 진행 중 세션 지배자 카드의 연승 줄이 같이 쓴다
 */
export const PlayerLineButton: React.FC<{
  player: SessionPlayerReport["player"];
  onPress: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
  /** 아바타에 세션 지배자 불꽃 후광을 두른다 */
  hasFlameAura?: boolean;
  /** 세션 연승. 주면 아바타에 앰버 링과 숫자 태그를 붙인다 */
  sessionWinStreak?: number;
}> = ({
  player,
  onPress,
  children,
  right,
  hasFlameAura = false,
  sessionWinStreak,
}) => (
  <button
    type="button"
    onClick={onPress}
    className={cx(
      "flex min-h-[60px] w-full items-center gap-3 py-3 text-left not-last:border-b not-last:border-pk-divider",
      rowPressClassName,
    )}
  >
    <span className={cx("inline-flex shrink-0", hasFlameAura && "pk-flame-aura")}>
      <SessionWinStreakFrame winStreak={sessionWinStreak} showTag>
        <PlayerAvatar player={player} size={36} />
      </SessionWinStreakFrame>
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
    {right}
  </button>
);

/**
 * 세션 지배자 줄: 불꽃 후광 아바타, 칩·아이디·평점, 오른쪽 끝 평점 상승폭.
 * 보일 때마다 왕관 까딱임·칩 흰 빛·평점 상승 카운트업을 한 번 재생한다.
 * sessionWinStreak을 주면(진행 중 세션 연승) "세션 지배자" 칩 옆에 "N연승" 칩을 붙인다
 */
const TopRiserRow: React.FC<{
  report: SessionPlayerReport;
  sessionWinStreak?: number;
  className?: string;
}> = ({ report, sessionWinStreak, className }) => {
  const { isPlaying, finish } = usePlayOnShow();

  return (
    <div className={cx("flex items-center gap-3", className)}>
      <span className="pk-flame-aura shrink-0">
        <PlayerAvatar player={report.player} size={44} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span
          className="flex gap-1"
          onAnimationEnd={(event) => {
            // 칩 흰 빛이 가장 늦게 끝나는 CSS 연출이다
            if (event.animationName === "pk-sheen") finish();
          }}
        >
          <SessionDominatorBadge isPlaying={isPlaying} />
          {sessionWinStreak !== undefined ? (
            <SessionWinStreakBadge winStreak={sessionWinStreak} />
          ) : null}
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
    </div>
  );
};

/** 그 세션에서 평점이 가장 많이 오른 사람(세션 지배자). 아바타에 불꽃 후광을 두른다 */
export const TopRiserCard: React.FC<{ report: SessionPlayerReport }> = ({
  report,
}) => (
  <Card className="px-4 py-3.5">
    <TopRiserRow report={report} />
  </Card>
);

/**
 * 진행 중 세션의 세션 지배자 카드. 지배자 줄 아래 구분선을 두고 세션 연승(3 이상) 중인 다른 회원을
 * "<아이디>님이 N연승 중이에요" 줄로 잇는다. 지배자가 연승 중이면 지배자 칩 옆 "N연승" 칩으로 보이고,
 * 지배자가 없으면 연승 줄만 있다. 둘 다 없으면 그리지 않는다. 연승 줄을 누르면 그 회원 프로필
 */
export const LiveSessionHighlightCard: React.FC<{
  topRiser: SessionPlayerReport | null;
  streaks: readonly SessionWinStreak[];
}> = ({ topRiser, streaks }) => {
  const { openMemberProfile } = useAppNavigation();
  const topRiserStreak = topRiser
    ? streaks.find((entry) => entry.player.id === topRiser.player.id)
    : undefined;
  const otherStreaks = streaks.filter((entry) => entry !== topRiserStreak);
  if (!topRiser && otherStreaks.length === 0) return null;

  return (
    <Card className="px-4">
      {topRiser ? (
        <TopRiserRow
          report={topRiser}
          sessionWinStreak={topRiserStreak?.winStreak}
          className="py-3.5"
        />
      ) : null}
      {otherStreaks.length > 0 ? (
        <div className={cx("flex flex-col", topRiser && "border-t border-pk-divider")}>
          {otherStreaks.map(({ player, winStreak, matchCount, wins }) => (
            <PlayerLineButton
              key={player.id}
              player={player}
              sessionWinStreak={winStreak}
              onPress={() => openMemberProfile(player.id)}
            >
              <WinStreakLineText
                username={player.username}
                winStreak={winStreak}
              />
              <span className="text-pk-13 text-pk-sub tabular-nums">
                {matchCount}경기 {wins}승
              </span>
            </PlayerLineButton>
          ))}
        </div>
      ) : null}
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
        "flex min-h-14 w-full items-center gap-3 py-2.5 text-left not-last:border-b not-last:border-pk-divider",
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
          <SessionRankChangeCount report={report} />
        </span>
      </span>
    </button>
  );
};

/** 세션 상세 불러오는 중. 머리는 세션 카드 자리, 그 아래 섹션 제목과 목록 자리 */
export const SessionReportSkeleton: React.FC = () => (
  <div aria-hidden="true" className="flex flex-col gap-2.5">
    <SkeletonBlock className="h-[200px] w-full rounded-pk-lg" />
    <SkeletonBlock className="mt-3 h-4 w-14" />
    <SkeletonBlock className="h-56 w-full rounded-pk-lg" />
  </div>
);

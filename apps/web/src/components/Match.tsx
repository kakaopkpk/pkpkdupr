import React, { useMemo } from "react";
import { Card } from "@heroui/react";
import type {
  Match as SharedMatch,
  MatchSessionSummary,
  MatchStatus,
  MatchTopLevelType,
} from "@pkpkdupr/shared/match";
import {
  getMatchTopLevelType,
  isMultiGameMatchRecord,
  matchTopLevelTypeLabels,
} from "@pkpkdupr/shared/match";
import type {
  PlayerRatingChangeLog,
  PlayerRatingHistory,
} from "@pkpkdupr/shared/player";
import UserChip from "@/components/UserChip";
import MatchCardHeader from "@/components/MatchCardHeader";
import { formatRating, getDisplayRatingForMatchType } from "@/utils/dupr";

export type MatchInfo = Omit<
  SharedMatch,
  | "matchStartsAt"
  | "createdAt"
  | "updatedAt"
  | "completedAt"
  | "resultSubmittedAt"
  | "session"
> & {
  matchStartsAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  resultSubmittedAt: string | null;
  session?: {
    id: string;
    name?: string;
    date: string;
  };
  ratingChanges?: PlayerRatingChangeLog[];
};

export type MatchSessionSummaryInfo = Omit<
  MatchSessionSummary,
  "date" | "latestCreatedAt"
> & {
  date: string;
  latestCreatedAt: string;
};

export type MatchFeedItemInfo =
  | { kind: "match"; match: MatchInfo }
  | { kind: "session"; session: MatchSessionSummaryInfo };

export interface MatchListResponse {
  matches: MatchInfo[];
  total: number;
  /** 공식 레이팅 반영 감사 이벤트. 프로필 그래프에는 직접 표시하지 않는다. */
  ratingAdjustmentLogs?: PlayerRatingChangeLog[];
  /** API가 공식 DUPR 보정을 분배해 만든 프로필 차트 전용 이력. */
  ratingHistory?: PlayerRatingHistory;
}

export interface PlayerProfileSummaryResponse {
  matchStats: Record<
    MatchTopLevelType,
    {
      matchWins: number;
      matchLosses: number;
      setWins: number;
      setLosses: number;
    }
  >;
  ratingDelta: Record<
    MatchTopLevelType,
    { last7Days: number; last30Days: number }
  >;
  ratingHistory: PlayerRatingHistory;
  recentMatches: MatchInfo[];
}

interface MatchProps {
  match: MatchInfo;
  currentPlayerId?: string;
  onPress?: (match: MatchInfo) => void;
  headerRightContent?: React.ReactNode;
  showChevron?: boolean;
}

const titleChipClassName =
  "inline-flex h-6 items-center rounded-full px-2 text-[clamp(0.625rem,2.8vw,0.75rem)] font-semibold leading-none";
const teamChipWidthClass = "w-[clamp(6rem,32cqw,10rem)]";
const resultTeamChipWidthClass = "w-[clamp(6.6rem,35.2cqw,11rem)]";

const statusLabelMap: Record<MatchStatus, string> = {
  // 점수 없는 created 경기는 시작 2시간 뒤 서버가 지우므로 "예정"으로 남지 않는다
  created: "진행 중",
  completed: "완료",
  cancelled: "취소",
};

const statusBadgeClassMap: Record<MatchStatus, string> = {
  created: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-200 text-slate-700",
};

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
});

const formatMatchDateTime = (value: string | Date) => {
  const parts = dateTimeFormatter.formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}.${get("month")}.${get("day")}`,
    time: `${get("dayPeriod")} ${get("hour")}:${get("minute")}`,
  };
};

/**
 * 카드에 크게 보여 줄 두 팀의 결과. 단판은 점수, 점수가 여러 개인 과거 2선승 기록은 이긴 게임 수다.
 */
export const getTeamResultScores = (
  match: Pick<MatchInfo, "scores">,
): [number, number] => {
  const scores = match.scores ?? [];
  if (!isMultiGameMatchRecord(match)) {
    return [scores[0]?.scoreA ?? 0, scores[0]?.scoreB ?? 0];
  }

  return [
    scores.filter((score) => score.scoreA > score.scoreB).length,
    scores.filter((score) => score.scoreB > score.scoreA).length,
  ];
};

const getTeamAverageDupr = (
  match: MatchInfo,
  team: MatchInfo["teams"][number],
) => {
  let total = 0;

  for (const player of team.players) {
    const rating = getDisplayRatingForMatchType(match.type, player.duprRating);
    if (rating == null) return null;
    total += rating;
  }

  return team.players.length > 0 ? total / team.players.length : null;
};

const Match: React.FC<MatchProps> = ({
  match,
  currentPlayerId,
  onPress,
  headerRightContent,
  showChevron = true,
}) => {
  const hasResultScores = !!match.scores?.length;
  const teamResultScores = getTeamResultScores(match);
  const displayedTeamResultScores =
    match.status === "created" ? ([0, 0] as const) : teamResultScores;
  const shouldShowTeamResultScores = hasResultScores || match.status === "created";
  const isTeamALosing = hasResultScores && teamResultScores[0] < teamResultScores[1];
  const isTeamBLosing = hasResultScores && teamResultScores[1] < teamResultScores[0];
  const teamAverageDuprs = useMemo(
    () => match.teams.map((team) => getTeamAverageDupr(match, team)),
    [match],
  );
  const displayTitle =
    match.name ?? matchTopLevelTypeLabels[getMatchTopLevelType(match.type)];
  const { date: matchDate, time: matchTime } = formatMatchDateTime(
    match.matchStartsAt,
  );

  const card = (
    <Card
      className={`relative w-full overflow-hidden [container-type:inline-size] rounded-3xl border border-pkpk-sub-bg bg-white/95 p-3 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-5 before:bg-[linear-gradient(to_bottom,_var(--color-pkpk-secondary-bg),_transparent)] before:opacity-5 ${
        onPress
          ? "transition-colors hover:bg-pkpk-primary-bg/5 active:bg-pkpk-primary-bg/10"
          : ""
      }`}
    >
      <div className="relative z-10 min-w-0">
        <MatchCardHeader
          date={matchDate}
          time={matchTime}
          location={match.location}
          courtName={match.courtName}
          title={displayTitle}
          rightContent={headerRightContent}
          showChevron={showChevron}
          afterTime={
            <span
              className={`${titleChipClassName} ${statusBadgeClassMap[match.status]}`}
            >
              {statusLabelMap[match.status]}
            </span>
          }
        />
      </div>

      <div className="relative z-10 mt-1 w-full">
        {shouldShowTeamResultScores ? (
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
            {match.teams.map((team, index) => (
              <div
                key={team.id}
                className={`row-start-1 flex min-w-0 flex-col gap-1.5 ${
                  index === 0
                    ? "col-start-1 items-start text-left"
                    : "col-start-3 items-end text-right"
                }`}
              >
                <p
                  className={`${resultTeamChipWidthClass} text-center text-[clamp(0.625rem,2.8vw,0.75rem)] font-bold tabular-nums text-pkpk-dupr-font`}
                >
                  {formatRating(teamAverageDuprs[index])}
                </p>
                <div className="flex min-w-0 flex-col gap-1">
                  {team.players.map((teamPlayer) => (
                    <UserChip
                      key={teamPlayer.id}
                      player={teamPlayer}
                      isMe={teamPlayer.id === currentPlayerId}
                      size="match"
                      chipWidthClass={resultTeamChipWidthClass}
                      isMirrored={index === 1}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="col-start-2 row-start-1 flex items-center justify-center gap-1 text-pkpk-main-font">
              <span
                className={`text-[clamp(1.75rem,9vw,2.25rem)] font-black leading-none tracking-tight ${
                  isTeamALosing ? "text-[#888]" : ""
                }`}
              >
                {displayedTeamResultScores[0]}
              </span>
              <span className="text-[clamp(1.25rem,5vw,1.5rem)] font-bold leading-none text-[#888]">
                -
              </span>
              <span
                className={`text-[clamp(1.75rem,9vw,2.25rem)] font-black leading-none tracking-tight ${
                  isTeamBLosing ? "text-[#888]" : ""
                }`}
              >
                {displayedTeamResultScores[1]}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid w-full grid-cols-2 gap-3">
            {match.teams.map((team, index) => (
              <div
                key={team.id}
                className={`flex min-w-0 flex-col gap-1.5 ${
                  index === 0 ? "items-start text-left" : "items-end text-right"
                }`}
              >
                <p
                  className={`${teamChipWidthClass} text-center text-[clamp(0.625rem,2.8vw,0.75rem)] font-bold tabular-nums text-pkpk-dupr-font`}
                >
                  {formatRating(teamAverageDuprs[index])}
                </p>
                {team.players.map((teamPlayer) => (
                  <UserChip
                    key={teamPlayer.id}
                    player={teamPlayer}
                    isMe={teamPlayer.id === currentPlayerId}
                    size="match"
                    isMirrored={index === 1}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );

  return onPress ? (
    <button
      type="button"
      aria-label={`${displayTitle} 상세 보기`}
      onClick={() => onPress(match)}
      className="w-full text-left"
    >
      {card}
    </button>
  ) : (
    card
  );
};

export default Match;

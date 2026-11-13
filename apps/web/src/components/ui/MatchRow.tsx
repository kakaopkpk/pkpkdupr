import React from "react";
import { getTeamResultScores, type MatchInfo } from "@/types/match";
import { formatKstTime, formatKstWeekdayTime } from "@/lib/format";
import { ChevronRightIcon } from "./Icons";
import { TeamAvatars } from "./PlayerAvatar";
import { cx } from "./cx";

type MatchTeam = MatchInfo["teams"][number];

const rowDividerClassName =
  "not-last:shadow-[inset_0_-1px_0_var(--color-pk-divider)]";

const getTeamLabel = (team: MatchTeam) =>
  team.players.map((player) => player.username).join(" · ");

/** 행을 누를 수 있으면 button, 아니면 div로 그린다 */
const RowContainer: React.FC<{
  onPress?: () => void;
  className: string;
  children: React.ReactNode;
}> = ({ onPress, className, children }) =>
  onPress ? (
    <button
      type="button"
      onClick={onPress}
      className={cx(
        "w-full text-left transition-colors active:bg-pk-primary-soft/60",
        className,
      )}
    >
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
  );

const TeamLine: React.FC<{
  team: MatchTeam;
  score?: number;
  emphasis: "win" | "lose" | "none";
}> = ({ team, score, emphasis }) => (
  <div className="flex min-w-0 items-center gap-2.5">
    <TeamAvatars players={team.players} size={22} />
    <span
      className={cx(
        "min-w-0 flex-1 truncate text-pk-15",
        emphasis === "win" && "font-bold text-pk-ink",
        emphasis === "lose" && "font-medium text-pk-sub",
        emphasis === "none" && "font-medium text-pk-ink",
      )}
    >
      {getTeamLabel(team)}
    </span>
    {score !== undefined ? (
      <span
        className={cx(
          "min-w-6 text-right text-pk-17 font-extrabold tabular-nums",
          emphasis === "win" ? "text-pk-primary" : "text-pk-muted",
        )}
      >
        {score}
      </span>
    ) : null}
  </div>
);

/**
 * 경기 한 줄. 이긴 팀이 위에 오고 이긴 쪽만 굵게·블루 점수로 강조한다.
 * 줄 맨 위 메타 줄에 시간을 두고, 내 경기면 시간 뒤에 " · 내 경기" 글자만 붙는다(바탕 강조 없음).
 * 시간 열은 따로 없어 팀 줄이 줄 폭을 다 쓴다. 코트 번호는 보이지 않는다.
 */
export const MatchRow: React.FC<{
  match: MatchInfo;
  /** 이 선수가 든 경기면 메타 줄 시간 뒤에 " · 내 경기"를 붙인다 */
  currentPlayerId?: string;
  onPress?: () => void;
  /** 기본 "time"("20:01"), "weekday-time"은 "목 20:01". 기준은 matchStartsAt */
  timeLabel?: "time" | "weekday-time";
}> = ({ match, currentPlayerId, onPress, timeLabel = "time" }) => {
  const [teamA, teamB] = match.teams;
  const hasScores = (match.scores?.length ?? 0) > 0;
  const [scoreA, scoreB] = getTeamResultScores(match);
  const isMine =
    !!currentPlayerId &&
    match.teams.some((team) =>
      team.players.some((player) => player.id === currentPlayerId),
    );
  const hasWinner = hasScores && scoreA !== scoreB;
  const isTeamAWinner = !hasWinner || scoreA > scoreB;
  const lines = isTeamAWinner
    ? [
        { team: teamA, score: scoreA },
        { team: teamB, score: scoreB },
      ]
    : [
        { team: teamB, score: scoreB },
        { team: teamA, score: scoreA },
      ];
  const time =
    timeLabel === "weekday-time"
      ? formatKstWeekdayTime(match.matchStartsAt)
      : formatKstTime(match.matchStartsAt);

  return (
    <RowContainer
      onPress={onPress}
      className={cx(
        "flex min-w-0 flex-col gap-1.5 py-3 text-pk-ink",
        rowDividerClassName,
      )}
    >
      <div className="whitespace-nowrap text-pk-12 text-pk-muted tabular-nums">
        {time}
        {isMine ? (
          <span className="font-bold text-pk-sub"> · 내 경기</span>
        ) : null}
      </div>
      {lines.map(({ team, score }, index) => (
        <TeamLine
          key={team.id}
          team={team}
          score={hasScores ? score : undefined}
          emphasis={hasWinner ? (index === 0 ? "win" : "lose") : "none"}
        />
      ))}
    </RowContainer>
  );
};

/** 진행 중 경기 한 줄. 시작 후 지난 분과 꺾쇠를 보이고 코트 번호는 없다 */
export const LiveMatchRow: React.FC<{
  match: MatchInfo;
  now: Date;
  onPress?: () => void;
}> = ({ match, now, onPress }) => {
  const elapsedMinutes = Math.max(
    0,
    Math.floor(
      (now.getTime() - new Date(match.matchStartsAt).getTime()) / 60_000,
    ),
  );

  return (
    <RowContainer
      onPress={onPress}
      className={cx(
        "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-3 text-pk-ink",
        rowDividerClassName,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {match.teams.map((team) => (
          <TeamLine
            key={team.id}
            team={team}
            emphasis="none"
          />
        ))}
      </div>
      <span className="whitespace-nowrap text-pk-12 text-pk-muted tabular-nums">
        {elapsedMinutes}분째
      </span>
      <ChevronRightIcon />
    </RowContainer>
  );
};

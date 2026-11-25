import React from "react";
import { getMatchRecordedAt } from "@pkpkdupr/shared/match";
import { getTeamResultScores, type MatchInfo } from "@/types/match";
import {
  formatKstDateTime,
  formatKstTime,
  formatKstWeekdayTime,
} from "@/lib/format";
import { rowPressClassName } from "./Button";
import { TeamAvatars } from "./PlayerAvatar";
import { SpecialMatchLabel } from "./SpecialMatchLabel";
import { cx } from "./cx";

type MatchTeam = MatchInfo["teams"][number];

/** 목록 줄 사이 구분선. 마지막 줄에는 긋지 않는다 */
export const rowDividerClassName =
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
        "w-full text-left",
        rowPressClassName,
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
  ringColor?: string;
}> = ({ team, score, emphasis, ringColor }) => (
  <div className="flex min-w-0 items-center gap-2.5">
    <TeamAvatars players={team.players} size={22} ringColor={ringColor} />
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

const timeLabelFormatters = {
  time: formatKstTime,
  "weekday-time": formatKstWeekdayTime,
  "date-time": formatKstDateTime,
} satisfies Record<string, (date: Date | string) => string>;

/**
 * 경기 한 줄. 이긴 팀이 위에 오고 이긴 쪽만 굵게·블루 점수로 강조한다.
 * 줄 맨 위 메타 줄에 시간을 두고, 내 경기면 시간 뒤에 " · 내 경기" 글자만 붙는다(바탕 강조 없음).
 * 게스트가 낀 경기(ratingExcluded)는 메타 줄 끝에 " · 평점 미반영"을 붙인다.
 * 특수 매치면 메타 줄 오른쪽 끝(점수 열 위)에 유형 이름을 두고, 결과(라이벌전 승리 등)는 쓰지 않는다.
 * 한 사람의 경기 목록(resultPlayerId)이면 그 사람 팀을 위에 두고 줄 왼쪽에 승(블루)·패(빨강) 색 띠를 붙인다.
 * 코트 번호는 보이지 않는다.
 */
export const MatchRow: React.FC<{
  match: MatchInfo;
  /** 이 선수가 든 경기면 메타 줄 시간 뒤에 " · 내 경기"를 붙인다 */
  currentPlayerId?: string;
  onPress?: () => void;
  /** 기본 "time"("20:01"), "weekday-time"은 "목 20:01", "date-time"은 "11월 13일 목 20:01". 기준은 기록 시각(getMatchRecordedAt, 완료 경기는 점수 입력 시각) */
  timeLabel?: keyof typeof timeLabelFormatters;
  /** 팀 아바타 테 색. 흰 바탕이 아닌 곳에 놓을 때 바탕색을 넘긴다(기본 흰색) */
  avatarRingColor?: string;
  /**
   * 한 사람의 경기 목록에서 승패 기준이 되는 회원. 이 회원이 든 승패가 갈린 경기면 그 팀을 위 줄에 두고
   * 줄 왼쪽에 승패 색 띠를 붙인다. 점수가 없거나 승자가 없거나 이 회원이 없는 경기는 지금 모양 그대로다
   */
  resultPlayerId?: string;
}> = ({
  match,
  currentPlayerId,
  onPress,
  timeLabel = "time",
  avatarRingColor,
  resultPlayerId,
}) => {
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
  const resultTeamIndex = resultPlayerId
    ? match.teams.findIndex((team) =>
        team.players.some((player) => player.id === resultPlayerId),
      )
    : -1;
  const showResult = hasWinner && resultTeamIndex >= 0;
  const isResultWin = showResult && (resultTeamIndex === 0) === isTeamAWinner;
  // 기본은 이긴 팀이 위, 승패 띠가 붙으면 기준 회원 팀이 위
  const isTeamAFirst = showResult ? resultTeamIndex === 0 : isTeamAWinner;
  const lineA = { team: teamA, score: scoreA, isWinner: isTeamAWinner };
  const lineB = { team: teamB, score: scoreB, isWinner: !isTeamAWinner };
  const lines = isTeamAFirst ? [lineA, lineB] : [lineB, lineA];
  const time = timeLabelFormatters[timeLabel](getMatchRecordedAt(match));

  const content = (
    <>
      <div className="flex min-w-0 items-center gap-2 text-pk-12 text-pk-muted tabular-nums">
        <span className="min-w-0 truncate">
          {time}
          {isMine ? (
            <span className="font-bold text-pk-sub"> · 내 경기</span>
          ) : null}
          {match.ratingExcluded ? " · 평점 미반영" : null}
        </span>
        {match.specialMatch ? (
          <SpecialMatchLabel kind={match.specialMatch.kind} className="ml-auto" />
        ) : null}
      </div>
      {lines.map(({ team, score, isWinner }) => (
        <TeamLine
          key={team.id}
          team={team}
          score={hasScores ? score : undefined}
          emphasis={hasWinner ? (isWinner ? "win" : "lose") : "none"}
          ringColor={avatarRingColor}
        />
      ))}
    </>
  );

  if (!showResult) {
    return (
      <RowContainer
        onPress={onPress}
        className={cx(
          "flex min-w-0 flex-col gap-1.5 py-3 text-pk-ink",
          rowDividerClassName,
        )}
      >
        {content}
      </RowContainer>
    );
  }

  return (
    <RowContainer
      onPress={onPress}
      className={cx("flex min-w-0 gap-3 py-3 text-pk-ink", rowDividerClassName)}
    >
      <span
        data-match-result={isResultWin ? "win" : "lose"}
        className={cx(
          "w-1 shrink-0 self-stretch rounded-full",
          isResultWin ? "bg-pk-primary" : "bg-pk-down",
        )}
      >
        <span className="sr-only">{isResultWin ? "승" : "패"}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">{content}</div>
    </RowContainer>
  );
};

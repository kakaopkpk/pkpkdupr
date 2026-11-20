import { getWinningTeamIndex } from "@pkpkdupr/shared/match";
import {
  computeCurrentWinStreaks,
  SESSION_WIN_STREAK_DISPLAY_MIN,
} from "@pkpkdupr/shared/streak";
import type { MatchInfo } from "@/types/match";

type MatchPlayerInfo = MatchInfo["teams"][number]["players"][number];

export interface SessionWinStreak {
  player: MatchPlayerInfo;
  /** 그 세션에서 가장 최근 경기부터 이어지는 연승 */
  winStreak: number;
  /** 그 세션 평점 반영 경기 수와 승 수 */
  matchCount: number;
  wins: number;
}

const isRatedCompletedMatch = (
  match: MatchInfo,
): match is MatchInfo & { completedAt: string } =>
  match.status === "completed" && !match.ratingExcluded && !!match.completedAt;

/**
 * 한 세션 경기 목록으로 센 회원별 세션 연승(SESSION_WIN_STREAK_DISPLAY_MIN 이상만).
 * 평점 미반영 경기(게스트 참가)는 세지 않고, 연승 규칙은 프로필 연승(computeCurrentWinStreaks)과 같다.
 * 연승이 긴 순, 같으면 아이디 순이다
 */
export const getSessionWinStreaks = (
  matches: readonly MatchInfo[],
): SessionWinStreak[] => {
  const rated = matches.filter(isRatedCompletedMatch);
  const streaks = computeCurrentWinStreaks(
    rated.map((match) => ({
      id: match.id,
      completedAt: new Date(match.completedAt),
      teamPlayerIds: [
        match.teams[0].players.map((player) => player.id),
        match.teams[1].players.map((player) => player.id),
      ],
      scores: match.scores,
    })),
  );

  const records = new Map<string, SessionWinStreak>();
  for (const match of rated) {
    const winningTeamIndex = getWinningTeamIndex(match);
    match.teams.forEach((team, teamIndex) => {
      for (const player of team.players) {
        const winStreak = streaks.get(player.id) ?? 0;
        if (winStreak < SESSION_WIN_STREAK_DISPLAY_MIN) continue;
        const record = records.get(player.id) ?? {
          player,
          winStreak,
          matchCount: 0,
          wins: 0,
        };
        record.matchCount += 1;
        if (teamIndex === winningTeamIndex) record.wins += 1;
        records.set(player.id, record);
      }
    });
  }

  return [...records.values()].sort(
    (left, right) =>
      right.winStreak - left.winStreak ||
      left.player.username.localeCompare(right.player.username),
  );
};

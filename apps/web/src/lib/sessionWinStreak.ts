import { getWinningTeamIndex } from "@pkpkdupr/shared/match";
import { SESSION_WIN_STREAK_DISPLAY_MIN } from "@pkpkdupr/shared/streak";
import type { MatchInfo } from "@/types/match";

type MatchPlayerInfo = MatchInfo["teams"][number]["players"][number];

export interface SessionWinStreak {
  player: MatchPlayerInfo;
  /** 지난 세션부터 이어지는 지금 연승(랭킹 연승과 같은 누적 연승) */
  winStreak: number;
  /** 그 세션 완료 경기 수와 승 수(게스트가 낀 경기 포함) */
  matchCount: number;
  wins: number;
}

const isCompletedMatch = (
  match: MatchInfo,
): match is MatchInfo & { completedAt: string } =>
  match.status === "completed" && !!match.completedAt;

/**
 * 한 세션 경기 목록에서 완료 경기를 뛴 정회원 중 누적 연승이 SESSION_WIN_STREAK_DISPLAY_MIN 이상인 회원.
 * 연승은 세션 리포트 winStreaks(랭킹 연승 규칙으로 서버가 센 값)를 그대로 쓰고, 세션 경기 수·승 수만 경기 목록으로 센다.
 * 연승이 긴 순, 같으면 아이디 순이다
 */
export const getSessionWinStreaks = (
  matches: readonly MatchInfo[],
  winStreaks: Readonly<Record<string, number>>,
): SessionWinStreak[] => {
  const records = new Map<string, SessionWinStreak>();
  for (const match of matches.filter(isCompletedMatch)) {
    const winningTeamIndex = getWinningTeamIndex(match);
    match.teams.forEach((team, teamIndex) => {
      for (const player of team.players) {
        if (player.isGuest) continue;
        const winStreak = winStreaks[player.id] ?? 0;
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

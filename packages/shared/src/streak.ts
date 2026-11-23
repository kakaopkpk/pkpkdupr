import { compareCountedMatches } from "./achievements.js";
import { getWinningTeamIndex, type MatchScore } from "./match.js";

/** 이 연승부터 랭킹·프로필 아바타에 앰버 링과 연승 태그를 붙인다 */
export const WIN_STREAK_DISPLAY_MIN = 5;

/** 진행 중 세션에서 그 세션 경기만으로 센 연승이 이 수부터 세션 지배자 카드·경기 아바타에 강조된다 */
export const SESSION_WIN_STREAK_DISPLAY_MIN = 3;

export interface WinStreakMatch {
  id: string;
  completedAt: Date;
  teamPlayerIds: readonly [readonly string[], readonly string[]];
  scores?: readonly MatchScore[] | null;
}

/**
 * 회원별 지금 이어지는 연승 수. 완료 경기(게스트가 낀 경기 포함)를 단식·복식 구분 없이 최근 경기부터 한 번 훑으며,
 * 회원마다 처음 이기지 못한 경기에서 세기를 멈춘다. 승패가 갈리지 않은 경기는 업적 연승처럼 연승을 끊는다.
 * 경기가 없는 회원은 넣지 않는다. 게스트 본인의 연승을 보이지 않는 것은 호출부가 맡는다.
 */
export const computeCurrentWinStreaks = (
  matches: readonly WinStreakMatch[],
): Map<string, number> => {
  const streaks = new Map<string, number>();
  const stopped = new Set<string>();
  const latestFirst = [...matches].sort((left, right) =>
    compareCountedMatches(right, left),
  );
  for (const match of latestFirst) {
    const winningTeamIndex = getWinningTeamIndex(match);
    for (const [teamIndex, playerIds] of match.teamPlayerIds.entries()) {
      const won = teamIndex === winningTeamIndex;
      for (const playerId of playerIds.filter((id) => !stopped.has(id))) {
        streaks.set(playerId, (streaks.get(playerId) ?? 0) + (won ? 1 : 0));
        if (!won) stopped.add(playerId);
      }
    }
  }
  return streaks;
};

/** 한 회원의 지금 연승 수(`computeCurrentWinStreaks`와 같은 규칙) */
export const computeCurrentWinStreak = (
  matches: readonly WinStreakMatch[],
  playerId: string,
): number => computeCurrentWinStreaks(matches).get(playerId) ?? 0;

import { getWinningTeamIndex, type MatchScore } from "./match.js";

/** 이 연승부터 랭킹·프로필 아바타에 앰버 링과 연승 태그를 붙인다 */
export const WIN_STREAK_DISPLAY_MIN = 5;

export interface WinStreakMatch {
  id: string;
  completedAt: Date;
  teamPlayerIds: readonly [readonly string[], readonly string[]];
  scores?: readonly MatchScore[] | null;
  ratingExcluded?: boolean;
}

const compareLatestFirst = (left: WinStreakMatch, right: WinStreakMatch) =>
  right.completedAt.getTime() - left.completedAt.getTime() ||
  (right.id < left.id ? -1 : right.id > left.id ? 1 : 0);

/**
 * 회원별 지금 이어지는 연승 수. 평점에 반영된 완료 경기를 단식·복식 구분 없이 최근 경기부터 한 번 훑으며,
 * 회원마다 처음 이기지 못한 경기에서 세기를 멈춘다. 승패가 갈리지 않은 경기는 업적 연승처럼 연승을 끊는다.
 * 평점 반영 경기가 없는 회원은 넣지 않는다.
 */
export const computeCurrentWinStreaks = (
  matches: readonly WinStreakMatch[],
): Map<string, number> => {
  const streaks = new Map<string, number>();
  const stopped = new Set<string>();
  const latestFirst = matches
    .filter((match) => !match.ratingExcluded)
    .sort(compareLatestFirst);
  for (const match of latestFirst) {
    const winningTeamIndex = getWinningTeamIndex(match);
    match.teamPlayerIds.forEach((playerIds, teamIndex) => {
      for (const playerId of playerIds) {
        if (stopped.has(playerId)) continue;
        if (teamIndex === winningTeamIndex) {
          streaks.set(playerId, (streaks.get(playerId) ?? 0) + 1);
        } else {
          streaks.set(playerId, streaks.get(playerId) ?? 0);
          stopped.add(playerId);
        }
      }
    });
  }
  return streaks;
};

/** 한 회원의 지금 연승 수(`computeCurrentWinStreaks`와 같은 규칙) */
export const computeCurrentWinStreak = (
  matches: readonly WinStreakMatch[],
  playerId: string,
): number => computeCurrentWinStreaks(matches).get(playerId) ?? 0;

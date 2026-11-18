import { getWinningTeamIndex, type MatchScore } from "./match.js";

/** 이 연승부터 랭킹·프로필 아바타에 불꽃 후광과 연승 태그를 붙인다 */
export const WIN_STREAK_DISPLAY_MIN = 5;

export interface WinStreakMatch {
  id: string;
  completedAt: Date;
  teamPlayerIds: readonly [readonly string[], readonly string[]];
  scores?: readonly MatchScore[] | null;
  ratingExcluded?: boolean;
}

/**
 * 지금 이어지는 연승 수. 평점에 반영된 완료 경기를 단식·복식 구분 없이 완료 시각 순으로 보고,
 * 마지막 경기부터 거꾸로 이긴 경기를 센다. 승패가 갈리지 않은 경기는 업적 연승처럼 연승을 끊는다.
 */
export const computeCurrentWinStreak = (
  matches: readonly WinStreakMatch[],
  playerId: string,
): number => {
  const playerMatches = matches
    .filter((match) => !match.ratingExcluded)
    .flatMap((match) => {
      const teamIndex = match.teamPlayerIds.findIndex((ids) =>
        ids.includes(playerId),
      );
      return teamIndex === 0 || teamIndex === 1 ? [{ match, teamIndex }] : [];
    })
    .sort(
      (left, right) =>
        right.match.completedAt.getTime() - left.match.completedAt.getTime() ||
        (right.match.id < left.match.id ? -1 : right.match.id > left.match.id ? 1 : 0),
    );

  let streak = 0;
  for (const { match, teamIndex } of playerMatches) {
    if (getWinningTeamIndex(match) !== teamIndex) break;
    streak += 1;
  }
  return streak;
};

/** 여러 회원의 지금 연승 수를 한 번에 센다. 경기가 없는 회원은 넣지 않는다 */
export const computeCurrentWinStreaks = (
  matches: readonly WinStreakMatch[],
): Map<string, number> => {
  const playerIds = new Set(
    matches.flatMap((match) => [...match.teamPlayerIds[0], ...match.teamPlayerIds[1]]),
  );
  return new Map(
    [...playerIds].map((playerId) => [
      playerId,
      computeCurrentWinStreak(matches, playerId),
    ]),
  );
};

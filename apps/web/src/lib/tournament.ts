import { DUPR_DEFAULT_RATING } from "@pkpkdupr/shared/player";
import type { MatchInfo } from "@/types/match";
import { getMatchPlayerIds } from "@/types/match";
import { getDisplayRatingForMatchType } from "@/utils/dupr";

/** 대진 목록 한 묶음. round가 null이면 라운드 없는 경기 묶음("그 밖의 경기") */
export interface BracketRoundGroup {
  round: number | null;
  matches: MatchInfo[];
}

/** 만든 순서(createdAt, 같으면 id) */
const compareCreatedOrder = (a: MatchInfo, b: MatchInfo) => {
  const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

const getRoundOrNull = (match: MatchInfo): number | null => match.round ?? null;

/** 라운드 오름차순, 라운드 없는 경기는 맨 끝, 같은 라운드는 만든 순서 */
const compareBracketOrder = (a: MatchInfo, b: MatchInfo) => {
  const roundA = getRoundOrNull(a);
  const roundB = getRoundOrNull(b);
  if (roundA !== roundB) {
    if (roundA === null) return 1;
    if (roundB === null) return -1;
    return roundA - roundB;
  }
  return compareCreatedOrder(a, b);
};

/** 취소 경기를 빼고 라운드 오름차순으로 묶는다. 라운드 없는 경기는 맨 끝 null 묶음, 묶음 안은 만든 순서(createdAt, 같으면 id) */
export const groupBracketRounds = (
  matches: readonly MatchInfo[],
): BracketRoundGroup[] => {
  const groups: BracketRoundGroup[] = [];
  const sorted = matches
    .filter((match) => match.status !== "cancelled")
    .sort(compareBracketOrder);
  for (const match of sorted) {
    const round = getRoundOrNull(match);
    const last = groups[groups.length - 1];
    if (last && last.round === round) {
      last.matches.push(match);
    } else {
      groups.push({ round, matches: [match] });
    }
  }
  return groups;
};

/** 내가 선수인 예정 경기(status "scheduled") 중 가장 앞 라운드(같으면 만든 순서) 경기. 없으면 null */
export const findMyNextBracketMatch = (
  matches: readonly MatchInfo[],
  playerId: string,
): MatchInfo | null =>
  matches
    .filter(
      (match) =>
        match.status === "scheduled" &&
        getMatchPlayerIds(match).includes(playerId),
    )
    .sort(compareBracketOrder)[0] ?? null;

/** 3 → "3라운드", null → "그 밖의 경기" */
export const formatBracketRoundLabel = (round: number | null): string =>
  round === null ? "그 밖의 경기" : `${round}라운드`;

/** 경기 분류(단식·복식) 평점의 팀 평균. 평점 없는 선수(게스트 포함)는 기본 평점 3.0으로 친다 */
export const getBracketTeamAverageRating = (
  match: Pick<MatchInfo, "type" | "teams">,
  teamIndex: 0 | 1,
): number => {
  const { players } = match.teams[teamIndex];
  if (players.length === 0) return DUPR_DEFAULT_RATING;
  const total = players.reduce(
    (sum, player) =>
      sum +
      (getDisplayRatingForMatchType(match.type, player.duprRating) ??
        DUPR_DEFAULT_RATING),
    0,
  );
  return total / players.length;
};

import { getWinningTeamIndex, type Match } from "./match.js";
import { WIN_STREAK_DISPLAY_MIN } from "./streak.js";

/**
 * 특수 매치 유형. 추천 매칭 카드로 시작한 경기(도전 매치·연승 저지·최강자전)와
 * '같은 멤버로 한 판 더'로 시작한 경기(리벤지)에만 붙는다(docs/product.md "특수 매치")
 */
export type SpecialMatchKind =
  | "challenge"
  | "streak_stopper"
  | "champions"
  | "revenge";

export const specialMatchKindValues = [
  "challenge",
  "streak_stopper",
  "champions",
  "revenge",
] as const satisfies readonly SpecialMatchKind[];

/** 화면 이름 */
export const specialMatchKindLabels: Record<SpecialMatchKind, string> = {
  challenge: "도전 매치",
  streak_stopper: "연승 저지",
  champions: "최강자전",
  revenge: "리벤지 매치",
};

export const isSpecialMatchKind = (value: unknown): value is SpecialMatchKind =>
  specialMatchKindValues.includes(value as SpecialMatchKind);

export type SpecialMatchOutcome =
  | "challenge_success"
  | "defense_success"
  | "streak_stopped"
  | "streak_defended"
  | "champions_won"
  | "revenge_success"
  | "revenge_defended";

export interface SpecialMatchChallengePair {
  /** 순위가 낮은(도전하는) 선수 */
  attackerId: string;
  /** 순위가 높은(지키는) 선수 */
  defenderId: string;
}

/** 경기 시작 때 저장하는 특수 매치. 결과(outcome)는 완료 뒤 채운다 */
export interface SpecialMatch {
  kind: SpecialMatchKind;
  /**
   * 지키는 쪽 팀 index. 도전 매치 방어 쪽, 연승 저지 연승 회원 팀, 리벤지 직전 경기에서 이긴 팀.
   * 최강자전과 양쪽 다 공격인 도전 매치는 null
   */
  defendingTeamIndex: 0 | 1 | null;
  /**
   * 팀별 주인공 선수 id(카드에서 40px로 앞세우는 사람). 도전 매치는 대표 도전 쌍의 두 사람,
   * 연승 저지는 연승 회원 팀만, 최강자전은 양쪽 연승 회원, 리벤지는 둘 다 null
   */
  protagonistIds: [string | null, string | null];
  /** 도전 매치의 도전 쌍(대표 쌍이 첫 번째). 다른 유형은 빈 배열 */
  challengePairs: SpecialMatchChallengePair[];
  /** 완료 전이거나 승패가 갈리지 않으면 null */
  outcome: SpecialMatchOutcome | null;
}

/** 판정 입력 선수. rank·rating은 그 경기 종류 랭킹(복식 경기면 복식, 단식이면 단식) 기준 */
export interface SpecialMatchCandidatePlayer {
  id: string;
  isGuest: boolean;
  /** 랭킹에 없으면(게스트·평점 없음·비활성) null */
  rank: number | null;
  rating: number | null;
  /** 지금 연승 수(computeCurrentWinStreak 규칙) */
  winStreak: number;
}

/** 도전 매치로 보는 상대 두 사람의 최대 평점 차 */
export const CHALLENGE_MATCH_MAX_RATING_GAP = 0.05;

/** 추천 매칭에서 특수 유형 코트에 주는 가산점 */
export const SPECIAL_MATCH_RECOMMENDATION_BONUS = {
  streak: 2,
  challenge: 1.5,
} as const;

/** 평점 차를 소수 여섯째 자리에서 반올림해 3.55 - 3.5 같은 부동소수 오차가 판정·정렬을 흔들지 않게 한다 */
const toRatingGap = (left: number, right: number) =>
  Math.round(Math.abs(left - right) * 1e6) / 1e6;

type CandidateTeams = readonly [
  readonly SpecialMatchCandidatePlayer[],
  readonly SpecialMatchCandidatePlayer[],
];

const TEAM_INDEXES = [0, 1] as const;

/** 팀에서 연승이 가장 긴 연승 회원(WIN_STREAK_DISPLAY_MIN 이상). 같으면 먼저 나온 사람 */
const findStreakLeader = (
  team: readonly SpecialMatchCandidatePlayer[],
): SpecialMatchCandidatePlayer | null =>
  team.reduce<SpecialMatchCandidatePlayer | null>(
    (leader, player) =>
      player.winStreak >= WIN_STREAK_DISPLAY_MIN &&
      (!leader || player.winStreak > leader.winStreak)
        ? player
        : leader,
    null,
  );

const judgeStreakMatch = (teams: CandidateTeams): SpecialMatch | null => {
  const leaders = [findStreakLeader(teams[0]), findStreakLeader(teams[1])];
  if (!leaders[0] && !leaders[1]) return null;

  const protagonistIds: [string | null, string | null] = [
    leaders[0]?.id ?? null,
    leaders[1]?.id ?? null,
  ];
  if (leaders[0] && leaders[1]) {
    return {
      kind: "champions",
      defendingTeamIndex: null,
      protagonistIds,
      challengePairs: [],
      outcome: null,
    };
  }
  return {
    kind: "streak_stopper",
    defendingTeamIndex: leaders[0] ? 0 : 1,
    protagonistIds,
    challengePairs: [],
    outcome: null,
  };
};

interface RankedCandidate extends SpecialMatchCandidatePlayer {
  rank: number;
  rating: number;
  teamIndex: 0 | 1;
}

interface ChallengeCandidatePair {
  attacker: RankedCandidate;
  defender: RankedCandidate;
  gap: number;
}

const toRankedCandidates = (
  team: readonly SpecialMatchCandidatePlayer[],
  teamIndex: 0 | 1,
): RankedCandidate[] =>
  team.flatMap((player) =>
    player.rank != null && player.rating != null
      ? [{ ...player, rank: player.rank, rating: player.rating, teamIndex }]
      : [],
  );

const judgeChallengeMatch = (teams: CandidateTeams): SpecialMatch | null => {
  const [teamA, teamB] = TEAM_INDEXES.map((index) =>
    toRankedCandidates(teams[index], index),
  );
  const pairs: ChallengeCandidatePair[] = teamA.flatMap((left) =>
    teamB.flatMap((right) => {
      const gap = toRatingGap(left.rating, right.rating);
      if (gap > CHALLENGE_MATCH_MAX_RATING_GAP) return [];
      // 순위 숫자가 큰(낮은 순위) 쪽이 도전한다
      const [attacker, defender] =
        left.rank > right.rank ? [left, right] : [right, left];
      return [{ attacker, defender, gap }];
    }),
  );
  if (pairs.length === 0) return null;

  // 평점 차가 작은 쌍이 먼저, 같으면 방어자 순위가 높은 쌍이 먼저다
  pairs.sort(
    (left, right) =>
      left.gap - right.gap || left.defender.rank - right.defender.rank,
  );
  const representative = pairs[0];
  const attackingTeams = new Set(pairs.map((pair) => pair.attacker.teamIndex));
  const defendingTeamIndex: 0 | 1 | null =
    attackingTeams.size === 1
      ? representative.attacker.teamIndex === 0
        ? 1
        : 0
      : null;
  const protagonistIds: [string | null, string | null] = [null, null];
  protagonistIds[representative.attacker.teamIndex] = representative.attacker.id;
  protagonistIds[representative.defender.teamIndex] = representative.defender.id;

  return {
    kind: "challenge",
    defendingTeamIndex,
    protagonistIds,
    challengePairs: pairs.map((pair) => ({
      attackerId: pair.attacker.id,
      defenderId: pair.defender.id,
    })),
    outcome: null,
  };
};

/**
 * 추천 카드 출처 경기 판정. 해당 없으면 null. outcome은 null.
 * 게스트가 한 명이라도 끼면 평점 미반영 경기라 특수 매치가 아니다. 우선순위는 연승(최강자전·연승 저지) > 도전이다.
 */
export const judgeRecommendedSpecialMatch = (
  teams: CandidateTeams,
): SpecialMatch | null => {
  if (teams.some((team) => team.some((player) => player.isGuest))) return null;
  return judgeStreakMatch(teams) ?? judgeChallengeMatch(teams);
};

const isSamePlayerSet = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size && [...leftSet].every((id) => rightSet.has(id))
  );
};

/**
 * 한 판 더 출처 경기 판정. 리벤지가 아니면 null.
 * 두 팀 선수 집합이 원래 경기와 같고(팀 순서는 상관없음) 원래 완료 경기의 승패가 갈렸을 때만 리벤지이고,
 * 지키는 팀은 원래 경기에서 이긴 팀의 새 index다. 게스트가 있어도 된다.
 */
export const judgeRematchSpecialMatch = (
  teams: readonly [readonly string[], readonly string[]],
  previous: Pick<Match, "status" | "teams" | "scores">,
): SpecialMatch | null => {
  if (previous.status !== "completed") return null;
  const previousWinner = getWinningTeamIndex(previous);
  if (previousWinner == null) return null;

  const previousTeams = previous.teams.map((team) =>
    team.players.map((player) => player.id),
  );
  const winnerIds = previousTeams[previousWinner];
  const loserIds = previousTeams[previousWinner === 0 ? 1 : 0];
  const defendingTeamIndex = TEAM_INDEXES.find(
    (index) =>
      isSamePlayerSet(teams[index], winnerIds) &&
      isSamePlayerSet(teams[index === 0 ? 1 : 0], loserIds),
  );
  if (defendingTeamIndex === undefined) return null;

  return {
    kind: "revenge",
    defendingTeamIndex,
    protagonistIds: [null, null],
    challengePairs: [],
    outcome: null,
  };
};

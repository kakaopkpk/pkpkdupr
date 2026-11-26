import {
  CHALLENGE_MIN_RATING_GAP,
  getChallengeTeamAverageRating,
  RATING_EPSILON,
} from "./achievements.js";
import { getWinningTeamIndex, type MatchScore } from "./match.js";
import type { Player } from "./player.js";
import { toKstDateKey } from "./session.js";
import { WIN_STREAK_MIN } from "./streak.js";

export { CHALLENGE_MIN_RATING_GAP };

/**
 * 특수 매치 유형. 회원이 기록·시작한 경기(직접 기록·직접 시작·추천 카드·한 판 더)에 judgeSpecialMatch로 붙고,
 * 관리자 생성·대진 경기에는 붙지 않는다(docs/product.md "특수 매치")
 */
export type SpecialMatchKind =
  | "rival"
  | "streak_stopper"
  | "champions"
  | "revenge"
  | "challenge"
  | "men_doubles"
  | "women_doubles";

export const specialMatchKindValues = [
  "rival",
  "streak_stopper",
  "champions",
  "revenge",
  "challenge",
  "men_doubles",
  "women_doubles",
] as const satisfies readonly SpecialMatchKind[];

/** 화면 이름 */
export const specialMatchKindLabels: Record<SpecialMatchKind, string> = {
  rival: "라이벌전",
  streak_stopper: "연승 매치",
  champions: "최강자전",
  revenge: "리벤지 매치",
  challenge: "도전 매치",
  men_doubles: "남복 매치",
  women_doubles: "여복 매치",
};

/** 결과(승리·저지 등)가 정해지는 유형인지. 남복·여복 매치는 결과·큰 연출이 없다 */
export const hasSpecialMatchOutcome = (kind: SpecialMatchKind): boolean =>
  kind !== "men_doubles" && kind !== "women_doubles";

export type SpecialMatchOutcome =
  | "rival_overtaken"
  | "rival_held"
  | "streak_stopped"
  | "streak_defended"
  | "champions_won"
  | "revenge_success"
  | "revenge_defended"
  | "challenge_success"
  | "challenge_defended";

export interface SpecialMatchRivalPair {
  /** 순위가 낮은(공격하는) 선수 */
  attackerId: string;
  /** 순위가 높은(지키는) 선수 */
  defenderId: string;
}

/** 경기 시작 때 저장하는 특수 매치. 결과(outcome)는 완료 뒤 채운다 */
export interface SpecialMatch {
  kind: SpecialMatchKind;
  /**
   * 지키는 쪽 팀 index. 라이벌전 방어 쪽, 연승 매치 연승 회원 팀, 리벤지 직전 경기에서 이긴 팀, 도전 매치 평균 평점이 높은 팀.
   * 최강자전과 양쪽 다 공격인 라이벌전은 null
   */
  defendingTeamIndex: 0 | 1 | null;
  /**
   * 팀별 주인공 선수 id(카드에서 40px로 앞세우는 사람). 라이벌전은 대표 라이벌 쌍의 두 사람,
   * 연승 매치는 연승 회원 팀만, 최강자전은 양쪽 연승 회원, 리벤지·도전 매치는 둘 다 null
   */
  protagonistIds: [string | null, string | null];
  /** 라이벌전의 라이벌 쌍(대표 쌍이 첫 번째). 다른 유형은 빈 배열 */
  rivalPairs: SpecialMatchRivalPair[];
  /**
   * 도전 매치의 시작 때 두 팀 평균 평점 차(높은 팀 − 낮은 팀, 소수 여섯째 자리 반올림).
   * 다른 유형은 없다(도전 매치 전에 저장한 경기에도 없다)
   */
  ratingGap?: number;
  /** 완료 전이거나 승패가 갈리지 않으면 null */
  outcome: SpecialMatchOutcome | null;
}

export type SpecialMatchCelebrationPlayer = Pick<Player, "id" | "username" | "avatarUrl">;

/**
 * 기록 완료 화면 큰 연출 데이터. 라이벌전 승리·연승 저지·최강자전 승리·도전 성공이 그 저장으로 처음 정해졌을 때만 기록 응답에 실린다.
 * 순위는 그 경기 종류 랭킹, 연승 수는 이 경기 직전까지 센 랭킹 연승 규칙이다
 */
export type SpecialMatchCelebration =
  | {
      kind: "rival";
      /** 지키던 쪽 */
      defender: { player: SpecialMatchCelebrationPlayer; rankBefore: number; rankAfter: number };
      /** 공격 쪽 */
      attacker: { player: SpecialMatchCelebrationPlayer; rankBefore: number; rankAfter: number };
    }
  | {
      kind: "streak_stopper";
      stopped: { player: SpecialMatchCelebrationPlayer; streakBefore: number };
    }
  | {
      kind: "champions";
      winner: { player: SpecialMatchCelebrationPlayer; streakBefore: number };
      loser: { player: SpecialMatchCelebrationPlayer; streakBefore: number };
    }
  | {
      kind: "challenge";
      /** 진 높은 팀 선수(팀 순서) */
      defeated: SpecialMatchCelebrationPlayer[];
      /** 시작 때 두 팀 평균 평점 차(SpecialMatch.ratingGap) */
      ratingGap: number;
    };

/** 판정 입력 선수. rank·rating은 그 경기 종류 랭킹(복식 경기면 복식, 단식이면 단식) 기준 */
export interface SpecialMatchCandidatePlayer {
  id: string;
  isGuest: boolean;
  /** 랭킹에 없으면(게스트·평점 없음·비활성) null. 도전 매치는 정회원의 null을 DUPR_DEFAULT_RATING(3.0)으로 친다 */
  rank: number | null;
  rating: number | null;
  /** 지금 연승 수(computeCurrentWinStreak 규칙) */
  winStreak: number;
  /** 성별. 성별 없는 게스트는 null */
  gender: Player["gender"];
}

/** 라이벌전으로 보는 상대 두 사람의 최대 평점 차 */
export const RIVAL_MATCH_MAX_RATING_GAP = 0.02;

/** 라이벌전으로 보는 두 팀 평균 평점의 최대 차 */
export const RIVAL_MATCH_MAX_TEAM_AVERAGE_GAP = 0.1;

/**
 * 추천 매칭에서 특수 유형 코트에 주는 가산점.
 * 연승 매치는 뛸 사람을 고른 뒤 대진을 탐색하므로 연승자가 뽑히면 모든 후보 대진에 생겨 후보를 가르지 못하고,
 * 대진 감점은 코트 최대 가산점 하나만 빼서 최강자전·라이벌전 가산점을 가리기 때문에 0이다.
 * 리벤지는 가산점으로 만들지 않고(가산점은 리벤지를 뺀 judgeRecommendedSpecialMatch로 판정), 도전 매치는 대진 균형(팀 평균 차 감점)을 거스르지 않게 0이다.
 * 남복·여복 매치는 코트마다 더하는 성별 가산점(matchmaking MATCHMAKING_SAME_GENDER_COURT_BONUS)으로 따로 주어 0이다.
 */
export const SPECIAL_MATCH_RECOMMENDATION_BONUS = {
  rival: 1.5,
  streak_stopper: 0,
  champions: 2,
  revenge: 0,
  challenge: 0,
  men_doubles: 0,
  women_doubles: 0,
} as const satisfies Record<SpecialMatchKind, number>;

/** 평점 차를 소수 여섯째 자리에서 반올림해 3.55 - 3.5 같은 부동소수 오차가 판정·정렬을 흔들지 않게 한다 */
const toRatingGap = (left: number, right: number) =>
  Math.round(Math.abs(left - right) * 1e6) / 1e6;

type CandidateTeams = readonly [
  readonly SpecialMatchCandidatePlayer[],
  readonly SpecialMatchCandidatePlayer[],
];

const TEAM_INDEXES = [0, 1] as const;

/**
 * 팀에서 연승이 가장 긴 연승 회원(WIN_STREAK_MIN 이상). 같으면 먼저 나온 사람.
 * 랭킹 연승은 정회원에게만 보이는 값이라 게스트는 winStreak과 상관없이 연승 회원이 아니다.
 */
const findStreakLeader = (
  team: readonly SpecialMatchCandidatePlayer[],
): SpecialMatchCandidatePlayer | null =>
  team.reduce<SpecialMatchCandidatePlayer | null>(
    (leader, player) =>
      !player.isGuest &&
      player.winStreak >= WIN_STREAK_MIN &&
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
      rivalPairs: [],
      outcome: null,
    };
  }
  return {
    kind: "streak_stopper",
    defendingTeamIndex: leaders[0] ? 0 : 1,
    protagonistIds,
    rivalPairs: [],
    outcome: null,
  };
};

interface RankedCandidate extends SpecialMatchCandidatePlayer {
  rank: number;
  rating: number;
  teamIndex: 0 | 1;
}

interface RivalCandidatePair {
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

/** 선수 평점 평균. 평점 없는 선수가 있으면 null */
const toTeamAverageRating = (
  team: readonly SpecialMatchCandidatePlayer[],
): number | null => {
  if (team.length === 0 || team.some((player) => player.rating == null)) return null;
  return team.reduce((sum, player) => sum + (player.rating ?? 0), 0) / team.length;
};

const judgeRivalMatch = (teams: CandidateTeams): SpecialMatch | null => {
  // 팀 평균을 알 수 없거나(평점 없는 선수) 차이가 크면 개인 평점이 비슷해도 라이벌전이 아니다
  const [averageA, averageB] = TEAM_INDEXES.map((index) => toTeamAverageRating(teams[index]));
  if (
    averageA == null ||
    averageB == null ||
    toRatingGap(averageA, averageB) > RIVAL_MATCH_MAX_TEAM_AVERAGE_GAP
  ) {
    return null;
  }
  const [teamA, teamB] = TEAM_INDEXES.map((index) =>
    toRankedCandidates(teams[index], index),
  );
  const pairs: RivalCandidatePair[] = teamA.flatMap((left) =>
    teamB.flatMap((right) => {
      const gap = toRatingGap(left.rating, right.rating);
      if (gap > RIVAL_MATCH_MAX_RATING_GAP) return [];
      // 순위 숫자가 큰(낮은 순위) 쪽이 공격이다
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
    kind: "rival",
    defendingTeamIndex,
    protagonistIds,
    rivalPairs: pairs.map((pair) => ({
      attackerId: pair.attacker.id,
      defenderId: pair.defender.id,
    })),
    outcome: null,
  };
};

/**
 * 도전 매치: 두 팀 평균 평점 차가 CHALLENGE_MIN_RATING_GAP 이상이다. 높은 팀이 지키는 쪽이고 주인공은 없다.
 * 게스트가 낀 경기는 평점에 반영하지 않아 업적·칭찬 "도전자"와 기준이 어긋나므로 도전 매치가 아니다
 */
export const judgeChallengeMatch = (teams: CandidateTeams): SpecialMatch | null => {
  if (teams.some((team) => team.length === 0 || team.some((player) => player.isGuest))) {
    return null;
  }
  // 평점 없는 정회원은 업적·칭찬 "도전자"와 같이 3.0으로 친다
  const [ratingA, ratingB] = TEAM_INDEXES.map((index) =>
    getChallengeTeamAverageRating(teams[index].map((player) => player.rating)),
  );
  const gap = toRatingGap(ratingA, ratingB);
  if (gap < CHALLENGE_MIN_RATING_GAP - RATING_EPSILON) return null;
  return {
    kind: "challenge",
    defendingTeamIndex: ratingA > ratingB ? 0 : 1,
    protagonistIds: [null, null],
    rivalPairs: [],
    ratingGap: gap,
    outcome: null,
  };
};

/** 네 명(복식) 성별이 모두 같은 코트의 성별. 성별 없는 선수가 있거나 섞이면 null */
export const getSameGenderCourtGender = (
  genders: readonly (Player["gender"] | undefined)[],
): Player["gender"] => {
  const [first] = genders;
  if (first !== "M" && first !== "F") return null;
  return genders.every((gender) => gender === first) ? first : null;
};

/** 복식 네 명이 모두 남자면 남복 매치, 모두 여자면 여복 매치. 성별 없는 게스트가 끼면 아니다 */
const judgeSameGenderMatch = (teams: CandidateTeams): SpecialMatch | null => {
  if (teams.some((team) => team.length !== 2)) return null;
  const gender = getSameGenderCourtGender(
    teams.flatMap((team) => team.map((player) => player.gender)),
  );
  if (!gender) return null;
  return {
    kind: gender === "M" ? "men_doubles" : "women_doubles",
    defendingTeamIndex: null,
    protagonistIds: [null, null],
    rivalPairs: [],
    outcome: null,
  };
};

/**
 * 리벤지를 뺀 팀 구성만의 판정. 해당 없으면 null. outcome은 null. 추천 가산점 계산에도 쓴다.
 * 우선순위는 연승(최강자전·연승 매치) > 라이벌전 > 도전 매치 > 남복·여복 매치다.
 * 라이벌전 팀 평균 조건(차 ≤ 0.1)과 도전 매치(차 ≥ 0.1)가 0.1에서 겹치면 라이벌전이다.
 * 게스트가 낀 코트도 정회원 연승 회원이 있으면 연승 매치·최강자전이고, 게스트는 연승 주인공이 되지 않는다.
 * 라이벌전은 평점 반영 뒤 순위 역전으로 결과가 정해지는데 게스트가 낀 경기는 평점에 반영하지 않으므로,
 * 게스트가 한 명이라도 있으면 같은 코트 정회원끼리도 라이벌전이 아니다.
 */
export const judgeRecommendedSpecialMatch = (
  teams: CandidateTeams,
): SpecialMatch | null => {
  const streakMatch = judgeStreakMatch(teams);
  if (streakMatch) return streakMatch;
  const hasGuest = teams.some((team) => team.some((player) => player.isGuest));
  const rivalMatch = hasGuest ? null : judgeRivalMatch(teams);
  if (rivalMatch) return rivalMatch;
  return judgeChallengeMatch(teams) ?? judgeSameGenderMatch(teams);
};

/** 리벤지 판정에 쓰는 같은 세션(세션 없으면 같은 KST 날) 완료 경기 */
export interface SpecialMatchHistoryMatch {
  teamPlayerIds: readonly [readonly string[], readonly string[]];
  winningTeamIndex: 0 | 1 | null;
}

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

/** 리벤지 판정에 볼 완료 경기 범위. 새 경기가 들어갈 세션, 세션이 없으면 그 KST 날의 세션 없는 경기다. empty는 볼 경기가 없음 */
export type RevengeHistoryScope =
  | { kind: "session"; sessionId: string }
  | { kind: "day"; dateKey: string }
  | { kind: "empty" };

/** 완료 경기 요약에서 리벤지 범위의 경기를 완료 시각 오름차순 SpecialMatchHistoryMatch로 고른다 */
export const selectRevengeHistory = (
  matches: readonly {
    sessionId: string | null;
    completedAt: Date;
    teamPlayerIds: readonly [readonly string[], readonly string[]];
    scores?: readonly MatchScore[] | null;
  }[],
  scope: RevengeHistoryScope,
): SpecialMatchHistoryMatch[] =>
  scope.kind === "empty"
    ? []
    : matches
        .filter((match) =>
          scope.kind === "session"
            ? match.sessionId === scope.sessionId
            : match.sessionId == null &&
              toKstDateKey(match.completedAt) === scope.dateKey,
        )
        .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
        .map((match) => ({
          teamPlayerIds: match.teamPlayerIds,
          winningTeamIndex: getWinningTeamIndex(match),
        }));

/**
 * 리벤지 판정. 같은 두 팀(팀 순서·팀 안 순서 무관)이 이미 붙었으면 리벤지이고, 사이에 다른 경기가 있어도 된다.
 * 리벤지·방어는 그 대진의 가장 최근 경기에서 진 팀·이긴 팀이며, 지키는 팀은 그 경기에서 이긴 팀의 새 index다.
 * history는 완료 시각 오름차순이다. 게스트가 있어도 된다.
 */
export const judgeRevengeMatch = (
  teamPlayerIds: readonly [readonly string[], readonly string[]],
  history: readonly SpecialMatchHistoryMatch[],
): SpecialMatch | null => {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const previous = history[index];
    const sameOrder =
      isSamePlayerSet(teamPlayerIds[0], previous.teamPlayerIds[0]) &&
      isSamePlayerSet(teamPlayerIds[1], previous.teamPlayerIds[1]);
    const swapped =
      isSamePlayerSet(teamPlayerIds[0], previous.teamPlayerIds[1]) &&
      isSamePlayerSet(teamPlayerIds[1], previous.teamPlayerIds[0]);
    if (!sameOrder && !swapped) continue;
    // 가장 최근 같은 대진이 리벤지·방어를 정하므로 승패가 없으면 더 앞 경기를 보지 않는다
    if (previous.winningTeamIndex == null) return null;
    const defendingTeamIndex = sameOrder
      ? previous.winningTeamIndex
      : ((1 - previous.winningTeamIndex) as 0 | 1);
    return {
      kind: "revenge",
      defendingTeamIndex,
      protagonistIds: [null, null],
      rivalPairs: [],
      outcome: null,
    };
  }
  return null;
};

/**
 * 회원이 기록·시작하는 경기와 추천 카드의 특수 매치 판정. 해당 없으면 null. outcome은 null.
 * 우선순위는 리벤지 > 연승(최강자전·연승 매치) > 라이벌전 > 도전 매치 > 남복·여복 매치다.
 * history는 리벤지 판정용 같은 세션(세션 없으면 같은 KST 날) 완료 경기, 완료 시각 오름차순이다.
 */
export const judgeSpecialMatch = (
  teams: CandidateTeams,
  history: readonly SpecialMatchHistoryMatch[],
): SpecialMatch | null =>
  judgeRevengeMatch(
    [teams[0].map((player) => player.id), teams[1].map((player) => player.id)],
    history,
  ) ?? judgeRecommendedSpecialMatch(teams);

/**
 * GET /api/special-match-preview 응답. 기록 시트에서 선수를 다 고른 팀 구성을 저장 없이 판정한 결과(outcome null)다.
 * 저장할 때 서버가 다시 판정하므로 저장된 유형과 다를 수 있다
 */
export interface SpecialMatchPreviewResponse {
  specialMatch: SpecialMatch | null;
}

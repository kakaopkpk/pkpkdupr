import {
  judgeRecommendedSpecialMatch,
  SPECIAL_MATCH_RECOMMENDATION_BONUS,
  type SpecialMatch,
  type SpecialMatchCandidatePlayer,
  type SpecialMatchKind,
} from "./specialMatch.js";

export const MATCHMAKING_DEFAULT_COURTS = 3;
export const MATCHMAKING_MIN_COURTS = 1;
export const MATCHMAKING_MAX_COURTS = 4;
export const MATCHMAKING_PLAYERS_PER_COURT = 4;
/** 선발 정렬 키에 더하는 난수의 상한. [0, 이 값) 연속 균등분포 */
export const MATCHMAKING_SELECTION_JITTER = 2;
export const MATCHMAKING_PENALTY_WEIGHTS = {
  /** 두 팀 평균 평점 차 1.0당 */
  teamAverageGap: 30,
  /** 오늘 같은 팀이었던 두 사람이 다시 한 팀, 1회당 */
  repeatedPartner: 6,
  /** 오늘 맞붙었던 두 사람이 다시 맞붙음, 그 쌍의 맞대결 1회당 */
  repeatedOpponent: 3,
  /** 한 코트 최고·최저 평점 차 1.0당 */
  courtRatingSpread: 5,
} as const;
export const MATCHMAKING_RANDOM_STARTS = 40;
/** 최저 감점 + 이 값 이하 대진을 후보로 모은다 */
export const MATCHMAKING_CANDIDATE_PENALTY_MARGIN = 5;
/** 여유폭 안 후보가 이보다 적으면 감점순으로 이만큼까지 채운다 */
export const MATCHMAKING_MIN_CANDIDATES = 5;
/** 참여자 전원이 NR일 때 쓰는 복식 평점 */
export const MATCHMAKING_ALL_NR_FALLBACK_RATING = 3.5;

export interface MatchmakingParticipant {
  id: string;
  /** 복식 평점. NR이면 null */
  doublesRating: number | null;
}

/** 오늘 이 세션에서 완료된 경기의 팀 구성(선수 id) */
export interface MatchmakingPlayedMatch {
  teams: [string[], string[]];
}

export interface RecommendDoublesMatchesInput {
  /** 세션 참여자 전원. NR 대체 중앙값의 기준이다 */
  participants: MatchmakingParticipant[];
  /** 진행 중 경기에 들어가 있어 이번 추천에서 빠지는 선수 id */
  busyPlayerIds: readonly string[];
  /** 오늘 이 세션의 완료 경기. 경기 수·같은 팀·맞대결 집계 기준 */
  completedMatches: MatchmakingPlayedMatch[];
  /** 요청 코트 수. 정수로 내리고 1~4로 자른다 */
  courts: number;
  /** 선발 동점 깨기·탐색 출발점용 난수 seed. 같은 입력·같은 seed면 같은 결과 */
  seed: number;
  /** 감점순 후보 중 몇 번째(0부터)를 고를지. 후보 수로 나눈 나머지로 순환한다 */
  rank: number;
  /**
   * 특수 유형 판정 입력 선수(복식 랭킹 기준). 주면 대진마다 특수 유형 코트 하나의 가산점을 총 감점에서 뺀다.
   * 없으면 가산점이 없고 모든 코트의 specialMatch가 null이다
   */
  specialPlayers?: ReadonlyMap<string, SpecialMatchCandidatePlayer>;
}

export interface RecommendedCourtPlan {
  teams: [[string, string], [string, string]];
  /** NR 대체값을 반영한 팀 평균 평점 */
  teamAverages: [number, number];
  repeatedPartnerPairs: Array<[string, string]>;
  repeatedOpponentPairs: Array<[string, string]>;
  /** 이 대진에서 가산점을 받은 특수 유형 코트면 판정 결과(outcome null), 아니면 null. 한 대진에 최대 한 코트다 */
  specialMatch: SpecialMatch | null;
}

export interface DoublesRecommendationPlan {
  courts: RecommendedCourtPlan[];
  /** 추천 대상 중 이번에 선발되지 않은 선수 id */
  restingPlayerIds: string[];
  /** 고른 대진의 총 감점(특수 유형 가산점을 뺀 값이라 음수일 수 있다) */
  penalty: number;
  /** 고른 대진의 후보 순번(0부터, 후보 수 미만) */
  rank: number;
  /** 감점순 후보 수. 대진을 만들 수 없으면 0 */
  candidateCount: number;
}

/** 추천 API 응답의 선수 */
export interface RecommendationPlayer {
  id: string;
  username: string;
  avatarUrl?: string;
  /** 복식 평점. NR이면 null */
  doublesRating: number | null;
  /** 복식 랭킹 순위. 랭킹에 없으면(게스트·NR·비활성) null */
  doublesRank: number | null;
  /** 지금 연승 수(랭킹 winStreak과 같은 규칙) */
  winStreak: number;
}

export interface RecommendedTeam {
  players: [RecommendationPlayer, RecommendationPlayer];
  /** 표시용 팀 평균 평점. NR(게스트 포함)은 기본 평점 3.0으로 치며, 팀 나누기의 NR 대체값과 다르다 */
  averageRating: number;
}

export interface RecommendedCourt {
  teams: [RecommendedTeam, RecommendedTeam];
  repeatedPartnerPairs: Array<[string, string]>;
  repeatedOpponentPairs: Array<[string, string]>;
  /** 특수 유형 코트면 판정 결과(outcome null), 아니면 null. 한 추천에 최대 한 코트다 */
  specialMatch: SpecialMatch | null;
}

/** GET /api/match-sessions/:sessionId/recommendations?courts=N&rank=R 응답 */
export interface MatchSessionRecommendationResponse {
  sessionId: string;
  /** 1~4로 자른 요청 코트 수 */
  requestedCourts: number;
  /** 보여 주는 대진의 감점순 순번(0부터). 요청 rank를 후보 수로 나눈 나머지다 */
  rank: number;
  /** 감점순 후보 수. 대진이 없으면 0 */
  candidateCount: number;
  courts: RecommendedCourt[];
  restingPlayers: RecommendationPlayer[];
}

/** 부동소수 합산 오차로 후보 경계·개선 판정이 흔들리지 않게 하는 허용치 */
const PENALTY_EPSILON = 1e-9;

/** mulberry32: [0, 1) 균등 난수를 내는 결정적 생성기 */
const createRandom = (seed: number): (() => number) => {
  let state = Math.trunc(Number.isFinite(seed) ? seed : 0) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * 추천 탐색 seed. 세션과 오늘 완료 경기 수로 정해 같은 상황이면 누구에게나 같은 추천이 보이고,
 * 경기가 끝날 때마다 바뀌어 선발 동점 깨기가 한 사람에게 계속 유리하지 않다(FNV-1a 32비트).
 */
export const getMatchmakingSeed = (
  sessionId: string,
  completedMatchCount: number,
): number => {
  let hash = 0x811c9dc5;
  for (const char of `${sessionId}:${completedMatchCount}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** 0 이상 정수로 내린다. 유한한 수가 아니면 0 */
const normalizeRank = (rank: number): number =>
  Number.isFinite(rank) ? Math.max(0, Math.floor(rank)) : 0;

/** 정수로 내리고 1~4로 자른다. NaN만 기본값이고 ±Infinity는 상·하한으로 잘린다 */
export const clampMatchmakingCourts = (courts: number): number => {
  if (Number.isNaN(courts)) {
    return MATCHMAKING_DEFAULT_COURTS;
  }
  return Math.min(
    MATCHMAKING_MAX_COURTS,
    Math.max(MATCHMAKING_MIN_COURTS, Math.floor(courts)),
  );
};

const pairKey = (a: string, b: string): string =>
  a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;

const increment = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

interface TodayHistory {
  gamesPlayed: Map<string, number>;
  partnerCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
}

const collectTodayHistory = (
  matches: MatchmakingPlayedMatch[],
): TodayHistory => {
  const gamesPlayed = new Map<string, number>();
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();

  for (const match of matches) {
    const [teamA, teamB] = match.teams.map((team) => [...new Set(team)]);
    for (const id of new Set([...teamA, ...teamB])) {
      increment(gamesPlayed, id);
    }
    for (const team of [teamA, teamB]) {
      for (let i = 0; i < team.length; i += 1) {
        for (let j = i + 1; j < team.length; j += 1) {
          increment(partnerCounts, pairKey(team[i], team[j]));
        }
      }
    }
    for (const a of teamA) {
      for (const b of teamB) {
        if (a !== b) {
          increment(opponentCounts, pairKey(a, b));
        }
      }
    }
  }

  return { gamesPlayed, partnerCounts, opponentCounts };
};

/** NR 대체값: 참여자 전체 non-null 평점의 중앙값, 전원 NR이면 고정값 */
const resolveNrRating = (participants: MatchmakingParticipant[]): number => {
  const ratings = participants
    .map((participant) => participant.doublesRating)
    .filter((rating): rating is number => rating !== null)
    .sort((a, b) => a - b);
  if (ratings.length === 0) {
    return MATCHMAKING_ALL_NR_FALLBACK_RATING;
  }
  const middle = Math.floor(ratings.length / 2);
  return ratings.length % 2 === 1
    ? ratings[middle]
    : (ratings[middle - 1] + ratings[middle]) / 2;
};

const shuffle = <T>(items: T[], random: () => number): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * 배치는 길이 `코트 수 × 4`의 id 배열이다.
 * 코트 k는 [4k, 4k+4) 구간이고 앞 두 자리가 한 팀, 뒤 두 자리가 상대 팀이다.
 */
type Arrangement = string[];

const courtSlice = (
  arrangement: Arrangement,
  court: number,
): [string, string, string, string] => {
  const start = court * MATCHMAKING_PLAYERS_PER_COURT;
  return [
    arrangement[start],
    arrangement[start + 1],
    arrangement[start + 2],
    arrangement[start + 3],
  ];
};

/** 팀 순서·팀 안 순서를 무시한 코트 식별 키 */
const courtKey = (arrangement: Arrangement, court: number): string => {
  const [a1, a2, b1, b2] = courtSlice(arrangement, court);
  return [[a1, a2].sort().join("+"), [b1, b2].sort().join("+")]
    .sort()
    .join(" vs ");
};

/** 코트 순서·팀 순서·팀 안 순서를 무시한 대진 식별 키 */
const canonicalKey = (arrangement: Arrangement, courtCount: number): string => {
  const courts: string[] = [];
  for (let court = 0; court < courtCount; court += 1) {
    courts.push(courtKey(arrangement, court));
  }
  return courts.sort().join(" | ");
};

/** 추천 매칭에서 특수 유형 코트가 받는 가산점. 리벤지는 추천에서 만들지 않아 0이다 */
export const getSpecialMatchRecommendationBonus = (
  kind: SpecialMatchKind,
): number => {
  switch (kind) {
    case "streak_stopper":
    case "champions":
      return SPECIAL_MATCH_RECOMMENDATION_BONUS.streak;
    case "challenge":
      return SPECIAL_MATCH_RECOMMENDATION_BONUS.challenge;
    case "revenge":
      return 0;
  }
};

export const recommendDoublesMatches = (
  input: RecommendDoublesMatchesInput,
): DoublesRecommendationPlan => {
  const random = createRandom(input.seed);
  const busy = new Set(input.busyPlayerIds);
  const seen = new Set<string>();
  // 같은 id가 여러 번 들어와도 NR 중앙값·추천 대상 모두 한 번만 센다
  const participants = input.participants.filter((participant) => {
    if (seen.has(participant.id)) {
      return false;
    }
    seen.add(participant.id);
    return true;
  });
  const eligible = participants.filter(
    (participant) => !busy.has(participant.id),
  );

  const courtCount = Math.min(
    clampMatchmakingCourts(input.courts),
    Math.floor(eligible.length / MATCHMAKING_PLAYERS_PER_COURT),
  );
  if (courtCount === 0) {
    return {
      courts: [],
      restingPlayerIds: eligible.map((participant) => participant.id),
      penalty: 0,
      rank: 0,
      candidateCount: 0,
    };
  }

  const history = collectTodayHistory(input.completedMatches);
  const nrRating = resolveNrRating(participants);
  const ratingById = new Map(
    eligible.map((participant) => [
      participant.id,
      participant.doublesRating ?? nrRating,
    ]),
  );
  const ratingOf = (id: string): number => ratingById.get(id) ?? nrRating;
  const partnerCount = (a: string, b: string): number =>
    history.partnerCounts.get(pairKey(a, b)) ?? 0;
  const opponentCount = (a: string, b: string): number =>
    history.opponentCounts.get(pairKey(a, b)) ?? 0;

  // 선발: 오늘 경기 수 + [0, JITTER) 난수 오름차순
  const selectionOrder = eligible
    .map((participant) => ({
      id: participant.id,
      key:
        (history.gamesPlayed.get(participant.id) ?? 0) +
        random() * MATCHMAKING_SELECTION_JITTER,
    }))
    .sort((a, b) => a.key - b.key);
  const selectedCount = courtCount * MATCHMAKING_PLAYERS_PER_COURT;
  const selectedIds = new Set(
    selectionOrder.slice(0, selectedCount).map((entry) => entry.id),
  );
  const selected = eligible
    .filter((participant) => selectedIds.has(participant.id))
    .map((participant) => participant.id);
  const restingPlayerIds = eligible
    .filter((participant) => !selectedIds.has(participant.id))
    .map((participant) => participant.id);

  const weights = MATCHMAKING_PENALTY_WEIGHTS;
  const courtPenalty = (arrangement: Arrangement, court: number): number => {
    const [a1, a2, b1, b2] = courtSlice(arrangement, court);
    const ratings = [a1, a2, b1, b2].map(ratingOf);
    const averageA = (ratings[0] + ratings[1]) / 2;
    const averageB = (ratings[2] + ratings[3]) / 2;
    const repeatedPartners = partnerCount(a1, a2) + partnerCount(b1, b2);
    const repeatedOpponents =
      opponentCount(a1, b1) +
      opponentCount(a1, b2) +
      opponentCount(a2, b1) +
      opponentCount(a2, b2);
    return (
      Math.abs(averageA - averageB) * weights.teamAverageGap +
      repeatedPartners * weights.repeatedPartner +
      repeatedOpponents * weights.repeatedOpponent +
      (Math.max(...ratings) - Math.min(...ratings)) * weights.courtRatingSpread
    );
  };
  // 특수 유형 판정. 판정 입력에 없는 선수가 있으면 그 코트는 특수 유형이 아니다
  const specialPlayers = input.specialPlayers;
  const judgeCourt = (
    arrangement: Arrangement,
    court: number,
  ): SpecialMatch | null => {
    if (!specialPlayers) {
      return null;
    }
    const players = courtSlice(arrangement, court).map((id) =>
      specialPlayers.get(id),
    );
    const [a1, a2, b1, b2] = players;
    if (!a1 || !a2 || !b1 || !b2) {
      return null;
    }
    return judgeRecommendedSpecialMatch([
      [a1, a2],
      [b1, b2],
    ]);
  };
  // 유형은 팀 순서와 상관없으므로 코트 키로 가산점을 캐시한다
  const bonusByCourtKey = new Map<string, number>();
  const courtBonus = (arrangement: Arrangement, court: number): number => {
    if (!specialPlayers) {
      return 0;
    }
    const key = courtKey(arrangement, court);
    const cached = bonusByCourtKey.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const special = judgeCourt(arrangement, court);
    const bonus = special ? getSpecialMatchRecommendationBonus(special.kind) : 0;
    bonusByCourtKey.set(key, bonus);
    return bonus;
  };
  /** 대진 전체에서 가산점이 가장 큰 코트 하나만 뺀다 */
  const maxBonus = (bonuses: readonly number[]): number =>
    Math.max(0, ...bonuses);

  const courtOf = (slot: number): number =>
    Math.floor(slot / MATCHMAKING_PLAYERS_PER_COURT);
  const teamOf = (slot: number): number => Math.floor(slot / 2);

  // 평가한 배치를 대진 키로 모아 두고 마지막에 감점순으로 줄 세운다.
  // 대진이 같으면 감점도 같으므로 키마다 처음 본 배치 하나만 둔다.
  // (지금까지의 최저 + 여유폭)을 넘고 이미 모은 대진 중 MIN_CANDIDATES개보다 나쁘면 최종 후보가 될 수 없어 건너뛴다.
  const candidates = new Map<
    string,
    { arrangement: Arrangement; penalty: number }
  >();
  let bestPenalty = Number.POSITIVE_INFINITY;
  const isWithinMargin = (penalty: number): boolean =>
    penalty <=
    bestPenalty + MATCHMAKING_CANDIDATE_PENALTY_MARGIN + PENALTY_EPSILON;
  /** 모은 대진의 감점 중 작은 것부터 최대 MIN_CANDIDATES개(오름차순) */
  const lowestPenalties: number[] = [];
  const record = (arrangement: Arrangement, penalty: number): void => {
    bestPenalty = Math.min(bestPenalty, penalty);
    if (
      !isWithinMargin(penalty) &&
      lowestPenalties.length === MATCHMAKING_MIN_CANDIDATES &&
      penalty > lowestPenalties[lowestPenalties.length - 1] + PENALTY_EPSILON
    ) {
      return;
    }
    const key = canonicalKey(arrangement, courtCount);
    if (candidates.has(key)) {
      return;
    }
    candidates.set(key, { arrangement: [...arrangement], penalty });
    lowestPenalties.push(penalty);
    lowestPenalties.sort((a, b) => a - b);
    if (lowestPenalties.length > MATCHMAKING_MIN_CANDIDATES) {
      lowestPenalties.pop();
    }
  };

  for (let start = 0; start < MATCHMAKING_RANDOM_STARTS; start += 1) {
    const arrangement = shuffle(selected, random);
    const perCourt = Array.from({ length: courtCount }, (_, court) =>
      courtPenalty(arrangement, court),
    );
    const perBonus = Array.from({ length: courtCount }, (_, court) =>
      courtBonus(arrangement, court),
    );
    let penaltySum = perCourt.reduce((sum, value) => sum + value, 0);
    let total = penaltySum - maxBonus(perBonus);
    record(arrangement, total);

    // 두 자리 교환 국소 탐색(최선 개선). 같은 팀 안 교환은 같은 대진이라 건너뛴다
    let improved = true;
    while (improved) {
      improved = false;
      let bestSwap: { i: number; j: number; total: number } | null = null;
      for (let i = 0; i < selectedCount; i += 1) {
        for (let j = i + 1; j < selectedCount; j += 1) {
          if (teamOf(i) === teamOf(j)) {
            continue;
          }
          const courtI = courtOf(i);
          const courtJ = courtOf(j);
          [arrangement[i], arrangement[j]] = [arrangement[j], arrangement[i]];
          let swappedPenaltySum = penaltySum - perCourt[courtI];
          swappedPenaltySum += courtPenalty(arrangement, courtI);
          if (courtJ !== courtI) {
            swappedPenaltySum +=
              courtPenalty(arrangement, courtJ) - perCourt[courtJ];
          }
          const swappedBonuses = [...perBonus];
          swappedBonuses[courtI] = courtBonus(arrangement, courtI);
          swappedBonuses[courtJ] = courtBonus(arrangement, courtJ);
          const swappedTotal = swappedPenaltySum - maxBonus(swappedBonuses);
          record(arrangement, swappedTotal);
          [arrangement[i], arrangement[j]] = [arrangement[j], arrangement[i]];
          if (
            swappedTotal < total - PENALTY_EPSILON &&
            (bestSwap === null || swappedTotal < bestSwap.total)
          ) {
            bestSwap = { i, j, total: swappedTotal };
          }
        }
      }
      if (bestSwap) {
        const { i, j } = bestSwap;
        [arrangement[i], arrangement[j]] = [arrangement[j], arrangement[i]];
        for (const court of [courtOf(i), courtOf(j)]) {
          perCourt[court] = courtPenalty(arrangement, court);
          perBonus[court] = courtBonus(arrangement, court);
        }
        penaltySum = perCourt.reduce((sum, value) => sum + value, 0);
        total = penaltySum - maxBonus(perBonus);
        improved = true;
      }
    }
  }

  // 감점 오름차순, 감점이 같으면 대진 키 순. 최저 + 여유폭 이내 전부를 후보로 하되 최소 개수는 채운다
  const ranked = [...candidates.entries()].sort(([keyA, a], [keyB, b]) => {
    if (Math.abs(a.penalty - b.penalty) > PENALTY_EPSILON) {
      return a.penalty - b.penalty;
    }
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
  const firstOutside = ranked.findIndex(
    ([, candidate]) => !isWithinMargin(candidate.penalty),
  );
  const withinMargin = firstOutside === -1 ? ranked.length : firstOutside;
  const candidateCount = Math.min(
    ranked.length,
    Math.max(withinMargin, MATCHMAKING_MIN_CANDIDATES),
  );
  const rank = normalizeRank(input.rank) % candidateCount;
  const [, chosen] = ranked[rank];

  // 가산점이 가장 큰 코트 하나만 특수 유형으로 보이고, 같으면 앞 코트다
  let specialCourt: { court: number; match: SpecialMatch; bonus: number } | null =
    null;
  for (let court = 0; court < courtCount; court += 1) {
    const match = judgeCourt(chosen.arrangement, court);
    const bonus = match ? getSpecialMatchRecommendationBonus(match.kind) : 0;
    if (match && bonus > 0 && (!specialCourt || bonus > specialCourt.bonus)) {
      specialCourt = { court, match, bonus };
    }
  }

  const courts: RecommendedCourtPlan[] = [];
  for (let court = 0; court < courtCount; court += 1) {
    const [a1, a2, b1, b2] = courtSlice(chosen.arrangement, court);
    const repeatedPartnerPairs: Array<[string, string]> = [];
    const repeatedOpponentPairs: Array<[string, string]> = [];
    for (const [x, y] of [
      [a1, a2],
      [b1, b2],
    ] as const) {
      if (partnerCount(x, y) > 0) {
        repeatedPartnerPairs.push([x, y]);
      }
    }
    for (const x of [a1, a2]) {
      for (const y of [b1, b2]) {
        if (opponentCount(x, y) > 0) {
          repeatedOpponentPairs.push([x, y]);
        }
      }
    }
    courts.push({
      teams: [
        [a1, a2],
        [b1, b2],
      ],
      teamAverages: [
        (ratingOf(a1) + ratingOf(a2)) / 2,
        (ratingOf(b1) + ratingOf(b2)) / 2,
      ],
      repeatedPartnerPairs,
      repeatedOpponentPairs,
      specialMatch:
        specialCourt?.court === court ? specialCourt.match : null,
    });
  }

  return {
    courts,
    restingPlayerIds,
    penalty: chosen.penalty,
    rank,
    candidateCount,
  };
};

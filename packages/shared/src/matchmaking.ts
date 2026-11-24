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
/** 다시 추천 횟수 순환 주기. 1 이상은 ((reroll - 1) % 이 값) + 1로 계산한다 */
export const MATCHMAKING_REROLL_CYCLE = 10;
/** 참여자 전원이 NR일 때 쓰는 복식 평점 */
export const MATCHMAKING_ALL_NR_FALLBACK_RATING = 3.5;
/** 게스트 복식 평점. 게스트는 보통 정회원보다 실력이 낮아 NR 대체 중앙값 대신 이 값으로 친다 */
export const MATCHMAKING_GUEST_RATING = 2.5;

export interface MatchmakingParticipant {
  id: string;
  /** 복식 평점. NR이면 null. 게스트면 무시하고 MATCHMAKING_GUEST_RATING으로 친다 */
  doublesRating: number | null;
  isGuest?: boolean;
}

/** 오늘 이 세션에서 완료된 경기의 팀 구성(선수 id) */
export interface MatchmakingPlayedMatch {
  teams: [string[], string[]];
}

export interface RecommendDoublesMatchesInput {
  /** 세션 참여자 전원. 게스트를 뺀 참여자가 NR 대체 중앙값의 기준이다 */
  participants: MatchmakingParticipant[];
  /** 진행 중 경기에 들어가 있어 이번 추천에서 빠지는 선수 id */
  busyPlayerIds: readonly string[];
  /** 오늘 이 세션의 완료 경기. 경기 수·같은 팀·맞대결 집계 기준 */
  completedMatches: MatchmakingPlayedMatch[];
  /** 요청 코트 수. 정수로 내리고 1~4로 자른다 */
  courts: number;
  /** 선발 동점 깨기·탐색 출발점용 난수 seed. 같은 입력·같은 seed·같은 reroll이면 같은 결과 */
  seed: number;
  /**
   * 다시 추천 횟수(0 = 첫 추천). 음수·유한하지 않은 수는 0, 소수는 내리고,
   * MATCHMAKING_REROLL_CYCLE을 넘으면 1~CYCLE로 순환한다
   */
  reroll: number;
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
  /** 적용한 다시 추천 횟수(순환 반영) */
  reroll: number;
  /** 고른 대진이 속한 후보 중 최저 감점 + 여유폭 안 대진 수. 대진이 없으면 0 */
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
  /** 표시용 팀 평균 평점. 게스트는 MATCHMAKING_GUEST_RATING, NR 정회원은 기본 평점 3.0으로 치며, 후자는 팀 나누기의 NR 대체값과 다르다 */
  averageRating: number;
}

export interface RecommendedCourt {
  teams: [RecommendedTeam, RecommendedTeam];
  repeatedPartnerPairs: Array<[string, string]>;
  repeatedOpponentPairs: Array<[string, string]>;
  /** 특수 유형 코트면 판정 결과(outcome null), 아니면 null. 한 추천에 최대 한 코트다 */
  specialMatch: SpecialMatch | null;
}

/** GET /api/match-sessions/:sessionId/recommendations?courts=N&reroll=R 응답 */
export interface MatchSessionRecommendationResponse {
  sessionId: string;
  /** 1~4로 자른 요청 코트 수 */
  requestedCourts: number;
  /** 적용한 다시 추천 횟수. 요청 reroll에 순환을 반영한 값이다 */
  reroll: number;
  /** 최저 감점 + 여유폭 안 후보 수. 대진이 없으면 0 */
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

/** 다시 추천 단계별 난수 seed. 0단계는 seed 그대로, 나머지는 seed와 단계 번호를 섞는다(murmur3 finalizer) */
const getRerollStepSeed = (seed: number, step: number): number => {
  const base = Math.trunc(Number.isFinite(seed) ? seed : 0) >>> 0;
  if (step === 0) {
    return base;
  }
  let hash = (base ^ Math.imul(step, 0x9e3779b9)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
};

/** 0 이상 정수로 내리고(유한한 수가 아니면 0) CYCLE을 넘으면 1~CYCLE로 순환한다 */
const normalizeReroll = (reroll: number): number => {
  const value = Number.isFinite(reroll) ? Math.max(0, Math.floor(reroll)) : 0;
  return value > MATCHMAKING_REROLL_CYCLE
    ? ((value - 1) % MATCHMAKING_REROLL_CYCLE) + 1
    : value;
};

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

/** NR 대체값: 게스트를 뺀 참여자 non-null 평점의 중앙값, 전원 NR이면 고정값 */
const resolveNrRating = (participants: MatchmakingParticipant[]): number => {
  const ratings = participants
    .filter((participant) => !participant.isGuest)
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

/** 추천 매칭에서 특수 유형 코트가 받는 가산점 */
export const getSpecialMatchRecommendationBonus = (
  kind: SpecialMatchKind,
): number => SPECIAL_MATCH_RECOMMENDATION_BONUS[kind];

/** 한 단계(다시 추천 횟수 하나)에서 고른 대진 */
interface RecommendationStep {
  arrangement: Arrangement;
  penalty: number;
  restingPlayerIds: string[];
  /** 이 단계 후보 중 최저 감점 + 여유폭 안 대진 수 */
  candidateCount: number;
  key: string;
  courtKeys: ReadonlySet<string>;
}

export const recommendDoublesMatches = (
  input: RecommendDoublesMatchesInput,
): DoublesRecommendationPlan => {
  const reroll = normalizeReroll(input.reroll);
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
      reroll,
      candidateCount: 0,
    };
  }

  const history = collectTodayHistory(input.completedMatches);
  const nrRating = resolveNrRating(participants);
  const ratingById = new Map(
    eligible.map((participant) => [
      participant.id,
      participant.isGuest
        ? MATCHMAKING_GUEST_RATING
        : (participant.doublesRating ?? nrRating),
    ]),
  );
  const ratingOf = (id: string): number => ratingById.get(id) ?? nrRating;
  const partnerCount = (a: string, b: string): number =>
    history.partnerCounts.get(pairKey(a, b)) ?? 0;
  const opponentCount = (a: string, b: string): number =>
    history.opponentCounts.get(pairKey(a, b)) ?? 0;
  const selectedCount = courtCount * MATCHMAKING_PLAYERS_PER_COURT;

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
  // 유형은 팀 순서와 상관없으므로 코트 키로 가산점을 캐시한다(단계가 달라도 같은 코트면 같은 값)
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
  const courtKeysOf = (arrangement: Arrangement): Set<string> =>
    new Set(
      Array.from({ length: courtCount }, (_, court) =>
        courtKey(arrangement, court),
      ),
    );

  /**
   * 다시 추천 한 단계. 단계마다 난수가 달라 같은 경기 수끼리의 선발 순서와 탐색 출발점이 바뀐다.
   * 0단계는 최저 감점 대진, 그 뒤 단계는 여유폭 안에서 직전 단계 대진(previous)을 피해 고른다.
   */
  const runStep = (
    step: number,
    previous: RecommendationStep | null,
  ): RecommendationStep => {
    const random = createRandom(getRerollStepSeed(input.seed, step));

    // 선발: 오늘 경기 수 오름차순. 같은 경기 수끼리만 난수로 순서를 정한다
    const selectionOrder = eligible
      .map((participant) => ({
        id: participant.id,
        games: history.gamesPlayed.get(participant.id) ?? 0,
        tieBreak: random(),
      }))
      .sort((a, b) => a.games - b.games || a.tieBreak - b.tieBreak);
    const selectedIds = new Set(
      selectionOrder.slice(0, selectedCount).map((entry) => entry.id),
    );
    const selected = eligible
      .filter((participant) => selectedIds.has(participant.id))
      .map((participant) => participant.id);
    const restingPlayerIds = eligible
      .filter((participant) => !selectedIds.has(participant.id))
      .map((participant) => participant.id);

    // 평가한 배치 중 (지금까지의 최저 + 여유폭) 안 대진만 대진 키로 모은다.
    // 대진이 같으면 감점도 같으므로 키마다 처음 본 배치 하나만 둔다. 최저가 나중에 내려가 밖으로 밀린 대진은 마지막에 거른다.
    const candidates = new Map<
      string,
      { arrangement: Arrangement; penalty: number }
    >();
    let bestPenalty = Number.POSITIVE_INFINITY;
    const isWithinMargin = (penalty: number): boolean =>
      penalty <=
      bestPenalty + MATCHMAKING_CANDIDATE_PENALTY_MARGIN + PENALTY_EPSILON;
    const record = (arrangement: Arrangement, penalty: number): void => {
      bestPenalty = Math.min(bestPenalty, penalty);
      if (!isWithinMargin(penalty)) {
        return;
      }
      const key = canonicalKey(arrangement, courtCount);
      if (!candidates.has(key)) {
        candidates.set(key, { arrangement: [...arrangement], penalty });
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

    // 여유폭 안 후보를 감점 오름차순, 감점이 같으면 대진 키 순으로 줄 세운다
    const ranked = [...candidates.entries()]
      .filter(([, candidate]) => isWithinMargin(candidate.penalty))
      .sort(([keyA, a], [keyB, b]) => {
        if (Math.abs(a.penalty - b.penalty) > PENALTY_EPSILON) {
          return a.penalty - b.penalty;
        }
        return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
      });

    let chosenIndex = 0;
    if (previous) {
      // 직전 대진을 빼고 직전 대진과 같은 코트가 가장 적은 후보 중 무작위. 직전 대진뿐이면 그대로 둔다
      const overlaps = ranked.map(([key, candidate]) =>
        key === previous.key
          ? Number.POSITIVE_INFINITY
          : [...courtKeysOf(candidate.arrangement)].filter((court) =>
              previous.courtKeys.has(court),
            ).length,
      );
      const fewest = Math.min(...overlaps);
      if (Number.isFinite(fewest)) {
        const pool = overlaps.flatMap((overlap, index) =>
          overlap === fewest ? [index] : [],
        );
        chosenIndex = pool[Math.floor(random() * pool.length)];
      }
    }
    const [key, chosen] = ranked[chosenIndex];
    return {
      arrangement: chosen.arrangement,
      penalty: chosen.penalty,
      restingPlayerIds,
      candidateCount: ranked.length,
      key,
      courtKeys: courtKeysOf(chosen.arrangement),
    };
  };

  // reroll r의 직전 대진은 같은 입력의 r - 1 결과라 0단계부터 차례로 계산한다(최대 CYCLE + 1회)
  let result = runStep(0, null);
  for (let step = 1; step <= reroll; step += 1) {
    result = runStep(step, result);
  }

  // 특수 유형으로 보이는 코트는 하나다. 가산점이 가장 큰 코트(같으면 앞 코트), 가산점 코트가 없으면 앞 연승 매치 코트
  let specialCourt: { court: number; match: SpecialMatch; bonus: number } | null =
    null;
  for (let court = 0; court < courtCount; court += 1) {
    const match = judgeCourt(result.arrangement, court);
    if (!match) {
      continue;
    }
    const bonus = getSpecialMatchRecommendationBonus(match.kind);
    if (bonus > 0) {
      if (!specialCourt || bonus > specialCourt.bonus) {
        specialCourt = { court, match, bonus };
      }
    } else if (!specialCourt && match.kind === "streak_stopper") {
      // 가산점 0인 유형 중에서는 연승 매치만 보이고, 뒤에 가산점 코트가 나오면 위 분기가 덮어쓴다
      specialCourt = { court, match, bonus };
    }
  }

  const courts: RecommendedCourtPlan[] = [];
  for (let court = 0; court < courtCount; court += 1) {
    const [a1, a2, b1, b2] = courtSlice(result.arrangement, court);
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
    restingPlayerIds: result.restingPlayerIds,
    penalty: result.penalty,
    reroll,
    candidateCount: result.candidateCount,
  };
};

export const MATCHMAKING_DEFAULT_COURTS = 3;
export const MATCHMAKING_MIN_COURTS = 1;
export const MATCHMAKING_MAX_COURTS = 4;
export const MATCHMAKING_PLAYERS_PER_COURT = 4;
/** 선발 정렬 키에 더하는 난수의 상한. [0, 이 값) 연속 균등분포 */
export const MATCHMAKING_SELECTION_JITTER = 2;
export const MATCHMAKING_PENALTY_WEIGHTS = {
  /** 두 팀 평균 평점 차 1.0당 */
  teamAverageGap: 20,
  /** 오늘 같은 팀이었던 두 사람이 다시 한 팀, 1회당 */
  repeatedPartner: 6,
  /** 오늘 맞붙었던 두 사람이 다시 맞붙음, 그 쌍의 맞대결 1회당 */
  repeatedOpponent: 3,
  /** 한 코트 최고·최저 평점 차 1.0당 */
  courtRatingSpread: 1,
} as const;
export const MATCHMAKING_RANDOM_STARTS = 40;
/** 최저 감점 + 이 값 이하 배치를 후보로 모은다 */
export const MATCHMAKING_CANDIDATE_PENALTY_MARGIN = 2;
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
  /** 같은 입력·같은 seed면 같은 결과 */
  seed: number;
}

export interface RecommendedCourtPlan {
  teams: [[string, string], [string, string]];
  /** NR 대체값을 반영한 팀 평균 평점 */
  teamAverages: [number, number];
  repeatedPartnerPairs: Array<[string, string]>;
  repeatedOpponentPairs: Array<[string, string]>;
}

export interface DoublesRecommendationPlan {
  courts: RecommendedCourtPlan[];
  /** 추천 대상 중 이번에 선발되지 않은 선수 id */
  restingPlayerIds: string[];
  /** 고른 배치의 총 감점 */
  penalty: number;
}

/** 추천 API 응답의 선수 */
export interface RecommendationPlayer {
  id: string;
  username: string;
  avatarUrl?: string;
  /** 복식 평점. NR이면 null */
  doublesRating: number | null;
}

export interface RecommendedTeam {
  players: [RecommendationPlayer, RecommendationPlayer];
  /** NR 대체값을 반영한 팀 평균 평점 */
  averageRating: number;
}

export interface RecommendedCourt {
  teams: [RecommendedTeam, RecommendedTeam];
  repeatedPartnerPairs: Array<[string, string]>;
  repeatedOpponentPairs: Array<[string, string]>;
}

/** GET /api/match-sessions/:sessionId/recommendations?courts=N&seed=S 응답 */
export interface MatchSessionRecommendationResponse {
  sessionId: string;
  /** 1~4로 자른 요청 코트 수 */
  requestedCourts: number;
  seed: number;
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

/** 코트 순서·팀 순서·팀 안 순서를 무시한 대진 식별 키 */
const canonicalKey = (arrangement: Arrangement, courtCount: number): string => {
  const courts: string[] = [];
  for (let court = 0; court < courtCount; court += 1) {
    const [a1, a2, b1, b2] = courtSlice(arrangement, court);
    const teams = [[a1, a2].sort().join("+"), [b1, b2].sort().join("+")].sort();
    courts.push(teams.join(" vs "));
  }
  return courts.sort().join(" | ");
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
  const courtOf = (slot: number): number =>
    Math.floor(slot / MATCHMAKING_PLAYERS_PER_COURT);
  const teamOf = (slot: number): number => Math.floor(slot / 2);

  // 평가한 배치 중 (지금까지의 최저 + 여유) 이하만 대진 키로 모아 두고 마지막에 다시 거른다
  const candidates = new Map<
    string,
    { arrangement: Arrangement; penalty: number }
  >();
  let bestPenalty = Number.POSITIVE_INFINITY;
  const record = (arrangement: Arrangement, penalty: number): void => {
    bestPenalty = Math.min(bestPenalty, penalty);
    if (
      penalty >
      bestPenalty + MATCHMAKING_CANDIDATE_PENALTY_MARGIN + PENALTY_EPSILON
    ) {
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
    let total = perCourt.reduce((sum, value) => sum + value, 0);
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
          let swappedTotal = total - perCourt[courtI];
          swappedTotal += courtPenalty(arrangement, courtI);
          if (courtJ !== courtI) {
            swappedTotal +=
              courtPenalty(arrangement, courtJ) - perCourt[courtJ];
          }
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
        perCourt[courtOf(i)] = courtPenalty(arrangement, courtOf(i));
        perCourt[courtOf(j)] = courtPenalty(arrangement, courtOf(j));
        total = perCourt.reduce((sum, value) => sum + value, 0);
        improved = true;
      }
    }
  }

  const finalists = [...candidates.entries()]
    .filter(
      ([, candidate]) =>
        candidate.penalty <=
        bestPenalty + MATCHMAKING_CANDIDATE_PENALTY_MARGIN + PENALTY_EPSILON,
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const [, chosen] = finalists[Math.floor(random() * finalists.length)];

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
    });
  }

  return { courts, restingPlayerIds, penalty: chosen.penalty };
};

import {
  getWinningTeamIndex,
  isDoublesMatchType,
  type MatchScore,
  type MatchStatus,
  type MatchType,
} from "./match.js";

/**
 * 업적. 따로 저장하지 않고 조회할 때 완료 경기로 계산한다.
 * 경기를 수정·삭제해 조건이 깨지면 다음 계산부터 받지 않은 상태가 된다.
 */

export type AchievementCategory =
  "matches" | "wins" | "streak" | "special" | "session";

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  /** 화면 이름 */
  name: string;
  /** 조건 문구 */
  condition: string;
  /** 배지 아래 숫자 꼬리표. 없으면 null */
  badgeNumber: number | null;
  target: number;
}

/** 진행도를 세는 지표. 업적마다 하나를 쓴다 */
type AchievementMetric =
  | "matches"
  | "wins"
  | "bestStreak"
  | "perfectWins"
  | "hardWonWins"
  | "bestPartnerMatches"
  | "attendedSessions"
  | "bestSessionMatches"
  | "singlesWins"
  | "revenges"
  | "distinctPartners"
  | "distinctBeatenOpponents"
  | "bestOpponentMatches"
  | "bestPartnerStreak"
  | "unbeatenSessions";

/** 업적 정의와 진행도 지표를 한 행에 함께 둔 표(표 순서) */
const ACHIEVEMENT_TABLE: readonly {
  metric: AchievementMetric;
  definition: AchievementDefinition;
}[] = [
  {
    metric: "matches",
    definition: {
      id: "matches-1",
      category: "matches",
      name: "첫 경기",
      condition: "경기 1개 완료",
      badgeNumber: null,
      target: 1,
    },
  },
  {
    metric: "matches",
    definition: {
      id: "matches-10",
      category: "matches",
      name: "10경기",
      condition: "경기 10개 완료",
      badgeNumber: 10,
      target: 10,
    },
  },
  {
    metric: "matches",
    definition: {
      id: "matches-50",
      category: "matches",
      name: "50경기",
      condition: "경기 50개 완료",
      badgeNumber: 50,
      target: 50,
    },
  },
  {
    metric: "matches",
    definition: {
      id: "matches-100",
      category: "matches",
      name: "100경기",
      condition: "경기 100개 완료",
      badgeNumber: 100,
      target: 100,
    },
  },
  {
    metric: "matches",
    definition: {
      id: "matches-300",
      category: "matches",
      name: "300경기",
      condition: "경기 300개 완료",
      badgeNumber: 300,
      target: 300,
    },
  },
  {
    metric: "matches",
    definition: {
      id: "matches-1000",
      category: "matches",
      name: "1000경기",
      condition: "경기 1000개 완료",
      badgeNumber: 1000,
      target: 1000,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-1",
      category: "wins",
      name: "첫 승",
      condition: "처음 이긴 경기",
      badgeNumber: null,
      target: 1,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-10",
      category: "wins",
      name: "10승",
      condition: "이긴 경기 10개",
      badgeNumber: 10,
      target: 10,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-50",
      category: "wins",
      name: "50승",
      condition: "이긴 경기 50개",
      badgeNumber: 50,
      target: 50,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-100",
      category: "wins",
      name: "100승",
      condition: "이긴 경기 100개",
      badgeNumber: 100,
      target: 100,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-500",
      category: "wins",
      name: "500승",
      condition: "이긴 경기 500개",
      badgeNumber: 500,
      target: 500,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-1000",
      category: "wins",
      name: "1000승",
      condition: "이긴 경기 1000개",
      badgeNumber: 1000,
      target: 1000,
    },
  },
  {
    metric: "singlesWins",
    definition: {
      id: "singles-wins-1",
      category: "wins",
      name: "단식 첫 승",
      condition: "단식에서 처음 이긴 경기",
      badgeNumber: null,
      target: 1,
    },
  },
  {
    metric: "singlesWins",
    definition: {
      id: "singles-wins-10",
      category: "wins",
      name: "단식 10승",
      condition: "단식에서 이긴 경기 10개",
      badgeNumber: 10,
      target: 10,
    },
  },
  {
    metric: "bestStreak",
    definition: {
      id: "streak-3",
      category: "streak",
      name: "3연승",
      condition: "세 경기 연달아 승리",
      badgeNumber: 3,
      target: 3,
    },
  },
  {
    metric: "bestStreak",
    definition: {
      id: "streak-5",
      category: "streak",
      name: "5연승",
      condition: "다섯 경기 연달아 승리",
      badgeNumber: 5,
      target: 5,
    },
  },
  {
    metric: "bestStreak",
    definition: {
      id: "streak-10",
      category: "streak",
      name: "10연승",
      condition: "열 경기 연달아 승리",
      badgeNumber: 10,
      target: 10,
    },
  },
  {
    metric: "bestStreak",
    definition: {
      id: "streak-20",
      category: "streak",
      name: "20연승",
      condition: "스무 경기 연달아 승리",
      badgeNumber: 20,
      target: 20,
    },
  },
  {
    metric: "perfectWins",
    definition: {
      id: "perfect-win",
      category: "special",
      name: "퍼펙트 승리",
      condition: "1점도 주지 않고 승리",
      badgeNumber: null,
      target: 1,
    },
  },
  {
    metric: "hardWonWins",
    definition: {
      id: "hard-won-10",
      category: "special",
      name: "힘겹게 쟁취한 승리",
      condition: "양 팀 10점 이상 경기에서 10번 승리",
      badgeNumber: 10,
      target: 10,
    },
  },
  {
    metric: "bestPartnerMatches",
    definition: {
      id: "partner-20",
      category: "special",
      name: "단짝",
      condition: "같은 파트너와 복식 20경기",
      badgeNumber: 20,
      target: 20,
    },
  },
  {
    metric: "bestPartnerMatches",
    definition: {
      id: "partner-50",
      category: "special",
      name: "단짝 50경기",
      condition: "같은 파트너와 복식 50경기",
      badgeNumber: 50,
      target: 50,
    },
  },
  {
    metric: "bestPartnerStreak",
    definition: {
      id: "combo-5",
      category: "special",
      name: "환상의 콤비",
      condition: "같은 파트너와 복식 5연승",
      badgeNumber: 5,
      target: 5,
    },
  },
  {
    metric: "distinctPartners",
    definition: {
      id: "social-10",
      category: "special",
      name: "사교왕",
      condition: "서로 다른 파트너 10명과 복식",
      badgeNumber: 10,
      target: 10,
    },
  },
  {
    metric: "bestOpponentMatches",
    definition: {
      id: "rival-20",
      category: "special",
      name: "라이벌",
      condition: "같은 상대와 맞대결 20번",
      badgeNumber: 20,
      target: 20,
    },
  },
  {
    metric: "distinctBeatenOpponents",
    definition: {
      id: "dojo-15",
      category: "special",
      name: "도장깨기",
      condition: "서로 다른 상대 15명에게 승리",
      badgeNumber: 15,
      target: 15,
    },
  },
  {
    metric: "revenges",
    definition: {
      id: "revenge",
      category: "special",
      name: "리벤지",
      condition: "졌던 파트너·상대 조합 그대로 다시 붙어 승리",
      badgeNumber: null,
      target: 1,
    },
  },
  {
    metric: "attendedSessions",
    definition: {
      id: "attendance-10",
      category: "session",
      name: "개근 10회",
      condition: "경기를 한 세션 10번",
      badgeNumber: 10,
      target: 10,
    },
  },
  {
    metric: "attendedSessions",
    definition: {
      id: "attendance-30",
      category: "session",
      name: "개근 30회",
      condition: "경기를 한 세션 30번",
      badgeNumber: 30,
      target: 30,
    },
  },
  {
    metric: "attendedSessions",
    definition: {
      id: "attendance-100",
      category: "session",
      name: "개근 100회",
      condition: "경기를 한 세션 100번",
      badgeNumber: 100,
      target: 100,
    },
  },
  {
    metric: "bestSessionMatches",
    definition: {
      id: "iron-8",
      category: "session",
      name: "철인",
      condition: "한 세션에서 8경기",
      badgeNumber: 8,
      target: 8,
    },
  },
  {
    metric: "unbeatenSessions",
    definition: {
      id: "unbeaten-session",
      category: "session",
      name: "무패 세션",
      condition: "한 세션에서 4경기 이상 하고 전부 승리",
      badgeNumber: null,
      target: 1,
    },
  },
];

export const ACHIEVEMENTS: readonly AchievementDefinition[] =
  ACHIEVEMENT_TABLE.map((row) => row.definition);

const ACHIEVEMENT_METRIC_BY_ID = new Map<string, AchievementMetric>(
  ACHIEVEMENT_TABLE.map((row) => [row.definition.id, row.metric]),
);

export const ACHIEVEMENT_CATEGORY_LABEL: Record<AchievementCategory, string> = {
  matches: "경기 수",
  wins: "승리",
  streak: "연승",
  special: "특별",
  session: "세션",
};

/** 힘겹게 쟁취한 승리에서 두 팀 모두 넘어야 하는 점수 */
export const HARD_WON_MIN_POINTS = 10;

export interface AchievementProgress {
  id: string;
  earned: boolean;
  earnedAt: Date | null;
  earnedMatchId: string | null;
  /**
   * 지금까지 진행도. 연승은 최고 연승, 단짝은 한 파트너와의 최대 복식 경기 수,
   * 환상의 콤비는 한 파트너와의 최고 연승, 라이벌은 한 상대와의 최대 맞대결 수, 철인은 한 세션 최대 경기 수
   */
  current: number;
  target: number;
}

export interface EarnedAchievement {
  playerId: string;
  achievementId: string;
  earnedMatchId: string;
  earnedAt: Date;
}

/** GET /api/achievements/holders 응답. 업적 id별 받은 활성 회원 수(모든 업적 포함) */
export interface AchievementHoldersResponse {
  counts: Record<string, number>;
}

/**
 * 업적 계산에 필요한 경기 정보. `Match`가 그대로 들어맞고,
 * 서버는 완료 경기 요약을 이 형태로 바꿔 넘긴다.
 */
export interface AchievementMatch {
  id: string;
  type: MatchType;
  status: MatchStatus;
  completedAt: Date | null;
  teams: readonly [AchievementTeam, AchievementTeam];
  scores?: readonly MatchScore[] | null;
  session?: { id: string } | null;
}

export interface AchievementTeam {
  players: readonly { id: string }[];
}

type CountedMatch = AchievementMatch & { completedAt: Date };

/** 업적에 세는 경기: 완료 + 완료 시각 있음. 완료 시각 오름차순(같으면 id 순) */
const getCountedMatches = (
  matches: readonly AchievementMatch[],
): CountedMatch[] =>
  matches
    .filter(
      (match): match is CountedMatch =>
        match.status === "completed" &&
        match.completedAt != null &&
        !Number.isNaN(match.completedAt.getTime()),
    )
    .sort(
      (left, right) =>
        left.completedAt.getTime() - right.completedAt.getTime() ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );

const findTeamIndex = (
  match: AchievementMatch,
  playerId: string,
): 0 | 1 | null => {
  const index = match.teams.findIndex((team) =>
    team.players.some((player) => player.id === playerId),
  );
  return index === 0 || index === 1 ? index : null;
};

const sumPoints = (scores: readonly MatchScore[], teamIndex: 0 | 1) =>
  scores.reduce(
    (total, score) => total + (teamIndex === 0 ? score.scoreA : score.scoreB),
    0,
  );

/** 상대 팀이 1점도 못 냈다. 과거 다중 점수 기록은 모든 게임 합계로 본다 */
const isPerfect = (scores: readonly MatchScore[], teamIndex: 0 | 1) =>
  scores.length > 0 && sumPoints(scores, teamIndex === 0 ? 1 : 0) === 0;

/** 두 팀 모두 10점 이상. 과거 다중 점수 기록은 게임 하나라도 그러면 해당한다 */
const isHardFought = (scores: readonly MatchScore[]) =>
  scores.some(
    (score) =>
      score.scoreA >= HARD_WON_MIN_POINTS &&
      score.scoreB >= HARD_WON_MIN_POINTS,
  );

/** 무패 세션에 필요한 한 세션 경기 수 */
export const UNBEATEN_SESSION_MIN_MATCHES = 4;

/** 같은 조합 판정 키: 내 팀 구성과 상대 팀 구성(팀 안 순서 무관) */
const getLineupKey = (match: AchievementMatch, teamIndex: 0 | 1) => {
  const teamKey = (index: 0 | 1) =>
    match.teams[index].players
      .map((player) => player.id)
      .sort()
      .join(",");
  return `${teamKey(teamIndex)}|${teamKey(teamIndex === 0 ? 1 : 0)}`;
};

/** 경기 결과. 승패가 갈리지 않은 경기는 "none" */
type MatchOutcome = "won" | "lost" | "none";

interface SessionRecord {
  matches: number;
  allWon: boolean;
  /** 전승 상태로 UNBEATEN_SESSION_MIN_MATCHES번째 경기를 마친 경기 */
  qualifiedMatch: CountedMatch | null;
}

/** 경기를 다 훑은 뒤에 판정하는 지표. 나중 경기로 조건이 깨질 수 있다 */
const FINAL_METRICS: ReadonlySet<AchievementMetric> = new Set([
  "unbeatenSessions",
]);

/**
 * 한 회원의 업적 32개 진행 상태(ACHIEVEMENTS 순서).
 * 완료 경기만(진행 중·취소 제외) 완료 시각 순으로 훑어, 진행도가 목표에 처음 닿은
 * 경기를 받게 된 경기로, 그 경기 완료 시각을 받은 날로 정한다.
 * 승패가 갈리지 않은 경기는 승리에는 세지 않고 연승·콤비 연승·무패 세션은 끊는다.
 * 경기 수·단짝·라이벌·세션 진행도에는 센다.
 * 무패 세션은 그 세션의 모든 경기로 판정하므로, 4경기 전승 뒤 같은 세션에서 지면 받지 않은 상태가 된다.
 */
export function computeAchievements(
  playerId: string,
  matches: readonly AchievementMatch[],
): AchievementProgress[] {
  const metrics: Record<AchievementMetric, number> = {
    matches: 0,
    wins: 0,
    bestStreak: 0,
    perfectWins: 0,
    hardWonWins: 0,
    bestPartnerMatches: 0,
    attendedSessions: 0,
    bestSessionMatches: 0,
    singlesWins: 0,
    revenges: 0,
    distinctPartners: 0,
    distinctBeatenOpponents: 0,
    bestOpponentMatches: 0,
    bestPartnerStreak: 0,
    unbeatenSessions: 0,
  };
  const progress: AchievementProgress[] = ACHIEVEMENTS.map((definition) => ({
    id: definition.id,
    earned: false,
    earnedAt: null,
    earnedMatchId: null,
    current: 0,
    target: definition.target,
  }));

  let streak = 0;
  const partnerMatches = new Map<string, number>();
  const partnerStreaks = new Map<string, number>();
  const opponentMatches = new Map<string, number>();
  const beatenOpponents = new Set<string>();
  const lastOutcomeByLineup = new Map<string, MatchOutcome>();
  const sessions = new Map<string, SessionRecord>();

  for (const match of getCountedMatches(matches)) {
    const teamIndex = findTeamIndex(match, playerId);
    if (teamIndex === null) continue;

    const scores = match.scores ?? [];
    const winningTeamIndex = getWinningTeamIndex(match);
    const won = winningTeamIndex === teamIndex;
    const outcome: MatchOutcome = won
      ? "won"
      : winningTeamIndex === null
        ? "none"
        : "lost";

    metrics.matches += 1;
    if (won) {
      metrics.wins += 1;
      streak += 1;
      metrics.bestStreak = Math.max(metrics.bestStreak, streak);
      if (isPerfect(scores, teamIndex)) metrics.perfectWins += 1;
      if (isHardFought(scores)) metrics.hardWonWins += 1;
      if (!isDoublesMatchType(match.type)) metrics.singlesWins += 1;
    } else {
      streak = 0;
    }

    const lineupKey = getLineupKey(match, teamIndex);
    if (won && lastOutcomeByLineup.get(lineupKey) === "lost") {
      metrics.revenges += 1;
    }
    lastOutcomeByLineup.set(lineupKey, outcome);

    const opponentIds = new Set(
      match.teams[teamIndex === 0 ? 1 : 0].players.map((player) => player.id),
    );
    for (const opponentId of opponentIds) {
      const count = (opponentMatches.get(opponentId) ?? 0) + 1;
      opponentMatches.set(opponentId, count);
      metrics.bestOpponentMatches = Math.max(
        metrics.bestOpponentMatches,
        count,
      );
      if (won) beatenOpponents.add(opponentId);
    }
    metrics.distinctBeatenOpponents = beatenOpponents.size;

    if (isDoublesMatchType(match.type)) {
      const partnerIds = new Set(
        match.teams[teamIndex].players
          .map((player) => player.id)
          .filter((id) => id !== playerId),
      );
      for (const partnerId of partnerIds) {
        const count = (partnerMatches.get(partnerId) ?? 0) + 1;
        partnerMatches.set(partnerId, count);
        metrics.bestPartnerMatches = Math.max(
          metrics.bestPartnerMatches,
          count,
        );

        const partnerStreak = won
          ? (partnerStreaks.get(partnerId) ?? 0) + 1
          : 0;
        partnerStreaks.set(partnerId, partnerStreak);
        metrics.bestPartnerStreak = Math.max(
          metrics.bestPartnerStreak,
          partnerStreak,
        );
      }
      metrics.distinctPartners = partnerMatches.size;
    }

    const sessionId = match.session?.id;
    if (sessionId) {
      const session = sessions.get(sessionId) ?? {
        matches: 0,
        allWon: true,
        qualifiedMatch: null,
      };
      sessions.set(sessionId, session);
      session.matches += 1;
      if (!won) session.allWon = false;
      if (session.allWon && session.matches === UNBEATEN_SESSION_MIN_MATCHES) {
        session.qualifiedMatch = match;
      }
      if (session.matches === 1) metrics.attendedSessions += 1;
      metrics.bestSessionMatches = Math.max(
        metrics.bestSessionMatches,
        session.matches,
      );
    }

    for (const item of progress) {
      if (item.earned) continue;
      const metric = ACHIEVEMENT_METRIC_BY_ID.get(item.id)!;
      if (FINAL_METRICS.has(metric)) continue;
      if (metrics[metric] >= item.target) {
        item.earned = true;
        item.earnedAt = match.completedAt;
        item.earnedMatchId = match.id;
      }
    }
  }

  // 무패 세션: 끝까지 전승인 세션만 세고, 그중 가장 먼저 조건을 채운 경기를 받은 경기로 정한다.
  const unbeatenMatches = [...sessions.values()]
    .flatMap((session) =>
      session.allWon && session.qualifiedMatch ? [session.qualifiedMatch] : [],
    )
    .sort(
      (left, right) => left.completedAt.getTime() - right.completedAt.getTime(),
    );
  metrics.unbeatenSessions = unbeatenMatches.length;

  for (const item of progress) {
    const metric = ACHIEVEMENT_METRIC_BY_ID.get(item.id)!;
    item.current = metrics[metric];
    if (FINAL_METRICS.has(metric) && item.current >= item.target) {
      const earnedMatch = unbeatenMatches[item.target - 1];
      item.earned = true;
      item.earnedAt = earnedMatch.completedAt;
      item.earnedMatchId = earnedMatch.id;
    }
  }
  return progress;
}

/** 진행 상태 중 받은 업적만 EarnedAchievement로 바꾼다(ACHIEVEMENTS 순서) */
export const toEarnedAchievements = (
  playerId: string,
  progress: readonly AchievementProgress[],
): EarnedAchievement[] =>
  progress.flatMap((item) =>
    item.earned && item.earnedAt && item.earnedMatchId
      ? [
          {
            playerId,
            achievementId: item.id,
            earnedMatchId: item.earnedMatchId,
            earnedAt: item.earnedAt,
          },
        ]
      : [],
  );

/**
 * 경기 저장 전후 계산 차이로 새로 받은 업적을 구한다.
 * 저장 후에 받았고 저장 전에는 받지 않은 업적만 돌려준다(회원 순서 → ACHIEVEMENTS 순서).
 */
export const findNewAchievements = ({
  playerIds,
  before,
  after,
}: {
  playerIds: readonly string[];
  before: readonly AchievementMatch[];
  after: readonly AchievementMatch[];
}): EarnedAchievement[] =>
  [...new Set(playerIds)].flatMap((playerId) => {
    const earnedBefore = new Set(
      computeAchievements(playerId, before)
        .filter((item) => item.earned)
        .map((item) => item.id),
    );
    return toEarnedAchievements(
      playerId,
      computeAchievements(playerId, after),
    ).filter((item) => !earnedBefore.has(item.achievementId));
  });

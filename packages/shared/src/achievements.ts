import {
  getWinningTeamIndex,
  isDoublesMatchType,
  type MatchScore,
  type MatchStatus,
  type MatchType,
} from "./match.js";
import { ACHIEVEMENT_COUNT_START } from "./achievementCountStart.js";
import { roundDuprRating } from "./player.js";
import { toKstDateKey } from "./session.js";

/**
 * 업적. 따로 저장하지 않고 조회할 때 완료 경기로 계산한다.
 * 경기를 수정·삭제해 조건이 깨지면 다음 계산부터 받지 않은 상태가 된다.
 */

export type AchievementCategory =
  | "matches"
  | "wins"
  | "streak"
  | "rating"
  | "special"
  | "session";

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  /** 화면 이름 */
  name: string;
  /** 조건 문구 */
  condition: string;
  /** 배지 아래 숫자 꼬리표 문구("10", "4.0"). 없으면 null */
  badgeNumber: string | null;
  target: number;
  /** 업적 점수. 난이도에 따라 10·25·50·100점이다 */
  points: number;
}

/** 진행도를 세는 지표. 업적마다 하나를 쓴다 */
type AchievementMetric =
  | "matches"
  | "wins"
  | "bestStreak"
  | "perfectWins"
  | "hardWonWins"
  | "deuceWins"
  | "bestPartnerMatches"
  | "attendedSessions"
  | "bestSessionMatches"
  | "singlesWins"
  | "revenges"
  | "distinctPartners"
  | "distinctBeatenOpponents"
  | "bestOpponentMatches"
  | "bestPartnerStreak"
  | "unbeatenSessions"
  | "dominatedSessions"
  | "peakDoublesRating"
  | "lowestDoublesRating";

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
      points: 10,
    },
  },
  {
    metric: "matches",
    definition: {
      id: "matches-10",
      category: "matches",
      name: "10경기",
      condition: "경기 10개 완료",
      badgeNumber: "10",
      target: 10,
      points: 10,
    },
  },
  {
    metric: "matches",
    definition: {
      id: "matches-50",
      category: "matches",
      name: "50경기",
      condition: "경기 50개 완료",
      badgeNumber: "50",
      target: 50,
      points: 25,
    },
  },
  {
    metric: "matches",
    definition: {
      id: "matches-100",
      category: "matches",
      name: "100경기",
      condition: "경기 100개 완료",
      badgeNumber: "100",
      target: 100,
      points: 25,
    },
  },
  {
    metric: "matches",
    definition: {
      id: "matches-300",
      category: "matches",
      name: "300경기",
      condition: "경기 300개 완료",
      badgeNumber: "300",
      target: 300,
      points: 50,
    },
  },
  {
    metric: "matches",
    definition: {
      id: "matches-1000",
      category: "matches",
      name: "1000경기",
      condition: "경기 1000개 완료",
      badgeNumber: "1000",
      target: 1000,
      points: 100,
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
      points: 10,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-10",
      category: "wins",
      name: "10승",
      condition: "이긴 경기 10개",
      badgeNumber: "10",
      target: 10,
      points: 10,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-50",
      category: "wins",
      name: "50승",
      condition: "이긴 경기 50개",
      badgeNumber: "50",
      target: 50,
      points: 25,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-100",
      category: "wins",
      name: "100승",
      condition: "이긴 경기 100개",
      badgeNumber: "100",
      target: 100,
      points: 50,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-500",
      category: "wins",
      name: "500승",
      condition: "이긴 경기 500개",
      badgeNumber: "500",
      target: 500,
      points: 100,
    },
  },
  {
    metric: "wins",
    definition: {
      id: "wins-1000",
      category: "wins",
      name: "1000승",
      condition: "이긴 경기 1000개",
      badgeNumber: "1000",
      target: 1000,
      points: 100,
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
      points: 10,
    },
  },
  {
    metric: "singlesWins",
    definition: {
      id: "singles-wins-10",
      category: "wins",
      name: "단식 10승",
      condition: "단식에서 이긴 경기 10개",
      badgeNumber: "10",
      target: 10,
      points: 25,
    },
  },
  {
    metric: "bestStreak",
    definition: {
      id: "streak-3",
      category: "streak",
      name: "3연승",
      condition: "세 경기 연달아 승리",
      badgeNumber: "3",
      target: 3,
      points: 10,
    },
  },
  {
    metric: "bestStreak",
    definition: {
      id: "streak-5",
      category: "streak",
      name: "5연승",
      condition: "다섯 경기 연달아 승리",
      badgeNumber: "5",
      target: 5,
      points: 25,
    },
  },
  {
    metric: "bestStreak",
    definition: {
      id: "streak-10",
      category: "streak",
      name: "10연승",
      condition: "열 경기 연달아 승리",
      badgeNumber: "10",
      target: 10,
      points: 50,
    },
  },
  {
    metric: "bestStreak",
    definition: {
      id: "streak-20",
      category: "streak",
      name: "20연승",
      condition: "스무 경기 연달아 승리",
      badgeNumber: "20",
      target: 20,
      points: 100,
    },
  },
  {
    metric: "peakDoublesRating",
    definition: {
      id: "rating-3.0",
      category: "rating",
      name: "수면 위로",
      condition: "복식 10경기 이상, 복식 평점 3.0 달성",
      badgeNumber: "3.0",
      target: 3,
      points: 10,
    },
  },
  {
    metric: "peakDoublesRating",
    definition: {
      id: "rating-3.5",
      category: "rating",
      name: "구름 위 산책",
      condition: "복식 10경기 이상, 복식 평점 3.5 달성",
      badgeNumber: "3.5",
      target: 3.5,
      points: 25,
    },
  },
  {
    metric: "peakDoublesRating",
    definition: {
      id: "rating-4.0",
      category: "rating",
      name: "성층권",
      condition: "복식 10경기 이상, 복식 평점 4.0 달성",
      badgeNumber: "4.0",
      target: 4,
      points: 50,
    },
  },
  {
    metric: "peakDoublesRating",
    definition: {
      id: "rating-4.5",
      category: "rating",
      name: "궤도 진입",
      condition: "복식 10경기 이상, 복식 평점 4.5 달성",
      badgeNumber: "4.5",
      target: 4.5,
      points: 100,
    },
  },
  {
    metric: "lowestDoublesRating",
    definition: {
      id: "rating-low-2.5",
      category: "rating",
      name: "심해 탐사",
      condition: "복식 10경기 이상, 복식 평점 2.5 이하",
      badgeNumber: "2.5",
      target: 2.5,
      points: 50,
    },
  },
  {
    metric: "lowestDoublesRating",
    definition: {
      id: "rating-low-2.0",
      category: "rating",
      name: "마리아나 해구",
      condition: "복식 10경기 이상, 복식 평점 2.0 이하",
      badgeNumber: "2.0",
      target: 2,
      points: 100,
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
      points: 25,
    },
  },
  {
    metric: "hardWonWins",
    definition: {
      id: "hard-won",
      category: "special",
      name: "힘겹게 쟁취한 승리",
      condition: "듀스 끝에 15:14로 승리",
      badgeNumber: null,
      target: 1,
      points: 50,
    },
  },
  {
    metric: "deuceWins",
    definition: {
      id: "deuce-master",
      category: "special",
      name: "듀스 승부사",
      condition: "양 팀 10점 이상 경기에서 10번 승리",
      badgeNumber: null,
      target: 10,
      points: 50,
    },
  },
  {
    metric: "bestPartnerMatches",
    definition: {
      id: "partner-20",
      category: "special",
      name: "단짝",
      condition: "같은 파트너와 복식 20경기",
      badgeNumber: "20",
      target: 20,
      points: 25,
    },
  },
  {
    metric: "bestPartnerMatches",
    definition: {
      id: "partner-50",
      category: "special",
      name: "단짝 50경기",
      condition: "같은 파트너와 복식 50경기",
      badgeNumber: "50",
      target: 50,
      points: 50,
    },
  },
  {
    metric: "bestPartnerStreak",
    definition: {
      id: "combo-5",
      category: "special",
      name: "환상의 콤비",
      condition: "같은 파트너와 복식 5연승",
      badgeNumber: null,
      target: 5,
      points: 50,
    },
  },
  {
    metric: "distinctPartners",
    definition: {
      id: "social-10",
      category: "special",
      name: "사교왕",
      condition: "서로 다른 파트너 10명과 복식",
      badgeNumber: null,
      target: 10,
      points: 25,
    },
  },
  {
    metric: "bestOpponentMatches",
    definition: {
      id: "rival-20",
      category: "special",
      name: "라이벌",
      condition: "같은 상대와 맞대결 20번",
      badgeNumber: null,
      target: 20,
      points: 50,
    },
  },
  {
    metric: "distinctBeatenOpponents",
    definition: {
      id: "dojo-15",
      category: "special",
      name: "도장깨기",
      condition: "서로 다른 상대 15명에게 승리",
      badgeNumber: null,
      target: 15,
      points: 25,
    },
  },
  {
    metric: "revenges",
    definition: {
      id: "revenge",
      category: "special",
      name: "리벤지",
      condition: "패배한 조합 그대로 바로 다음 경기에서 승리",
      badgeNumber: null,
      target: 1,
      points: 10,
    },
  },
  {
    metric: "revenges",
    definition: {
      id: "revenge-5",
      category: "special",
      name: "리벤지 5회",
      condition: "리벤지 5번",
      badgeNumber: "5",
      target: 5,
      points: 25,
    },
  },
  {
    metric: "attendedSessions",
    definition: {
      id: "attendance-10",
      category: "session",
      name: "개근 10회",
      condition: "경기를 한 세션 10번",
      badgeNumber: "10",
      target: 10,
      points: 10,
    },
  },
  {
    metric: "attendedSessions",
    definition: {
      id: "attendance-30",
      category: "session",
      name: "개근 30회",
      condition: "경기를 한 세션 30번",
      badgeNumber: "30",
      target: 30,
      points: 25,
    },
  },
  {
    metric: "attendedSessions",
    definition: {
      id: "attendance-100",
      category: "session",
      name: "개근 100회",
      condition: "경기를 한 세션 100번",
      badgeNumber: "100",
      target: 100,
      points: 50,
    },
  },
  {
    metric: "bestSessionMatches",
    definition: {
      id: "iron-8",
      category: "session",
      name: "철인",
      condition: "한 세션에서 8경기",
      badgeNumber: null,
      target: 8,
      points: 25,
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
      points: 25,
    },
  },
  {
    metric: "dominatedSessions",
    definition: {
      id: "dominator-1",
      category: "session",
      name: "세션 지배자",
      condition: "끝난 세션에서 복식 평점이 가장 많이 오름",
      badgeNumber: null,
      target: 1,
      points: 25,
    },
  },
  {
    metric: "dominatedSessions",
    definition: {
      id: "dominator-10",
      category: "session",
      name: "세션 지배자 10회",
      condition: "세션 지배자 10번",
      badgeNumber: "10",
      target: 10,
      points: 100,
    },
  },
];

export const ACHIEVEMENTS: readonly AchievementDefinition[] =
  ACHIEVEMENT_TABLE.map((row) => row.definition);

const ACHIEVEMENT_POINTS_BY_ID = new Map(
  ACHIEVEMENTS.map((definition) => [definition.id, definition.points]),
);

/** 업적 점수 만점(모든 업적 점수 합) */
export const ACHIEVEMENT_MAX_POINTS = ACHIEVEMENTS.reduce(
  (sum, definition) => sum + definition.points,
  0,
);

/** 업적 id의 점수. 모르는 업적은 0점이다 */
export const getAchievementPoints = (achievementId: string) =>
  ACHIEVEMENT_POINTS_BY_ID.get(achievementId) ?? 0;

/** 받은 업적 점수 합(진행 상태 목록). 저장하지 않고 받은 업적으로 계산하므로, 업적을 잃으면 점수도 빠진다 */
export const sumAchievementPoints = (
  achievements: readonly { id: string; earned: boolean }[],
) =>
  achievements.reduce(
    (sum, item) => (item.earned ? sum + getAchievementPoints(item.id) : sum),
    0,
  );

/** 받은 업적 점수 합(받은 업적 목록) */
export const sumEarnedAchievementPoints = (
  earned: readonly { achievementId: string }[],
) =>
  earned.reduce((sum, item) => sum + getAchievementPoints(item.achievementId), 0);

const ACHIEVEMENT_METRIC_BY_ID = new Map<string, AchievementMetric>(
  ACHIEVEMENT_TABLE.map((row) => [row.definition.id, row.metric]),
);

/**
 * 지표별 집계 시작 시각. 이 시각 전에 완료된 경기는 그 지표에 세지 않고, null이면 전체 기록을 센다.
 * - 경기 수·승 수·개근은 그냥 쌓이는 기록이라 이관 경기를 포함한 전체 기록을 센다.
 * - 새 지표를 쓰는 업적을 추가하면 그 지표는 추가를 배포한 날 00:00 KST부터 센다(여기에 그 시각을 적는다).
 * - 기존 지표에 단계만 늘리는 업적(예: 1000경기 다음 5000경기)은 그 지표의 시작 시각을 그대로 따른다.
 * - 기존 업적의 조건을 고치면 그 지표의 원래 시작 시각부터 다시 계산한다.
 * - 평점 지표는 시작 시각 전 경기 대신 시작 시각 시점 평점에서 시작한다(computeProgressSince 참고).
 * 업적 계산은 시작 시각마다 따로 돌리므로, 지표를 추가할 때 계산 코드에서 시작 시각을 따로 확인하지 않는다.
 */
const METRIC_COUNT_START: Record<AchievementMetric, Date | null> = {
  matches: null,
  wins: null,
  attendedSessions: null,
  bestStreak: ACHIEVEMENT_COUNT_START,
  perfectWins: ACHIEVEMENT_COUNT_START,
  hardWonWins: ACHIEVEMENT_COUNT_START,
  deuceWins: ACHIEVEMENT_COUNT_START,
  bestPartnerMatches: ACHIEVEMENT_COUNT_START,
  bestSessionMatches: ACHIEVEMENT_COUNT_START,
  singlesWins: ACHIEVEMENT_COUNT_START,
  revenges: ACHIEVEMENT_COUNT_START,
  distinctPartners: ACHIEVEMENT_COUNT_START,
  distinctBeatenOpponents: ACHIEVEMENT_COUNT_START,
  bestOpponentMatches: ACHIEVEMENT_COUNT_START,
  bestPartnerStreak: ACHIEVEMENT_COUNT_START,
  unbeatenSessions: ACHIEVEMENT_COUNT_START,
  dominatedSessions: ACHIEVEMENT_COUNT_START,
  peakDoublesRating: ACHIEVEMENT_COUNT_START,
  lowestDoublesRating: ACHIEVEMENT_COUNT_START,
};

/** 진행도가 누적 수가 아니라 최고 연승 기록인 업적(연승·환상의 콤비) */
export const isBestStreakAchievement = (achievementId: string) => {
  const metric = ACHIEVEMENT_METRIC_BY_ID.get(achievementId);
  return metric === "bestStreak" || metric === "bestPartnerStreak";
};

/** 평점 업적(높은 평점 3.0~4.5, 낮은 평점 2.5·2.0). 진행도는 복식 평점이다 */
export const isRatingAchievement = (achievementId: string) => {
  const metric = ACHIEVEMENT_METRIC_BY_ID.get(achievementId);
  return metric === "peakDoublesRating" || metric === "lowestDoublesRating";
};

/** 낮은 평점 업적(2.5·2.0 이하). 진행도는 최저 복식 평점이고 목표 이하가 되면 받는다 */
export const isLowRatingAchievement = (achievementId: string) =>
  ACHIEVEMENT_METRIC_BY_ID.get(achievementId) === "lowestDoublesRating";

/** 평점 업적에 필요한 평점 반영 복식 경기 수. 이 경기 수를 채운 뒤의 평점만 센다 */
export const RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES = 10;

export const ACHIEVEMENT_CATEGORY_LABEL: Record<AchievementCategory, string> = {
  matches: "경기 수",
  wins: "승리",
  streak: "연승",
  rating: "평점",
  special: "특별",
  session: "세션",
};

/** 듀스 승부사에서 두 팀 모두 넘어야 하는 점수 */
export const DEUCE_MIN_POINTS = 10;

/** 동호회 듀스 상한 점수. 14:14에서 다음 점수를 낸 팀이 15점으로 이긴다 */
export const DEUCE_CAP_POINTS = 15;

export interface AchievementProgress {
  id: string;
  earned: boolean;
  earnedAt: Date | null;
  earnedMatchId: string | null;
  /**
   * 지금까지 진행도. 연승은 최고 연승, 단짝은 한 파트너와의 최대 복식 경기 수,
   * 환상의 콤비는 한 파트너와의 최고 연승, 라이벌은 한 상대와의 최대 맞대결 수, 철인은 한 세션 최대 경기 수.
   * 평점 업적은 복식 경기 수를 채운 뒤의 최고(낮은 평점 업적은 최저) 복식 평점이고, 그런 평점이 없으면 0이다
   */
  current: number;
  target: number;
  /** 평점 업적만: 지금까지 평점 반영 복식 경기 수(업적 기준 시각 전 경기 포함) */
  ratedDoublesMatches?: number;
}

export interface EarnedAchievement {
  playerId: string;
  achievementId: string;
  earnedMatchId: string;
  earnedAt: Date;
}

/** 회원이 확인한 업적 한 건. earnedMatchId는 확인할 때의 획득 경기다 */
export interface SeenAchievementRef {
  achievementId: string;
  earnedMatchId: string;
}

/** GET /api/me/achievements/unseen 응답. 받은 업적 중 확인하지 않은 것(받은 시각 → 업적 정의 순서) */
export interface UnseenAchievementsResponse {
  achievements: EarnedAchievement[];
  /** 요청자의 지금 업적 점수 합(이 미확인 업적 점수 포함) */
  points: number;
}

/** POST /api/me/achievements/seen 요청. 업적마다 지금 보고 있는 획득 경기를 넘긴다 */
export interface MarkAchievementsSeenRequest {
  achievements: SeenAchievementRef[];
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
  /** 게스트가 낀 경기(Match.ratingExcluded)는 업적에 세지 않는다 */
  ratingExcluded?: boolean;
  /**
   * 이 경기 직후 선수별 복식 평점(평점 변경 로그의 nextRating.doubles). 평점 업적에 쓴다.
   * 없는 선수는 이 경기로 평점 업적 진행도가 바뀌지 않는다
   */
  doublesRatingAfter?: Readonly<Record<string, number>>;
}

export interface AchievementTeam {
  players: readonly { id: string }[];
}

type CountedMatch = AchievementMatch & { completedAt: Date };

/** 완료 시각 오름차순(같으면 id 순). 지금 연승 계산(streak.ts)도 이 순서를 거꾸로 쓴다 */
export const compareCountedMatches = (
  left: { id: string; completedAt: Date },
  right: { id: string; completedAt: Date },
) =>
  left.completedAt.getTime() - right.completedAt.getTime() ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

/** 업적 기준 시각(ACHIEVEMENT_COUNT_START) 이후인 시각 */
const isOnOrAfterCountStart = (at: Date) =>
  at.getTime() >= ACHIEVEMENT_COUNT_START.getTime();

/** 완료 시각이 있는 평점 반영 완료 경기 */
const isRatedCompletedMatch = (
  match: AchievementMatch,
): match is CountedMatch =>
  match.status === "completed" &&
  !match.ratingExcluded &&
  match.completedAt != null;

/**
 * 업적 계산에 넣는 경기: 이 회원이 뛴 평점 반영 완료 경기 전부(compareCountedMatches 순).
 * 집계 시작 시각마다 다시 거른다(computeProgressSince).
 */
const getPlayerCountedMatches = (
  playerId: string,
  matches: readonly AchievementMatch[],
): CountedMatch[] =>
  matches
    .filter(
      (match): match is CountedMatch =>
        isRatedCompletedMatch(match) && findTeamIndex(match, playerId) !== null,
    )
    .sort(compareCountedMatches);

/**
 * 받은 업적을 업적 기준 시각 이후 완료 경기로 받았는지.
 * 아니면 이관 경기(경기 수·승 수·개근)나 업적 기준 시각 시점 평점(평점 업적)으로 받은 것이라,
 * 세션 리포트·새 업적에서 그 경기로 받은 업적으로 보여 주지 않는다.
 */
export const isEarnedByCountedMatch = (achievement: EarnedAchievement) =>
  isOnOrAfterCountStart(achievement.earnedAt);

/** 복식 경기 직후 이 회원의 복식 평점(평점 업적 입력). 단식이거나 평점이 없으면 null */
const getDoublesRatingAfter = (match: AchievementMatch, playerId: string) => {
  const rating = match.doublesRatingAfter?.[playerId];
  return isDoublesMatchType(match.type) && rating != null
    ? roundDuprRating(rating)
    : null;
};

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

/** 상대 팀이 1점도 못 냈다 */
const isPerfect = (scores: readonly MatchScore[], teamIndex: 0 | 1) =>
  scores.length > 0 && sumPoints(scores, teamIndex === 0 ? 1 : 0) === 0;

/** 두 팀 모두 10점 이상 */
const isDeuceGame = (scores: readonly MatchScore[]) =>
  scores.some(
    (score) =>
      score.scoreA >= DEUCE_MIN_POINTS && score.scoreB >= DEUCE_MIN_POINTS,
  );

/**
 * 듀스 끝에 15:14로 이긴 게임이 있다. 동호회 듀스는 15점 상한이라 14:14 다음 점수로 끝나므로,
 * 15:13·16:14 같은 점수는 듀스 상한까지 간 승리가 아니다.
 */
const isHardWon = (scores: readonly MatchScore[], teamIndex: 0 | 1) =>
  scores.some((score) => {
    const mine = teamIndex === 0 ? score.scoreA : score.scoreB;
    const theirs = teamIndex === 0 ? score.scoreB : score.scoreA;
    return mine === DEUCE_CAP_POINTS && theirs === DEUCE_CAP_POINTS - 1;
  });

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

/** map[key]를 1 올리고 올린 값을 돌려준다 */
const increment = (map: Map<string, number>, key: string) => {
  const count = (map.get(key) ?? 0) + 1;
  map.set(key, count);
  return count;
};

interface SessionRecord {
  matches: number;
  allWon: boolean;
  /** 전승 상태로 UNBEATEN_SESSION_MIN_MATCHES번째 경기를 마친 경기 */
  qualifiedMatch: CountedMatch | null;
  /** 이 세션에서 한 마지막 경기 */
  lastMatch: CountedMatch;
}

/** 세션 단위로 다 훑은 뒤에 판정하는 지표. 나중 경기나 세션 종료로 결과가 정해진다 */
const SESSION_EVENT_METRICS = [
  "unbeatenSessions",
  "dominatedSessions",
] as const satisfies readonly AchievementMetric[];

type SessionEventMetric = (typeof SESSION_EVENT_METRICS)[number];

const isSessionEventMetric = (
  metric: AchievementMetric,
): metric is SessionEventMetric =>
  (SESSION_EVENT_METRICS as readonly AchievementMetric[]).includes(metric);

const NO_SESSIONS: ReadonlySet<string> = new Set();

/** 평점 진행도에 경기 직후 복식 평점을 반영한다 */
const applyDoublesRating = (
  metrics: Record<AchievementMetric, number>,
  rating: number,
) => {
  metrics.peakDoublesRating = Math.max(metrics.peakDoublesRating, rating);
  metrics.lowestDoublesRating = Math.min(metrics.lowestDoublesRating, rating);
};

/** 진행도가 목표에 닿았는지. 낮은 평점은 목표 이하일 때다 */
const isTargetReached = (
  metric: AchievementMetric,
  value: number,
  target: number,
) => (metric === "lowestDoublesRating" ? value <= target : value >= target);

/** 아직 받지 않은 경기 단위 업적 중 진행도가 목표에 닿은 것을 이 경기로 받은 것으로 정한다 */
const markReachedAchievements = (
  progress: AchievementProgress[],
  metrics: Readonly<Record<AchievementMetric, number>>,
  match: CountedMatch,
) => {
  for (const item of progress) {
    if (item.earned) continue;
    const metric = ACHIEVEMENT_METRIC_BY_ID.get(item.id)!;
    if (isSessionEventMetric(metric)) continue;
    if (isTargetReached(metric, metrics[metric], item.target)) {
      item.earned = true;
      item.earnedAt = match.completedAt;
      item.earnedMatchId = match.id;
    }
  }
};

/**
 * 집계 시작 시각 start 이후 완료 경기만으로 모든 업적 진행 상태를 계산한다(ACHIEVEMENTS 순서).
 * start가 null이면 전체 기록을 센다. computeAchievements가 시작 시각마다 한 번씩 부르고,
 * 각 업적은 자기 지표의 시작 시각으로 돌린 결과만 쓴다.
 * 평점 지표만 시작 시각 전 경기도 본다: 복식 경기 수는 전체 기록으로 세고,
 * 평점은 시작 시각 전 마지막 복식 경기 직후 평점에서 시작한다.
 */
const computeProgressSince = (
  playerId: string,
  playerMatches: readonly CountedMatch[],
  start: Date | null,
  dominatedSessionIds: ReadonlySet<string>,
): AchievementProgress[] => {
  const metrics: Record<AchievementMetric, number> = {
    matches: 0,
    wins: 0,
    bestStreak: 0,
    perfectWins: 0,
    hardWonWins: 0,
    deuceWins: 0,
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
    dominatedSessions: 0,
    peakDoublesRating: 0,
    // 센 평점이 없으면 Infinity이고, 진행도에는 0으로 넣는다
    lowestDoublesRating: Infinity,
  };
  const progress: AchievementProgress[] = ACHIEVEMENTS.map((definition) => ({
    id: definition.id,
    earned: false,
    earnedAt: null,
    earnedMatchId: null,
    current: 0,
    target: definition.target,
  }));

  const isCounted = (match: CountedMatch) =>
    start == null || match.completedAt.getTime() >= start.getTime();
  const countedMatches = playerMatches.filter(isCounted);
  const preStartDoublesMatches = playerMatches.filter(
    (match) => !isCounted(match) && isDoublesMatchType(match.type),
  );

  let ratedDoublesMatches = preStartDoublesMatches.length;
  // 경기 수는 평점 로그 유무와 상관없이 세고, 시작 평점은 평점 로그가 있는 마지막 경기에서 찾는다
  let ratingStart: { match: CountedMatch; rating: number } | null = null;
  for (const match of preStartDoublesMatches) {
    const rating = getDoublesRatingAfter(match, playerId);
    if (rating != null) ratingStart = { match, rating };
  }
  if (
    ratingStart &&
    ratedDoublesMatches >= RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES
  ) {
    applyDoublesRating(metrics, ratingStart.rating);
    markReachedAchievements(progress, metrics, ratingStart.match);
  }

  let streak = 0;
  const partnerMatches = new Map<string, number>();
  const partnerStreaks = new Map<string, number>();
  const opponentMatches = new Map<string, number>();
  const beatenOpponents = new Set<string>();
  /** 이 회원의 직전 경기가 패배면 그 경기의 "KST 날짜|조합" 키, 아니면 null */
  let previousLossKey: string | null = null;
  const sessions = new Map<string, SessionRecord>();

  for (const match of countedMatches) {
    const teamIndex = findTeamIndex(match, playerId)!;
    const scores = match.scores ?? [];
    const winningTeamIndex = getWinningTeamIndex(match);
    const won = winningTeamIndex === teamIndex;

    metrics.matches += 1;
    if (won) {
      metrics.wins += 1;
      streak += 1;
      metrics.bestStreak = Math.max(metrics.bestStreak, streak);
      if (isPerfect(scores, teamIndex)) metrics.perfectWins += 1;
      if (isDeuceGame(scores)) metrics.deuceWins += 1;
      if (isHardWon(scores, teamIndex)) metrics.hardWonWins += 1;
      if (!isDoublesMatchType(match.type)) metrics.singlesWins += 1;
    } else {
      streak = 0;
    }

    // 리벤지는 같은 날 진 조합 그대로 이 회원의 바로 다음 경기에서 이길 때만 센다.
    const revengeKey = `${toKstDateKey(match.completedAt)}|${getLineupKey(match, teamIndex)}`;
    if (won && previousLossKey === revengeKey) metrics.revenges += 1;
    previousLossKey = !won && winningTeamIndex !== null ? revengeKey : null;

    const opponentIds = new Set(
      match.teams[teamIndex === 0 ? 1 : 0].players.map((player) => player.id),
    );
    for (const opponentId of opponentIds) {
      metrics.bestOpponentMatches = Math.max(
        metrics.bestOpponentMatches,
        increment(opponentMatches, opponentId),
      );
      if (won) beatenOpponents.add(opponentId);
    }
    metrics.distinctBeatenOpponents = beatenOpponents.size;

    if (isDoublesMatchType(match.type)) {
      ratedDoublesMatches += 1;
      const partnerIds = new Set(
        match.teams[teamIndex].players
          .map((player) => player.id)
          .filter((id) => id !== playerId),
      );
      for (const partnerId of partnerIds) {
        metrics.bestPartnerMatches = Math.max(
          metrics.bestPartnerMatches,
          increment(partnerMatches, partnerId),
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
        lastMatch: match,
      };
      sessions.set(sessionId, session);
      session.matches += 1;
      session.lastMatch = match;
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

    const doublesRatingAfter = getDoublesRatingAfter(match, playerId);
    if (
      doublesRatingAfter != null &&
      ratedDoublesMatches >= RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES
    ) {
      applyDoublesRating(metrics, doublesRatingAfter);
    }

    markReachedAchievements(progress, metrics, match);
  }

  // 세션 단위 지표는 해당 세션마다 조건을 채운 경기를 모아, 시간순 target번째 경기를 받은 경기로 정한다.
  // 무패 세션: 끝까지 전승인 세션의 전승 4번째 경기. 세션 지배자: 지배 세션의 내 마지막 경기.
  const sessionEventMatches: Record<SessionEventMetric, CountedMatch[]> = {
    unbeatenSessions: [],
    dominatedSessions: [],
  };
  for (const [sessionId, session] of sessions) {
    if (session.allWon && session.qualifiedMatch) {
      sessionEventMatches.unbeatenSessions.push(session.qualifiedMatch);
    }
    if (dominatedSessionIds.has(sessionId)) {
      sessionEventMatches.dominatedSessions.push(session.lastMatch);
    }
  }
  for (const metric of SESSION_EVENT_METRICS) {
    sessionEventMatches[metric].sort(compareCountedMatches);
    metrics[metric] = sessionEventMatches[metric].length;
  }

  for (const item of progress) {
    const metric = ACHIEVEMENT_METRIC_BY_ID.get(item.id)!;
    item.current = Number.isFinite(metrics[metric]) ? metrics[metric] : 0;
    if (isRatingAchievement(item.id)) {
      item.ratedDoublesMatches = ratedDoublesMatches;
    }
    if (isSessionEventMetric(metric) && item.current >= item.target) {
      const earnedMatch = sessionEventMatches[metric][item.target - 1];
      item.earned = true;
      item.earnedAt = earnedMatch.completedAt;
      item.earnedMatchId = earnedMatch.id;
    }
  }
  return progress;
};

/**
 * 한 회원의 업적 진행 상태(ACHIEVEMENTS 순서).
 * 완료 경기만(진행 중·취소 제외) 완료 시각 순으로 훑어, 진행도가 목표에 처음 닿은
 * 경기를 받게 된 경기로, 그 경기 완료 시각을 받은 날로 정한다.
 * 각 업적은 자기 지표의 집계 시작 시각(METRIC_COUNT_START) 이후 경기만 센다. 시작 시각마다
 * computeProgressSince를 따로 돌려, 지표를 추가할 때 시작 시각만 적으면 되게 한다.
 * 승패가 갈리지 않은 경기는 승리에는 세지 않고 연승·콤비 연승·무패 세션·리벤지는 끊는다.
 * 경기 수·단짝·라이벌·세션 진행도에는 센다.
 * 무패 세션은 그 세션의 모든 경기로 판정하므로, 4경기 전승 뒤 같은 세션에서 지면 받지 않은 상태가 된다.
 * 세션 지배자는 경기만으로 알 수 없어 서버가 정한 dominatedSessionIds(이 회원이 지배자로 확정된
 * 끝난 세션)로 세고, 그 세션에서 이 회원의 마지막 경기를 받은 경기로 정한다.
 * 평점 업적은 평점 반영 복식 경기가 RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES개 이상인 뒤의 복식 경기 직후
 * 복식 평점(doublesRatingAfter)의 최고치(낮은 평점 업적은 최저치)로 세므로, 받은 뒤 평점이 바뀌어도 유지된다.
 * 복식 경기 수는 집계 시작 시각 전 경기도 센다. 평점은 집계 시작 시각 시점 평점(그 전 마지막
 * 복식 경기 직후 평점)에서 시작해, 그때 이미 경기 수와 기준을 채웠으면 그 경기로 받는다.
 * 그 전 최고치·최저치는 세지 않는다.
 */
export function computeAchievements(
  playerId: string,
  matches: readonly AchievementMatch[],
  dominatedSessionIds: ReadonlySet<string> = NO_SESSIONS,
): AchievementProgress[] {
  const playerMatches = getPlayerCountedMatches(playerId, matches);
  /** 집계 시작 시각(ms, 전체 기록은 null) → 그 시각부터 계산한 진행 상태 */
  const progressByStart = new Map<number | null, AchievementProgress[]>();
  return ACHIEVEMENTS.map((definition, index) => {
    const start = METRIC_COUNT_START[ACHIEVEMENT_METRIC_BY_ID.get(definition.id)!];
    const key = start?.getTime() ?? null;
    let progress = progressByStart.get(key);
    if (!progress) {
      progress = computeProgressSince(
        playerId,
        playerMatches,
        start,
        dominatedSessionIds,
      );
      progressByStart.set(key, progress);
    }
    return progress[index];
  });
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
 * 세션 지배자는 세션이 끝난 뒤 정해지므로 넣지 않는다.
 * 업적 기준 시각 전 경기로 받은 업적(isEarnedByCountedMatch가 아닌 것)도 넣지 않는다.
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
    ).filter(
      (item) =>
        !earnedBefore.has(item.achievementId) && isEarnedByCountedMatch(item),
    );
  });

const ACHIEVEMENT_ORDER = new Map(
  ACHIEVEMENTS.map((definition, index) => [definition.id, index]),
);

/** 받은 업적 정렬: 받은 시각 → 업적 정의 순서 */
export const compareEarnedAchievements = (
  left: EarnedAchievement,
  right: EarnedAchievement,
): number =>
  left.earnedAt.getTime() - right.earnedAt.getTime() ||
  (ACHIEVEMENT_ORDER.get(left.achievementId) ?? 0) -
    (ACHIEVEMENT_ORDER.get(right.achievementId) ?? 0);

/**
 * 받은 업적 중 확인하지 않은 것. 확인 기록이 없거나 기록의 획득 경기가 지금과 다르면
 * (잃었다가 다른 경기로 다시 받았으면) 미확인이다. 받은 시각 → 업적 정의 순서로 정렬한다.
 */
export const findUnseenAchievements = (
  earned: readonly EarnedAchievement[],
  seen: readonly SeenAchievementRef[],
): EarnedAchievement[] => {
  const seenMatchIdByAchievementId = new Map(
    seen.map((item) => [item.achievementId, item.earnedMatchId]),
  );
  return earned
    .filter(
      (item) =>
        seenMatchIdByAchievementId.get(item.achievementId) !==
        item.earnedMatchId,
    )
    .sort(compareEarnedAchievements);
};

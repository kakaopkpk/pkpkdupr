import type { Player, PlayerRatingChangeLog } from "./player.js";

export const matchTypeValues = [
  "singles",
  "unrestricted-singles",
  "mixed-doubles",
  "men-doubles",
  "women-doubles",
  "unrestricted-doubles",
] as const;

export type MatchType = (typeof matchTypeValues)[number];

export const singlesMatchTypeValues = [
  "singles",
  "unrestricted-singles",
] as const satisfies MatchType[];

export const doublesMatchTypeValues = [
  "mixed-doubles",
  "men-doubles",
  "women-doubles",
  "unrestricted-doubles",
] as const satisfies MatchType[];

export const matchTopLevelTypeValues = ["singles", "doubles"] as const;

export type MatchTopLevelType = (typeof matchTopLevelTypeValues)[number];

export const matchTypeLabels: Record<MatchType, string> = {
  singles: "Singles",
  "unrestricted-singles": "Unrestricted Singles",
  "mixed-doubles": "Mixed Doubles",
  "men-doubles": "Men Doubles",
  "women-doubles": "Women Doubles",
  "unrestricted-doubles": "Unrestricted",
};

export const matchTopLevelTypeLabels: Record<MatchTopLevelType, string> = {
  singles: "Singles",
  doubles: "Doubles",
};

export const isSinglesMatchType = (
  matchType: MatchType,
): matchType is (typeof singlesMatchTypeValues)[number] =>
  singlesMatchTypeValues.includes(
    matchType as (typeof singlesMatchTypeValues)[number],
  );

export const isDoublesMatchType = (
  matchType: MatchType,
): matchType is (typeof doublesMatchTypeValues)[number] =>
  doublesMatchTypeValues.includes(
    matchType as (typeof doublesMatchTypeValues)[number],
  );

export const getMatchTopLevelType = (
  matchType: MatchType,
): MatchTopLevelType => (isSinglesMatchType(matchType) ? "singles" : "doubles");

export const matchSourceValues = [
  "player_created",
  "admin_created",
  "admin_created_result",
] as const;

export type MatchSource = (typeof matchSourceValues)[number];

export const matchSourceLabels: Record<MatchSource, string> = {
  player_created: "일반 생성",
  admin_created: "관리자 예정 경기",
  admin_created_result: "관리자 입력",
};

export const matchModeValues = ["single-game", "best-of-3"] as const;

export type MatchMode = (typeof matchModeValues)[number];

export const DEFAULT_MATCH_MODE: MatchMode = "single-game";

export const matchModeLabels: Record<MatchMode, string> = {
  "single-game": "단판",
  "best-of-3": "2선승",
};

export const getMatchScheduleDurationMinutes = (mode: MatchMode) =>
  mode === "best-of-3" ? 30 : 15;

export const getMatchScheduleDurationMs = (mode: MatchMode) =>
  getMatchScheduleDurationMinutes(mode) * 60 * 1000;

export const MATCH_RESULT_MAX_SCORE_COUNT = 3;

export type MatchStatus = "created" | "completed" | "cancelled";

/** 참가자가 기록을 고칠 수 있는 기간(경기 시작 시각 기준) */
export const MATCH_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 경기 시작 후 24시간 이내(시작 전 포함)면 true */
export const isWithinMatchEditWindow = (
  matchStartsAt: Date,
  now: Date = new Date(),
): boolean => now.getTime() - matchStartsAt.getTime() <= MATCH_EDIT_WINDOW_MS;

export type MatchSessionStatus = "created" | "completed";

export const getMatchSessionStatus = (
  matchStatuses: readonly MatchStatus[],
): MatchSessionStatus =>
  matchStatuses.length > 0 &&
  matchStatuses.every((status) => status === "completed")
    ? "completed"
    : "created";

export interface Team {
  id: string;
  name: string;
  players: Player[];
}

/** 한 세트/게임의 상세 스코어 기록 */
export interface MatchScore {
  scoreA: number;
  scoreB: number;
}

export interface Session {
  id: string;
  name?: string;
  date: Date;
  location: string;
}

export interface ManagedMatchSession {
  id: string;
  name: string;
  date: Date;
  location: string;
  participantIds: string[];
  matchCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchSessionParticipant {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface MatchSessionSummary {
  id: string;
  name: string;
  date: Date;
  location: string;
  status: MatchSessionStatus;
  matchCount: number;
  participants: MatchSessionParticipant[];
  latestCreatedAt: Date;
}

const getMatchWinCounts = (scores: MatchScore[]) =>
  scores.reduce<[number, number]>(
    (wins, score) => {
      if (score.scoreA > score.scoreB) {
        wins[0] += 1;
      } else if (score.scoreB > score.scoreA) {
        wins[1] += 1;
      }

      return wins;
    },
    [0, 0],
  );

export const getMaxScoreCountForMatchMode = (mode: MatchMode) =>
  mode === "single-game" ? 1 : MATCH_RESULT_MAX_SCORE_COUNT;

export const inferMatchModeFromScores = (scores: MatchScore[]): MatchMode => {
  if (scores.length === 1) {
    return "single-game";
  }

  if (scores.length >= 2 && scores.length <= MATCH_RESULT_MAX_SCORE_COUNT) {
    return "best-of-3";
  }

  throw new Error("매치는 단판 또는 2선승만 지원합니다.");
};

export const validateMatchScoresForMode = (
  mode: MatchMode,
  scores: MatchScore[],
) => {
  if (mode === "single-game") {
    if (scores.length !== 1) {
      throw new Error("단판 매치는 스코어를 1개만 입력해야 합니다.");
    }

    return;
  }

  if (scores.length < 2 || scores.length > MATCH_RESULT_MAX_SCORE_COUNT) {
    throw new Error("2선승 매치는 스코어를 2개 또는 3개 입력해야 합니다.");
  }

  let teamWins: [number, number] = [0, 0];

  for (const [index, score] of scores.entries()) {
    if (score.scoreA > score.scoreB) {
      teamWins = [teamWins[0] + 1, teamWins[1]];
    } else if (score.scoreB > score.scoreA) {
      teamWins = [teamWins[0], teamWins[1] + 1];
    }

    const isDecided = teamWins[0] === 2 || teamWins[1] === 2;

    if (isDecided && index < scores.length - 1) {
      throw new Error(
        "2선승 매치는 승부가 결정된 뒤 추가 스코어를 입력할 수 없습니다.",
      );
    }
  }

  const [teamAWins, teamBWins] = getMatchWinCounts(scores);

  if (teamAWins !== 2 && teamBWins !== 2) {
    throw new Error("2선승 매치는 한 팀이 2게임을 먼저 이겨야 합니다.");
  }
};

export interface Match {
  id: string;
  type: MatchType;
  mode: MatchMode;
  source: MatchSource;
  creatorPlayerId: string;
  name?: string;
  session?: Session;
  status: MatchStatus;
  teams: [Team, Team];
  scores?: MatchScore[];
  /** 마지막으로 기록·수정한 참가자와 시각 */
  resultSubmittedByPlayerId: string | null;
  resultSubmittedAt: Date | null;
  location: string;
  courtName?: string;
  matchStartsAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

/** 경기 기록(POST /api/matches)·수정(PUT /api/matches/:matchId) 요청의 한 팀 */
export interface RecordMatchTeamRequest {
  /** "Team A" | "Team B" 표시용. 생략 가능 */
  name?: string;
  playerIds: string[];
}

/** 경기 기록(POST /api/matches)·수정(PUT /api/matches/:matchId) 요청 바디 */
export interface RecordMatchRequest {
  /** 비우거나 생략하면 자동 이름(저장 안 함) */
  name?: string;
  /** 생략하면 서버가 팀 구성으로 추론 */
  type?: MatchType;
  /** 생략하면 scores 개수로 추론 */
  mode?: MatchMode;
  teams: [RecordMatchTeamRequest, RecordMatchTeamRequest];
  location: string;
  /** 단판 1개, 2선승 2~3개. 세트마다 동점 불가 */
  scores: MatchScore[];
}

/** 기록·수정 응답. GET /api/matches/:matchId 응답과 같은 형태다 */
export type RecordedMatchResponse = Match & {
  ratingChanges: PlayerRatingChangeLog[];
};

export type MatchFeedItem =
  | { kind: "match"; match: Match }
  | { kind: "session"; session: MatchSessionSummary };

export interface MatchResult {
  matchId: string;
  winnerTeamIndex: 0 | 1;
  scores: MatchScore[];
  // 경기 결과에 따라 각 선수의 DUPR 평점이 어떻게 변경되었는지 기록
  ratingChanges: Array<{
    playerId: string;
    oldRating: number;
    newRating: number;
  }>;
}

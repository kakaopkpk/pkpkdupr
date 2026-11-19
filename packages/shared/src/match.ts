import type { EarnedAchievement } from "./achievements.js";
import type { Player, PlayerRatingChangeLog } from "./player.js";
import type { MatchSessionKind } from "./session.js";

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

/** 경기 하나에 기록하는 점수 개수. 경기는 단판만 지원한다 */
export const MATCH_SCORE_COUNT = 1;

export type MatchStatus = "created" | "completed" | "cancelled";

/** 회원이 기록을 고칠 수 있는 기간(경기 시작 시각 기준) */
export const MATCH_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 경기 시작 후 24시간 이내(시작 전 포함)면 true */
export const isWithinMatchEditWindow = (
  matchStartsAt: Date,
  now: Date = new Date(),
): boolean => now.getTime() - matchStartsAt.getTime() <= MATCH_EDIT_WINDOW_MS;

/** 점수가 아직 없는 진행 중 경기(status "created")면 true */
export const isMatchInProgress = (match: Pick<Match, "status">): boolean =>
  match.status === "created";

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
  /** 시작·종료 시각("HH:MM", KST). 시각 없는 세션은 생략하거나 null */
  startTime?: string | null;
  endTime?: string | null;
}

export interface ManagedMatchSession {
  id: string;
  name: string;
  date: Date;
  location: string;
  participantIds: string[];
  matchCount: number;
  /** 정기·회원·대회. 정기 세션만 날짜당 하나다 */
  kind: MatchSessionKind;
  /** 시작·종료 시각("HH:MM", KST). 정기 세션은 18:00~22:00, 시각 없이 만든 세션은 null */
  startTime: string | null;
  endTime: string | null;
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

/** 새로 저장하는 점수 목록을 검증한다. 점수는 정확히 MATCH_SCORE_COUNT개여야 한다. */
export const validateMatchScores = (scores: MatchScore[]) => {
  if (scores.length !== MATCH_SCORE_COUNT) {
    throw new Error(`스코어는 ${MATCH_SCORE_COUNT}개만 입력할 수 있습니다.`);
  }
};

/**
 * 점수를 넣거나 고칠 수 있는 경기면 true. 회원 누구나 가능하며
 * 취소 아님 · 시작 후 24시간 이내(isWithinMatchEditWindow)일 때
 */
export const isMatchRecordEditable = (
  match: Pick<Match, "status" | "matchStartsAt">,
  now: Date = new Date(),
): boolean =>
  match.status !== "cancelled" &&
  isWithinMatchEditWindow(match.matchStartsAt, now);

/**
 * 회원이 지울 수 있는 경기면 true. 회원 누구나 가능하며
 * 수정 가능 조건(취소 아님 · 시작 후 24시간 이내)에 더해
 * 이미 시작했고(시작 시각 ≤ now) 완료되지 않은 관리자 예정 경기가 아닐 때
 */
export const isMatchRecordDeletable = (
  match: Pick<Match, "status" | "matchStartsAt" | "source">,
  now: Date = new Date(),
): boolean =>
  isMatchRecordEditable(match, now) &&
  match.matchStartsAt.getTime() <= now.getTime() &&
  (match.source !== "admin_created" || match.status === "completed");

/**
 * 이긴 팀 index. 이긴 게임 수로 정하고, 같으면 총점으로 정한다.
 * 점수가 없거나 총점까지 같으면 null이다.
 */
export const getWinningTeamIndex = (match: {
  scores?: readonly MatchScore[] | null;
}): 0 | 1 | null => {
  if (!match.scores?.length) return null;

  const setWins = match.scores.reduce<[number, number]>(
    ([teamA, teamB], score) => [
      teamA + Number(score.scoreA > score.scoreB),
      teamB + Number(score.scoreB > score.scoreA),
    ],
    [0, 0],
  );
  if (setWins[0] !== setWins[1]) return setWins[0] > setWins[1] ? 0 : 1;

  const points = match.scores.reduce<[number, number]>(
    ([teamA, teamB], score) => [teamA + score.scoreA, teamB + score.scoreB],
    [0, 0],
  );
  if (points[0] === points[1]) return null;
  return points[0] > points[1] ? 0 : 1;
};

export interface Match {
  id: string;
  type: MatchType;
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
  /**
   * 완료 시점에 게스트가 낀 경기면 true. 평점·평점 이력·업적·랭킹 경기 수·프로필 통계·lastPlayedAt에서 빠지고,
   * 경기 목록·피드·기록 탭·세션 경기 목록에는 그대로 나온다. 한 번 true가 되면 게스트가 나중에 정회원이 돼도,
   * 수정(회원·관리자)으로 참가자가 바뀌어도 유지되고, 수정으로 게스트가 새로 들어오면 true가 된다.
   */
  ratingExcluded: boolean;
}

/** 팀에 게스트가 한 명이라도 있으면 true. 경기가 completed가 될 때 ratingExcluded 판정에 쓴다 */
export const hasGuestPlayer = (
  teams: readonly { players: readonly Pick<Player, "isGuest">[] }[],
): boolean =>
  teams.some((team) => team.players.some((player) => player.isGuest));

/**
 * 경기 기록 수정(PUT /api/matches/:matchId) 뒤의 평점 미반영 여부.
 * 처음 completed가 되면 수정 후 팀 구성(nextTeams)의 게스트 여부로 정하고,
 * 이미 completed면 기존 true를 유지하며 수정 후 팀 구성에 게스트가 있으면 true다.
 */
export const resolveRatingExcludedAfterEdit = (
  existing: Pick<Match, "status" | "ratingExcluded">,
  nextTeams: readonly { players: readonly Pick<Player, "isGuest">[] }[],
): boolean => {
  if (existing.status !== "completed") {
    return hasGuestPlayer(nextTeams);
  }
  return existing.ratingExcluded || hasGuestPlayer(nextTeams);
};

/** 수정 기록에서 비교하는 경기 항목 */
export type MatchEditField =
  | "scores"
  | "players"
  | "type"
  | "session"
  | "matchStartsAt"
  | "location"
  | "name";

/**
 * 수정 전·후 경기에서 바뀐 항목. 서버는 빈 배열이면 수정 기록을 남기지 않고, 어드민은 "바뀐 것"으로 보인다.
 * JSON 스냅샷도 받도록 날짜는 문자열이어도 된다.
 */
export const getMatchEditFields = (before: Match, after: Match): MatchEditField[] => {
  const teamPlayerIds = (match: Match) =>
    match.teams.map((team) => team.players.map((player) => player.id).join(",")).join("|");
  const scores = (match: Match) =>
    (match.scores ?? []).map((score) => `${score.scoreA}:${score.scoreB}`).join(",");
  const changed: Record<MatchEditField, boolean> = {
    scores: scores(before) !== scores(after),
    players: teamPlayerIds(before) !== teamPlayerIds(after),
    type: before.type !== after.type,
    session: (before.session?.id ?? null) !== (after.session?.id ?? null),
    matchStartsAt:
      new Date(before.matchStartsAt).getTime() !== new Date(after.matchStartsAt).getTime(),
    location: before.location !== after.location,
    name: (before.name || null) !== (after.name || null),
  };
  return (Object.keys(changed) as MatchEditField[]).filter((field) => changed[field]);
};

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
  teams: [RecordMatchTeamRequest, RecordMatchTeamRequest];
  location: string;
  /** 단판 점수 1개. 동점 불가 */
  scores: MatchScore[];
  /**
   * POST: 회원 세션(오늘) 안에서 기록할 때 지정(null은 생략과 같음). 정기 세션은 시작 시각 규칙으로 자동 지정되므로 무시된다.
   * PUT: 관리자 전용. 문자열이면 그 세션으로 옮기고 null이면 세션에서 뺀다. 생략하면 그대로. 회원이 보내면 403
   */
  sessionId?: string | null;
  /** PUT 관리자 전용. 경기 시각(ISO). 생략하면 그대로. 완료 경기면 completedAt도 같은 만큼 옮긴다. 회원이 보내면 403 */
  matchStartsAt?: string;
  /** PUT /api/matches/:matchId 전용. 마지막으로 본 updatedAt(ISO). 서버 값과 다르면 409 */
  expectedUpdatedAt?: string;
}

/** GET /api/admin/match-deletion-logs 항목 */
export interface AdminMatchDeletionLog {
  id: string;
  matchId: string;
  deletedAt: Date;
  deletedByPlayerId: string;
  /** 지운 회원의 지금 아이디. 회원이 없어졌으면 null */
  deletedByUsername: string | null;
  deletedByAdmin: boolean;
  /** 지운 시점의 경기 전체(스냅샷) */
  match: Match;
}

/** GET /api/admin/match-deletion-logs 응답. 지운 시각 내림차순 */
export interface AdminMatchDeletionLogsResponse {
  logs: AdminMatchDeletionLog[];
}

/** GET /api/admin/match-edit-logs 항목. 이미 완료된 경기를 PUT /api/matches/:matchId로 고친 기록이다 */
export interface AdminMatchEditLog {
  id: string;
  matchId: string;
  editedAt: Date;
  editedByPlayerId: string;
  /** 고친 회원의 지금 아이디. 회원이 없어졌으면 null */
  editedByUsername: string | null;
  editedByAdmin: boolean;
  /** 고치기 전 경기 전체(스냅샷) */
  before: Match;
  /** 고친 직후 경기 전체(스냅샷). 그 뒤 또 고쳤거나 지웠으면 지금 경기와 다를 수 있다 */
  after: Match;
}

/** GET /api/admin/match-edit-logs 응답. 고친 시각 내림차순 */
export interface AdminMatchEditLogsResponse {
  logs: AdminMatchEditLog[];
}

/** POST /api/admin/matches/batch의 경기 한 개 */
export interface AdminBatchMatchItemRequest {
  name?: string;
  type: MatchType;
  teams: [RecordMatchTeamRequest, RecordMatchTeamRequest];
  location: string;
  courtName?: string;
  /** 생략하면 지금 */
  matchStartsAt?: string;
  scores: MatchScore[];
}

/** POST /api/admin/matches/batch 요청 */
export interface AdminBatchMatchRequest {
  /** 기존 세션에 넣을 때. 선수들은 그 세션 참여자로 들어간다 */
  sessionId?: string;
  matches: AdminBatchMatchItemRequest[];
}

/** POST /api/admin/matches/batch 응답(201) */
export interface AdminBatchMatchResponse {
  matches: Match[];
  createdCount: number;
  completedMatchCount: number;
  changedPlayerCount: number;
  ratingChangeLogs: PlayerRatingChangeLog[];
}

/** POST /api/matches/start 요청. 세션과 상관없이 점수 없는 진행 중 경기를 시작한다 */
export interface StartMatchRequest {
  teams: [RecordMatchTeamRequest, RecordMatchTeamRequest];
  /** 원래 경기의 세션(한 판 더) 또는 지금 세션. 오늘 세션일 때만 그 세션에 넣는다 */
  sessionId?: string;
  /** 생략하면 팀 구성으로 추론 */
  type?: MatchType;
  /** 생략하면 세션 장소, 세션도 없으면 기본 장소 */
  location?: string;
}

/** GET /api/matches/in-progress 응답 */
export interface InProgressMatchesResponse {
  matches: Match[];
}

/** GET /api/matches/:matchId 응답 */
export type MatchDetailResponse = Match & {
  ratingChanges: PlayerRatingChangeLog[];
  /**
   * 이 경기로 참가자 전원이 받은 업적(지금 계산 기준, 세션 리포트 achievements와 같은 규칙).
   * 완료 경기가 아니거나 없으면 빈 배열
   */
  achievements: EarnedAchievement[];
};

/** 기록·수정 응답. 경기와 평점 변화는 GET /api/matches/:matchId 응답과 같다 */
export type RecordedMatchResponse = Match & {
  ratingChanges: PlayerRatingChangeLog[];
  /** 이 저장으로 참가자 전원이 새로 받은 업적. 없으면 빈 배열 */
  newAchievements: EarnedAchievement[];
  /** 새 업적을 받은 참가자별 지금 업적 점수 합(새 업적 포함). 새 업적이 없으면 빈 객체 */
  achievementPoints: Record<string, number>;
};

export type MatchFeedItem =
  | { kind: "match"; match: Match }
  | { kind: "session"; session: MatchSessionSummary };

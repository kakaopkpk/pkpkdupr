import cors from "cors";
import express from "express";
import { randomUUID } from "crypto";
import {
  getMatchTopLevelType,
  hasGuestPlayer,
  resolveRatingExcludedAfterEdit,
  isMatchInProgress,
  isSinglesMatchType,
  isMatchRecordDeletable,
  isValidBracketRound,
  isWithinMatchEditWindow,
  matchTypeLabels,
  matchTopLevelTypeValues,
  matchTypeValues,
  type Match,
  type MatchTopLevelType,
  type MatchDetailResponse,
  type MatchScore,
  type RecordMatchRequest,
  type RecordedMatchResponse,
  type StartMatchRequest,
  type InProgressMatchesResponse,
  type Team,
  type Session,
  type ManagedMatchSession,
  type MatchType,
  validateMatchScores,
  type AdminBatchMatchRequest,
  type AdminBatchMatchResponse,
  type AdminCreateBracketMatchRequest,
  type AdminMatchDeletionLogsResponse,
  type AdminMatchEditLogsResponse,
} from "@pkpkdupr/shared/match";
import {
  addKstDays,
  canOpenRegularSession,
  DEFAULT_MATCH_LOCATION,
  getEmptySessionExpiresAt,
  getSessionEndsAt,
  getKstWeekday,
  getRegularSessionDateKeys,
  isInProgressMatchExpired,
  isMatchSessionKind,
  isPastSessionStart,
  isRegularSessionTime,
  isSessionOnToday,
  isValidKstDateKey,
  isValidSessionTimeRange,
  kstDateKeyTimeToDate,
  kstDateKeyToDate,
  MATCH_SESSION_LOCATION_MAX_LENGTH,
  MATCH_SESSION_NAME_MAX_LENGTH,
  REGULAR_SESSION_LOOKAHEAD_DAYS,
  REGULAR_SESSION_WEEKDAYS,
  toKstDateKey,
  type AddMatchSessionGuestRequest,
  type AdminAddRegularSessionSkipRequest,
  type AdminRegularSessionSkip,
  type AdminRegularSessionSkipsResponse,
  type AdminRevertRegularSessionSkipResponse,
  type AdminCreateMatchSessionRequest,
  type AdminUpdateMatchSessionRequest,
  type AddMatchSessionParticipantRequest,
  type CreateMatchSessionRequest,
  type StartSessionMatchRequest,
  type MatchSessionDetail,
  type MatchSessionMember,
  type RegularSessionsCronResponse,
  type TodayMatchSessionsResponse,
  type UpcomingMatchSessionsResponse,
} from "@pkpkdupr/shared/session";
import { isEntityId } from "@pkpkdupr/shared/entityId";
import {
  computeCurrentWinStreaks,
  WIN_STREAK_MIN,
  type WinStreakMatch,
} from "@pkpkdupr/shared/streak";
import {
  hasSpecialMatchOutcome,
  isSpecialMatchKind,
  judgeRecommendedSpecialMatch,
  judgeRematchSpecialMatch,
  type SpecialMatch,
  type SpecialMatchCandidatePlayer,
  type SpecialMatchCelebration,
} from "@pkpkdupr/shared/specialMatch";
import {
  isTournamentPlace,
  type AdminUpdateTournamentPlacementsRequest,
  type TournamentPlace,
} from "@pkpkdupr/shared/tournament";
import {
  ACHIEVEMENTS,
  findNewAchievements,
  findUnseenAchievements,
  sumEarnedAchievementPoints,
  type AchievementHoldersResponse,
  type AchievementMatch,
  type EarnedAchievement,
  type EndedSessions,
  type SeenAchievementRef,
  type UnseenAchievementsResponse,
} from "@pkpkdupr/shared/achievements";
import {
  MATCHMAKING_DEFAULT_COURTS,
  MATCHMAKING_GUEST_RATING,
  clampMatchmakingCourts,
  getMatchmakingSeed,
  recommendDoublesMatches,
  type MatchSessionRecommendationResponse,
  type MatchmakingPlayedMatch,
  type RecommendationPlayer,
  type RecommendedTeam,
} from "@pkpkdupr/shared/matchmaking";
import {
  DUPR_DEFAULT_RATING,
  PLAYER_AFFILIATION_MAX_COUNT,
  PLAYER_AFFILIATION_NAME_MAX_LENGTH,
  PLAYER_STATUS_MESSAGE_MAX_LENGTH,
} from "@pkpkdupr/shared/player";
import type {
  AdminPromoteGuestRequest,
  MemberListPlayer,
  Player,
  PlayerAffiliation,
  PlayerRatingChangeLog,
  PlayerStatus,
} from "@pkpkdupr/shared/player";
import type {
  AchievementRankingResponse,
  MatchSessionHistoryResponse,
  RankingCategory,
  RankingResponse,
  RecordItem,
  RecordsResponse,
} from "@pkpkdupr/shared/ranking";
import type { NewsFeedResponse } from "@pkpkdupr/shared/newsFeed";
import type {
  PendingSessionPraisesResponse,
  SessionPraiseRequest,
  SessionPraiseResponse,
} from "@pkpkdupr/shared/sessionPraise";
import {
  getScheduleMonthDateKeyRange,
  parseScheduleMonth,
  type ScheduleMonthResponse,
  type ScheduleSession,
} from "@pkpkdupr/shared/schedule";
import type {
  AdminRegisterPlayerRequest,
  AdminUpdateUsernameRequest,
  AuthErrorCode,
  AuthErrorResponse,
  MeResponse,
} from "@pkpkdupr/shared/auth";
import { assertRequiredEnv } from "./config/env";
import {
  isDevMockDataEnabled,
  MATCH_STALE_UPDATE_ERROR_MESSAGE,
} from "@pkpkdupr/db";
import { db, initDatabase } from "./db";
import {
  MATCH_ALREADY_STARTED_MESSAGE,
  MatchRepository,
  MatchRepositoryError,
} from "./repositories/MatchRepository";
import {
  AccountRequestError,
  AuthError,
  AuthService,
  type AuthenticatedSession,
  type DuprRecalculationSummary,
} from "./services/AuthService";
import {
  attachMatchRatingChanges,
  groupRatingChangeLogsByMatchId,
  PROFILE_RATING_TREND_WINDOW_DAYS,
  PlayerRatingChartProjectionService,
  selectRatingTrendWindow,
} from "./services/PlayerRatingChartProjectionService";
import {
  buildPeakRating,
  buildPlayerProfileSummary,
} from "./services/PlayerProfileSummaryService";
import {
  buildSpecialMatchCandidatePlayers,
  judgeSpecialMatchOutcome,
  settleSpecialMatch,
} from "./services/SpecialMatchService";
import {
  buildSessionPraiseResponse,
  findPendingSessionPraises,
} from "./services/SessionPraiseService";
import {
  SESSION_HISTORY_DEFAULT_LIMIT,
  SESSION_HISTORY_MAX_LIMIT,
  buildAchievementRankingResponse,
  buildRankingResponse,
  buildRecordsInRange,
  buildRecordsPage,
  buildSessionHistory,
  buildSessionReport,
  countAchievementHolders,
  createRankingContext,
  findAchievementsEarnedByMatches,
  findEndedSessions,
  findPlayerEarnedAchievements,
  parseRecordsCursor,
  type RecordsPageEntry,
  type RankingSession,
  toContextAchievementMatches,
} from "./services/RankingService";
import {
  buildNewsFeedPage,
  parseNewsFeedCursor,
} from "./services/NewsFeedService";
import {
  AvatarValidationError,
  buildAvatarObjectPath,
  buildAvatarPublicUrl,
  deleteAvatarObject,
  deleteAvatarObjectQuietly,
  getOwnedAvatarObjectPath,
  parseAvatarDataUrl,
  uploadAvatarObject,
} from "./services/AvatarStorage";
import { sensitiveResponseHeaders } from "./middleware/sensitiveResponseHeaders";
import { createDataChangeSignalMiddleware } from "./middleware/dataChangeSignal";
import { dataChangeSignal } from "./services/DataChangeSignal";
import { getRuntimeWaitUntil, isEdgeRuntime } from "./runtime";
import {
  createSessionCalendarSync,
  getEnvGoogleCalendarClient,
  type CalendarSessionSnapshot,
} from "./services/SessionCalendarSync";
import {
  isCronSecretMatch,
  RegularSessionCronError,
  runRegularSessionCron,
} from "./services/RegularSessionCron";

const app: express.Express = express();
const PORT = process.env.PORT || 4000;
// 운영 origin은 CORS_ALLOWED_ORIGINS(쉼표 구분)로 주입하고, localhost 개발 origin은 항상 허용한다.
const DEV_ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:3100",
  "http://127.0.0.1:3100",
];
const allowedOrigins = new Set([
  ...DEV_ALLOWED_ORIGINS,
  ...(process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.use(
  cors({
    origin(origin, callback) {
      // 허용되지 않은 origin이면 CORS 헤더 없이 응답해 브라우저가 요청을 차단하게 한다.
      callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(sensitiveResponseHeaders);
// 쓰기 요청이 2xx로 끝나면 Realtime으로 바뀐 데이터 종류 신호를 보낸다(웹이 받아 다시 조회)
app.use(createDataChangeSignalMiddleware(dataChangeSignal));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "pkpkdupr API is running!",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/ping", (_req, res) => {
  res.json({ message: "pong" });
});

const authService = new AuthService();
const matchRepository = new MatchRepository({
  onSessionsChanged: (sessionIds) => sessionCalendarSync.syncSessions(sessionIds),
});
const playerRatingChartProjectionService =
  new PlayerRatingChartProjectionService(matchRepository, authService);
authService.setPlayerRatingChartProjectionRefresher(
  playerRatingChartProjectionService,
);
const playerStatuses: PlayerStatus[] = ["active", "inactive"];
/** 정회원 성별. 게스트만 성별이 없고(null), 정회원 만들기·수정은 성별이 필수다 */
type MemberGender = NonNullable<Player["gender"]>;
const playerGenders: MemberGender[] = ["M", "F"];

type MatchTeamRequest = { name?: string; playerIds?: string[] };

/** 관리자 일괄 등록 요청 본문. 계약(AdminBatchMatchRequest) 밖의 `session` 입력은 400으로 막으려고 받아 둔다 */
type AdminBatchMatchPayload = Partial<AdminBatchMatchRequest> & {
  session?: unknown;
};

type AdminMatchMetadataUpdateRequest = {
  name?: unknown;
  sessionId?: unknown;
  location?: unknown;
  courtName?: unknown;
  matchStartsAt?: unknown;
};

type AdminBulkMatchMetadataUpdateRequest =
  AdminMatchMetadataUpdateRequest & {
    matchIds?: unknown;
  };

const normalizeOptionalName = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const normalizeNullableCourtName = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("코트명은 문자열이어야 합니다.");
  }
  return normalizeOptionalName(value) ?? null;
};

const normalizeMatchStartsAt = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("경기 예정 일시가 필요합니다.");
  }
  const matchStartsAt = new Date(value);
  if (Number.isNaN(matchStartsAt.getTime())) {
    throw new Error("유효한 경기 예정 일시가 필요합니다.");
  }
  return matchStartsAt.toISOString();
};

const parseAdminMatchMetadataUpdate = (
  body: AdminMatchMetadataUpdateRequest,
) => {
  const hasName = Object.prototype.hasOwnProperty.call(body, "name");
  const hasSessionId = Object.prototype.hasOwnProperty.call(body, "sessionId");
  const hasLocation = Object.prototype.hasOwnProperty.call(body, "location");
  const hasCourtName = Object.prototype.hasOwnProperty.call(body, "courtName");
  const hasMatchStartsAt = Object.prototype.hasOwnProperty.call(
    body,
    "matchStartsAt",
  );

  if (
    Object.prototype.hasOwnProperty.call(body, "sessionName") ||
    Object.prototype.hasOwnProperty.call(body, "sessionDate") ||
    Object.prototype.hasOwnProperty.call(body, "sessionLocation")
  ) {
    throw new Error("세션 연결은 sessionId로만 변경할 수 있습니다.");
  }
  if (
    !hasName &&
    !hasSessionId &&
    !hasLocation &&
    !hasCourtName &&
    !hasMatchStartsAt
  ) {
    throw new Error("수정할 필드가 없습니다.");
  }
  if (hasSessionId && body.sessionId !== null) {
    if (typeof body.sessionId !== "string" || !isEntityId(body.sessionId, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }
  }
  const normalizedSessionId: string | null | undefined = hasSessionId
    ? body.sessionId === null
      ? null
      : (body.sessionId as string)
    : undefined;
  const normalizedCourtName = hasCourtName
    ? normalizeNullableCourtName(body.courtName)
    : undefined;
  const normalizedLocation = hasLocation
    ? normalizeOptionalName(body.location)
    : undefined;
  if (hasLocation && !normalizedLocation) {
    throw new Error("매치 장소를 입력해주세요.");
  }
  const normalizedMatchStartsAt = hasMatchStartsAt
    ? normalizeMatchStartsAt(body.matchStartsAt)
    : undefined;

  return {
    ...(hasName ? { name: normalizeOptionalName(body.name) ?? null } : {}),
    ...(hasSessionId ? { sessionId: normalizedSessionId } : {}),
    ...(hasLocation ? { location: normalizedLocation } : {}),
    ...(hasCourtName ? { courtName: normalizedCourtName } : {}),
    ...(hasMatchStartsAt ? { matchStartsAt: normalizedMatchStartsAt } : {}),
  };
};

const isMatchType = (value: unknown): value is MatchType =>
  typeof value === "string" && matchTypeValues.includes(value as MatchType);

const isPlayerGender = (value: unknown): value is MemberGender =>
  typeof value === "string" && playerGenders.includes(value as MemberGender);

const isMixedDoublesTeamValid = (players: Player[]) =>
  players.length === 2 &&
  players.some((player) => player.gender === "M") &&
  players.some((player) => player.gender === "F");

const validateCreateMatchTeams = (
  matchType: MatchType,
  teams: [Player[], Player[]],
) => {
  if (isSinglesMatchType(matchType)) {
    return teams.every((team) => team.length === 1);
  }

  if (matchType === "mixed-doubles") {
    return teams.every(isMixedDoublesTeamValid);
  }

  if (matchType === "men-doubles") {
    return teams.every(
      (team) =>
        team.length === 2 && team.every((player) => player.gender === "M"),
    );
  }

  if (matchType === "women-doubles") {
    return teams.every(
      (team) =>
        team.length === 2 && team.every((player) => player.gender === "F"),
    );
  }

  return teams.every((team) => team.length === 2);
};

const inferMatchTypeFromTeams = (teams: [Player[], Player[]]): MatchType => {
  if (teams.every((team) => team.length === 1)) {
    const [firstPlayer, secondPlayer] = teams.flat();

    if (!firstPlayer || !secondPlayer) {
      throw new Error("유효한 팀 구성이 필요합니다.");
    }

    // 성별 없는 게스트가 끼면 혼성 여부를 알 수 없어 성별 무관 단식으로 본다.
    return firstPlayer.gender == null ||
      secondPlayer.gender == null ||
      firstPlayer.gender === secondPlayer.gender
      ? "unrestricted-singles"
      : "singles";
  }

  if (!teams.every((team) => team.length === 2)) {
    throw new Error("유효한 팀 구성이 필요합니다.");
  }

  const [teamA, teamB] = teams;
  const allPlayers = [...teamA, ...teamB];
  const menCount = allPlayers.filter((player) => player.gender === "M").length;
  const womenCount = allPlayers.filter(
    (player) => player.gender === "F",
  ).length;

  if (isMixedDoublesTeamValid(teamA) && isMixedDoublesTeamValid(teamB)) {
    return "mixed-doubles";
  }

  if (menCount === 4) {
    return "men-doubles";
  }

  if (womenCount === 4) {
    return "women-doubles";
  }

  return "unrestricted-doubles";
};

const normalizeRequestedTeamPlayerIds = (
  teams: [MatchTeamRequest, MatchTeamRequest],
) => {
  const flatPlayerIds = teams.flatMap((team) => team.playerIds ?? []);
  const uniquePlayerIds = new Set(flatPlayerIds);

  if (uniquePlayerIds.size !== flatPlayerIds.length) {
    throw new Error("중복된 멤버가 있습니다.");
  }

  return flatPlayerIds;
};

const buildMatchTeamsFromRequests = (
  teams: [MatchTeamRequest, MatchTeamRequest],
  playersById: Map<string, Player>,
) =>
  teams.map((team, teamIndex) => {
    const playerIds = team.playerIds ?? [];
    const players = playerIds.map((playerId) => playersById.get(playerId));

    if (players.some((player) => !player)) {
      throw new Error("유효하지 않은 멤버가 포함되어 있습니다.");
    }

    return {
      id: `team-${Date.now()}-${teamIndex === 0 ? "a" : "b"}`,
      name: team.name?.trim() || `Team ${teamIndex === 0 ? "A" : "B"}`,
      players: players as Player[],
    };
  }) as [
    { id: string; name: string; players: Player[] },
    { id: string; name: string; players: Player[] },
  ];

const normalizeMatchScores = (scores: unknown): MatchScore[] => {
  if (!Array.isArray(scores)) {
    throw new Error("스코어가 필요합니다.");
  }
  validateMatchScores(scores);

  const [score] = scores as Array<MatchScore | undefined>;
  const scoreA = Number(score?.scoreA);
  const scoreB = Number(score?.scoreB);

  if (
    !Number.isInteger(scoreA) ||
    !Number.isInteger(scoreB) ||
    scoreA < 0 ||
    scoreB < 0 ||
    scoreA === scoreB
  ) {
    throw new Error("스코어가 유효하지 않습니다.");
  }

  return [{ scoreA, scoreB }];
};

const MATCH_RATING_APPLY_FAILURE_MESSAGE =
  "경기는 저장됐지만 평점 반영에 실패했습니다. 관리자에게 평점 재계산을 요청해 주세요.";

/** 경기 기록·수정 요청 검증 실패. status로 400·403을 구분한다. */
class MatchRecordRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MatchRecordRequestError";
  }
}

/**
 * 경기 기록·수정 요청(RecordMatchRequest)을 검증해 저장할 값으로 바꾼다.
 * 요청자는 active여야 한다. 팀 구성에 본인이 없어도 된다.
 * keptPlayers는 active가 아니어도 팀에 둘 수 있는 선수다(관리자 정정에서 경기에 이미 있던 선수).
 */
const prepareRecordedMatch = async (
  body: Partial<RecordMatchRequest> | undefined,
  requesterPlayerId: string,
  keptPlayers: Player[] = [],
) => {
  const { name, type, teams, location, scores } = body ?? {};
  if (type != null && !isMatchType(type)) {
    throw new MatchRecordRequestError("유효한 매치 타입이 필요합니다.", 400);
  }
  if (!Array.isArray(teams) || teams.length !== 2) {
    throw new MatchRecordRequestError("두 팀 구성이 필요합니다.", 400);
  }

  const normalizedLocation = normalizeOptionalName(location);
  if (!normalizedLocation) {
    throw new MatchRecordRequestError("장소를 입력해주세요.", 400);
  }

  const normalizedScores = normalizeMatchScores(scores);

  const lineup = await prepareMatchLineup(
    type,
    teams as [MatchTeamRequest, MatchTeamRequest],
    requesterPlayerId,
    keptPlayers,
  );

  return {
    name: normalizeOptionalName(name),
    type: lineup.type,
    teams: lineup.teams,
    location: normalizedLocation,
    scores: normalizedScores,
  };
};

/**
 * 경기 기록·시작 요청의 팀 구성을 검증한다. 요청자는 active여야 하고 팀에 없어도 된다.
 * 선수는 active 회원(게스트 포함)이거나 keptPlayers여야 하며, type을 생략하면 팀 구성으로 추론한다.
 */
const prepareMatchLineup = async (
  type: MatchType | undefined,
  requestedTeams: [MatchTeamRequest, MatchTeamRequest],
  requesterPlayerId: string,
  keptPlayers: Player[] = [],
) => {
  const requester = await authService.getPlayerById(requesterPlayerId);
  if (!requester || requester.status !== "active") {
    throw new MatchRecordRequestError("경기를 기록할 수 없는 계정입니다.", 403);
  }

  const publicPlayers = await authService.getPublicPlayers();
  const playersById = new Map<string, Player>(
    [...keptPlayers, requester, ...publicPlayers].map((player) => [
      player.id,
      player,
    ]),
  );
  normalizeRequestedTeamPlayerIds(requestedTeams);
  const matchTeams = buildMatchTeamsFromRequests(requestedTeams, playersById);
  const resolvedMatchType =
    type ??
    inferMatchTypeFromTeams([matchTeams[0].players, matchTeams[1].players]);
  if (
    !validateCreateMatchTeams(resolvedMatchType, [
      matchTeams[0].players,
      matchTeams[1].players,
    ])
  ) {
    throw new MatchRecordRequestError(
      `${matchTypeLabels[resolvedMatchType]}에 맞는 유효한 팀 구성이 필요합니다.`,
      400,
    );
  }

  return { type: resolvedMatchType, teams: matchTeams };
};

/** RecordMatchRequest.sessionId를 읽는다. 생략·null·빈 문자열은 지정하지 않은 것으로 본다. */
const parseRequestedSessionId = (value: unknown): string | undefined => {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new MatchRecordRequestError("유효한 세션 ID가 필요합니다.", 400);
  }
  return value.trim() || undefined;
};

const ADMIN_ONLY_MATCH_EDIT_FIELDS_MESSAGE =
  "세션·경기 시각은 관리자만 바꿀 수 있어요.";
const MATCH_SESSION_NOT_FOUND_MESSAGE = "세션을 찾을 수 없어요.";

/**
 * 경기 수정(PUT /api/matches/:matchId) 본문의 관리자 전용 필드(sessionId·matchStartsAt)를 읽는다.
 * 관리자가 아닌 회원이 둘 중 하나라도 넣으면 값이 null이어도 403이다. 생략한 필드는 결과에 키가 없다.
 */
const parseAdminMatchEditFields = (
  body: Partial<RecordMatchRequest> | undefined,
  isAdmin: boolean,
): { sessionId?: string | null; matchStartsAt?: Date } => {
  if (!body || typeof body !== "object") {
    return {};
  }
  const hasSessionId = Object.prototype.hasOwnProperty.call(body, "sessionId");
  const hasMatchStartsAt = Object.prototype.hasOwnProperty.call(
    body,
    "matchStartsAt",
  );
  if (!hasSessionId && !hasMatchStartsAt) {
    return {};
  }
  if (!isAdmin) {
    throw new MatchRecordRequestError(ADMIN_ONLY_MATCH_EDIT_FIELDS_MESSAGE, 403);
  }

  const fields: { sessionId?: string | null; matchStartsAt?: Date } = {};
  if (hasSessionId) {
    if (body.sessionId !== null && typeof body.sessionId !== "string") {
      throw new MatchRecordRequestError("유효한 세션 ID가 필요합니다.", 400);
    }
    fields.sessionId = body.sessionId;
  }
  if (hasMatchStartsAt) {
    const matchStartsAt =
      typeof body.matchStartsAt === "string" && body.matchStartsAt.trim()
        ? new Date(body.matchStartsAt)
        : null;
    if (!matchStartsAt || Number.isNaN(matchStartsAt.getTime())) {
      throw new MatchRecordRequestError("유효한 경기 시각이 필요해요.", 400);
    }
    fields.matchStartsAt = matchStartsAt;
  }
  return fields;
};

/**
 * 새 경기의 세션을 정한다.
 * 회원 세션 id면 경기 시작일(KST)과 같은 날 세션일 때만 쓰고, 그 외에는 정기 시간대 규칙을 따른다.
 * 정기 세션 id를 넘겨도 시작 시각이 정기 시간대가 아니면 세션 없이 저장한다.
 */
const resolveSessionForNewMatch = async (
  requestedSessionId: string | undefined,
  matchStartsAt: Date,
): Promise<ManagedMatchSession | undefined> => {
  if (requestedSessionId) {
    const requested = await matchRepository.findSessionById(requestedSessionId);
    if (!requested) {
      throw new MatchRecordRequestError("세션을 찾을 수 없습니다.", 404);
    }
    if (requested.kind !== "regular") {
      if (!isSessionOnToday(requested, matchStartsAt)) {
        throw new MatchRecordRequestError(
          "오늘 세션에서만 경기를 기록할 수 있습니다.",
          403,
        );
      }
      return requested;
    }
  }

  if (!isRegularSessionTime(matchStartsAt)) {
    return undefined;
  }
  const regular = await matchRepository.findOrCreateRegularSession(
    toKstDateKey(matchStartsAt),
  );
  // 회원이 완료한 정기 세션에는 그 뒤 경기를 붙이지 않고 세션 없이 저장한다
  return regular && isSessionOnToday(regular, matchStartsAt)
    ? regular
    : undefined;
};

/**
 * 진행 중 경기 시작(POST /api/matches/start)의 세션을 정한다.
 * 요청 세션이 오늘(KST) 회원 세션이면 그 세션, 그 밖(정기 세션·지난 세션·없는 세션·생략)은 기록과 같은 시간 규칙을 따른다.
 */
const resolveSessionForStartedMatch = async (
  requestedSessionId: string | undefined,
  now: Date,
): Promise<ManagedMatchSession | undefined> => {
  if (requestedSessionId && isEntityId(requestedSessionId, "session")) {
    const requested = await matchRepository.findSessionById(requestedSessionId);
    if (
      requested &&
      requested.kind !== "regular" &&
      isSessionOnToday(requested, now)
    ) {
      return requested;
    }
  }
  return await resolveSessionForNewMatch(undefined, now);
};

type PreparedMatchLineup = Awaited<ReturnType<typeof prepareMatchLineup>>;

/**
 * 점수 없는 진행 중 경기를 만든다. 세션이 있으면 선수를 참여자로 넣는다.
 * 선수 중 누구든 이미 진행 중 경기에 있으면 아무것도 만들지 않고 409로 막는다.
 */
const startInProgressMatch = async ({
  requesterPlayerId,
  lineup,
  session,
  location,
  courtName,
  specialMatch = null,
  now,
}: {
  requesterPlayerId: string;
  lineup: PreparedMatchLineup;
  session: ManagedMatchSession | undefined;
  location: string;
  courtName?: string;
  /** 시작 때 판정한 특수 매치. 생략하면 null */
  specialMatch?: SpecialMatch | null;
  now: Date;
}): Promise<Match> => {
  const result = await matchRepository.createInProgress(
    {
      type: lineup.type,
      teams: lineup.teams,
      scores: [],
      session: session
        ? {
            id: session.id,
            name: session.name,
            date: session.date,
            location: session.location,
          }
        : undefined,
      source: "player_created",
      creatorPlayerId: requesterPlayerId,
      status: "created",
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      location,
      courtName,
      matchStartsAt: now,
      completedAt: null,
      // 평점 미반영 여부는 첫 점수로 completed가 될 때(PUT) 정한다.
      ratingExcluded: false,
      specialMatch,
    },
    now,
  );
  if ("conflictPlayerId" in result) {
    throw toPlayerBusyError(lineup, result.conflictPlayerId);
  }
  return result.match;
};

const toPlayerBusyError = (
  lineup: Pick<PreparedMatchLineup, "teams">,
  busyPlayerId: string,
): MatchRecordRequestError => {
  const busyPlayer = lineup.teams
    .flatMap((team) => team.players)
    .find((player) => player.id === busyPlayerId);
  return new MatchRecordRequestError(
    `${busyPlayer?.username ?? busyPlayerId}님이 다른 경기 중이에요`,
    409,
  );
};

/**
 * 추천 카드 출처 경기의 특수 매치. 서버가 지금 랭킹·연승으로 팀 구성을 다시 판정해 카드가 보여 준 유형과 같을 때만
 * 돌려주고, 다르거나 판정하지 못하면 null이다(시작 요청은 실패시키지 않는다).
 */
const judgeRecommendedSpecialMatchForLineup = async (
  requestedKind: unknown,
  lineup: PreparedMatchLineup,
): Promise<SpecialMatch | null> => {
  // 리벤지는 추천에서 만들지 않는다
  if (!isSpecialMatchKind(requestedKind) || requestedKind === "revenge") {
    return null;
  }
  try {
    const { context } = await loadRankingSource();
    const candidates = buildSpecialMatchCandidatePlayers(
      context,
      getMatchTopLevelType(lineup.type),
      lineup.teams.flatMap((team) => team.players),
    );
    // 빠진 선수가 있으면 줄어든 팀으로 판정하지 않고 판정 실패(null)로 둔다
    const toCandidates = (team: Team) =>
      team.players.map((player) => {
        const candidate = candidates.get(player.id);
        if (!candidate) {
          throw new Error(`특수 매치 판정 후보 없음: ${player.id}`);
        }
        return candidate;
      });
    const judged = judgeRecommendedSpecialMatch([
      toCandidates(lineup.teams[0]),
      toCandidates(lineup.teams[1]),
    ]);
    return judged?.kind === requestedKind ? judged : null;
  } catch (error) {
    console.error("[MATCH] 추천 특수 매치 판정 실패", error);
    return null;
  }
};

/**
 * 같은 멤버로 한 판 더 출처 경기의 리벤지 판정. 원래 경기가 없거나·완료 전이거나·승패가 안 갈렸거나·멤버가 다르면 null이다.
 */
const judgeRematchSpecialMatchForLineup = async (
  rematchOfMatchId: unknown,
  lineup: PreparedMatchLineup,
): Promise<SpecialMatch | null> => {
  if (
    typeof rematchOfMatchId !== "string" ||
    !isEntityId(rematchOfMatchId, "match")
  ) {
    return null;
  }
  const previous = await matchRepository.findById(rematchOfMatchId);
  if (!previous) {
    return null;
  }
  return judgeRematchSpecialMatch(
    [
      lineup.teams[0].players.map((player) => player.id),
      lineup.teams[1].players.map((player) => player.id),
    ],
    previous,
  );
};

/**
 * 세션 find-or-create 같은 쓰기 전에 진행 중 경기에 있는 선수를 미리 막는다.
 * 동시 요청의 최종 판정은 createInProgress의 잠금 트랜잭션이 한다.
 */
const assertPlayersNotInProgress = async (
  lineup: PreparedMatchLineup,
  now: Date,
): Promise<void> => {
  const inProgressPlayerIds = new Set(
    await matchRepository.findInProgressPlayerIds(now),
  );
  const busyPlayerId = getTeamPlayerIds(lineup.teams).find((playerId) =>
    inProgressPlayerIds.has(playerId),
  );
  if (busyPlayerId) {
    throw toPlayerBusyError(lineup, busyPlayerId);
  }
};

/** 공개 세션 API 요청 오류. status로 400·403·404·409를 구분해 응답한다 */
class MatchSessionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MatchSessionRequestError";
  }
}

const sendMatchSessionFailure = (res: express.Response, error: unknown) => {
  const status =
    error instanceof MatchSessionRequestError ||
    error instanceof MatchRepositoryError
      ? error.status
      : 500;
  res.status(status).json({ error: (error as Error).message });
};

/** 세션 이름·장소를 다듬어 돌려준다. 비었거나 maxLength자를 넘으면 400 */
const requireMatchSessionText = (
  value: unknown,
  label: "이름" | "장소",
  maxLength: number,
): string => {
  const isName = label === "이름";
  const text = normalizeOptionalName(value);
  if (!text) {
    throw new MatchSessionRequestError(
      `세션 ${label}${isName ? "이" : "가"} 필요합니다.`,
      400,
    );
  }
  if (Array.from(text).length > maxLength) {
    throw new MatchSessionRequestError(
      `세션 ${label}${isName ? "은" : "는"} ${maxLength}자 이하여야 합니다.`,
      400,
    );
  }
  return text;
};

const loadActivePlayersById = async () =>
  new Map<string, Player>(
    (await authService.getPublicPlayers()).map((player) => [player.id, player]),
  );

/** 참여자는 active 회원만 남긴다(inactive로 바뀐 참여자 행은 응답에서 뺀다) */
const toMatchSessionDetail = (
  session: ManagedMatchSession,
  activePlayersById: Map<string, Player>,
  now: Date,
): MatchSessionDetail => {
  const dateKey = toKstDateKey(session.date);
  const participants = session.participantIds.flatMap(
    (playerId): MatchSessionMember[] => {
      const player = activePlayersById.get(playerId);
      return player
        ? [
            {
              id: player.id,
              username: player.username,
              avatarUrl: player.avatarUrl,
              gender: player.gender,
              duprRating: player.duprRating,
              isGuest: player.isGuest,
            },
          ]
        : [];
    },
  );
  return {
    id: session.id,
    name: session.name,
    kind: session.kind,
    date: session.date,
    location: session.location,
    dateKey,
    startTime: session.startTime,
    endTime: session.endTime,
    completedAt: session.completedAt,
    isToday: isSessionOnToday(session, now),
    participants,
    matchCount: session.matchCount,
  };
};

/** 날짜 키 오름차순, 같은 날은 정기 세션 먼저 */
const compareSessionDetailsByDay = (
  a: Pick<MatchSessionDetail, "dateKey" | "kind">,
  b: Pick<MatchSessionDetail, "dateKey" | "kind">,
) =>
  a.dateKey.localeCompare(b.dateKey) ||
  Number(b.kind === "regular") - Number(a.kind === "regular");

/** 대회 세션 상세에 최종 순위를 붙인다(입력 전이면 빈 배열). 대회가 아닌 세션은 그대로 둔다 */
const attachTournamentPlacements = async <T extends MatchSessionDetail>(
  details: T[],
): Promise<T[]> => {
  const tournamentIds = details
    .filter((detail) => detail.kind === "tournament")
    .map((detail) => detail.id);
  if (!tournamentIds.length) return details;
  const placementsBySession =
    await matchRepository.findTournamentPlacements(tournamentIds);
  return details.map((detail) =>
    detail.kind === "tournament"
      ? { ...detail, placements: placementsBySession.get(detail.id) ?? [] }
      : detail,
  );
};

/** 세션 상세를 만든다. 없으면 undefined. withPlacements가 false면 대회 순위를 읽지 않는다 */
const loadMatchSessionDetail = async (
  sessionId: string,
  now: Date,
  { withPlacements = true }: { withPlacements?: boolean } = {},
): Promise<MatchSessionDetail | undefined> => {
  const [session, activePlayersById] = await Promise.all([
    matchRepository.findSessionById(sessionId),
    loadActivePlayersById(),
  ]);
  if (!session) return undefined;
  const detail = toMatchSessionDetail(session, activePlayersById, now);
  return withPlacements
    ? (await attachTournamentPlacements([detail]))[0]
    : detail;
};

/**
 * 다가오는 세션(끝나기 전 오늘·미래 세션, getSessionEndsAt 기준)을 시각 오름차순으로 돌려준다.
 * 전날 시작해 자정을 넘긴 회원 세션도 끝나기 전까지 들어가도록 전날부터 읽고 끝 시각으로 거른다.
 * 정리가 best-effort라 만료됐지만 아직 남은 빈 세션도 빼고, 경기가 있어 만료 후에도 남은 세션도 넣지 않는다.
 */
const findUpcomingSessions = async (now: Date) =>
  (
    await matchRepository.findSessionsFromDateKey(
      addKstDays(toKstDateKey(now), -1),
    )
  ).filter(
    (session) => getSessionEndsAt(session.kind, session.date, session) > now,
  );

/**
 * 세션 일정을 동호회 구글 캘린더에 반영한다. 세션 쓰기는 matchRepository의 onSessionsChanged로 들어온다.
 * GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON·GOOGLE_CALENDAR_ID가 없으면 아무것도 하지 않는다.
 */
const sessionCalendarSync = createSessionCalendarSync({
  getClient: getEnvGoogleCalendarClient,
  getWebAppUrl: () => process.env.WEB_APP_URL,
  waitUntil: getRuntimeWaitUntil(),
  loadSession: async (sessionId): Promise<CalendarSessionSnapshot | undefined> => {
    const detail = await loadMatchSessionDetail(sessionId, new Date(), {
      withPlacements: false,
    });
    return detail
      ? {
          id: detail.id,
          name: detail.name,
          kind: detail.kind,
          location: detail.location,
          dateKey: detail.dateKey,
          startTime: detail.startTime,
          endTime: detail.endTime,
          participants: detail.participants.map((member) => ({
            username: member.username,
            isGuest: member.isGuest,
          })),
        }
      : undefined;
  },
});

const requireMatchSessionDetail = async (sessionId: string, now: Date) => {
  const detail = await loadMatchSessionDetail(sessionId, now);
  if (!detail) {
    throw new MatchSessionRequestError("세션을 찾을 수 없습니다.", 404);
  }
  return detail;
};

/** 참여자 추가·삭제 대상 세션을 확인한다. 오늘·미래 세션만 되고 지난 세션은 403 */
const requireOpenSessionForParticipants = async (
  sessionId: string,
  now: Date,
) => {
  if (!isEntityId(sessionId, "session")) {
    throw new MatchSessionRequestError("유효한 세션 ID가 필요합니다.", 400);
  }
  const session = await matchRepository.findSessionById(sessionId);
  if (!session) {
    throw new MatchSessionRequestError("세션을 찾을 수 없습니다.", 404);
  }
  // YYYY-MM-DD 날짜 키는 문자열 비교가 날짜 순서와 같다. 자정을 넘긴 진행 중 세션은 아직 오늘 세션이다
  if (
    toKstDateKey(session.date) < toKstDateKey(now) &&
    !isSessionOnToday(session, now)
  ) {
    throw new MatchSessionRequestError(
      "지난 세션은 참여자를 바꿀 수 없습니다.",
      403,
    );
  }
};

const getTeamPlayerIds = (teams: Team[]) =>
  teams.flatMap((team) => team.players.map((player) => player.id));

/** 새 업적을 받은 참가자별 지금 업적 점수 합(만료 세션으로 받은 무패 세션·세션 지배자 업적 포함) */
const findAchievementPointsForNewAchievements = (
  newAchievements: readonly EarnedAchievement[],
  matches: readonly AchievementMatch[],
  endedSessions: EndedSessions,
): Record<string, number> => {
  const playerIds = [...new Set(newAchievements.map((item) => item.playerId))];
  return Object.fromEntries(
    playerIds.map((playerId) => [
      playerId,
      sumEarnedAchievementPoints(
        findPlayerEarnedAchievements(matches, endedSessions, playerId),
      ),
    ]),
  );
};

/**
 * 경기 상세 응답의 업적: 이 경기로 참가자 전원이 받은 업적(세션 리포트 achievements와 같은 규칙).
 * 경기 상세를 막지 않도록 계산이 실패하면 빈 배열로 응답한다
 */
const findAchievementsEarnedByMatch = async (
  match: Match,
): Promise<EarnedAchievement[]> => {
  // 진행 중 경기는 업적 계산에서 빠져 결과가 늘 비므로 원천을 읽지 않는다
  if (match.status !== "completed") return [];
  try {
    const { context, sessions } = await loadRankingSource();
    return findAchievementsEarnedByMatches(
      context,
      findEndedSessions(context, sessions, new Date()),
      new Set([match.id]),
      getTeamPlayerIds(match.teams),
    );
  } catch (err) {
    console.error("[MATCH] 경기 업적 계산 실패", err);
    return [];
  }
};

/** 두 팀 구성이 팀별 선수 집합까지 같은지(팀 안 순서는 상관없음) */
const hasSameTeamPlayers = (
  left: readonly Team[],
  right: readonly Team[],
): boolean =>
  left.length === right.length &&
  left.every((team, index) => {
    const leftIds = new Set(team.players.map((player) => player.id));
    const rightIds = right[index].players.map((player) => player.id);
    return (
      leftIds.size === new Set(rightIds).size &&
      rightIds.every((id) => leftIds.has(id))
    );
  });

/**
 * 평점 반영이 끝난 특수 매치의 결과를 정해 저장하고, 결과가 이번 저장으로 처음 라이벌전 승리·연승 저지·최강자전 승리로
 * 정해졌으면 큰 연출 데이터를 돌려준다. completed 특수 매치는 저장할 때마다 다시 정한다(승패가 같아도 점수 차로
 * 순위가 달라질 수 있고, 첫 판정이 실패해 결과가 null인 경기도 이때 채운다).
 * 평점 잠금 밖에서 반영 직후 랭킹을 다시 읽는다(동호회 규모라 그사이 다른 반영이 끼는 경우는 무시한다).
 * 저장은 이미 끝났으므로 실패하면 결과를 바꾸지 않고 연출 없이 응답한다.
 */
const settleSpecialMatchForSavedMatch = async (
  match: Match,
): Promise<{
  match: Match;
  specialMatchCelebration: SpecialMatchCelebration | null;
}> => {
  const specialMatch = match.specialMatch;
  const completedAt = match.completedAt;
  // 결과가 없는 유형(남복·여복 매치)은 랭킹을 읽지 않는다
  if (
    !specialMatch ||
    !hasSpecialMatchOutcome(specialMatch.kind) ||
    match.status !== "completed" ||
    !completedAt
  ) {
    return { match, specialMatchCelebration: null };
  }
  try {
    const { context } = await loadRankingSource();
    const target = { ...match, completedAt };
    // 결과가 이미 정해져 있던 경기는 연출하지 않으므로 결과만 다시 정한다
    const { outcome, celebration } =
      specialMatch.outcome == null
        ? settleSpecialMatch(context, specialMatch, target)
        : {
            outcome: judgeSpecialMatchOutcome(context, specialMatch, target),
            celebration: null,
          };
    const settled: SpecialMatch = { ...specialMatch, outcome };
    if (outcome !== specialMatch.outcome) {
      await matchRepository.updateSpecialMatch(match.id, settled);
    }
    return {
      match: { ...match, specialMatch: settled },
      specialMatchCelebration: celebration,
    };
  } catch (err) {
    console.error("[MATCH] 특수 매치 결과 판정 실패", match.id, err);
    return { match, specialMatchCelebration: null };
  }
};

/**
 * 기록·수정 응답의 업적 부분: 새 업적과 그 회원들의 업적 점수 합.
 * 랭킹 원천(전체 완료 경기·전원의 평점 로그·세션)을 한 번 읽어 둘 다 계산한다.
 * 저장은 이미 끝났으므로 계산이 실패하면 빈 값으로 응답한다(축하 연출이 "+N점"만 보인다).
 */
const findAchievementsForSavedMatch = async (
  match: Match,
  previous: Match | null,
): Promise<
  Pick<RecordedMatchResponse, "newAchievements" | "achievementPoints">
> => {
  try {
    const { context, sessions } = await loadRankingSource();
    const after = toContextAchievementMatches(context);
    const newAchievements = findNewAchievementsForSavedMatch(
      match,
      previous,
      after,
    );
    return {
      newAchievements,
      achievementPoints:
        newAchievements.length > 0
          ? findAchievementPointsForNewAchievements(
              newAchievements,
              after,
              findEndedSessions(context, sessions, new Date()),
            )
          : {},
    };
  } catch (err) {
    console.error("[MATCH] 새 업적 계산 실패", match.id, err);
    return { newAchievements: [], achievementPoints: {} };
  }
};

/**
 * 경기 저장으로 참가자 전원이 새로 받은 업적. 저장 후 완료 경기 전체(after)와, 그중 이 경기만
 * 저장 전 상태(previous, 완료 경기가 아니었으면 뺌)로 되돌린 목록의 계산 차이로 구한다.
 */
const findNewAchievementsForSavedMatch = (
  match: Match,
  previous: Match | null,
  after: readonly AchievementMatch[],
): EarnedAchievement[] => {
  // 수정 전 평점 로그는 재계산으로 덮어써져 없으므로, 이미 완료였던 경기는 지금 평점을 그대로 붙인다.
  // 그래서 완료 경기 수정으로는 평점 업적·언더독이 새 업적으로 나오지 않는다(미확인 업적 조회로 축하한다).
  const saved = after.find((candidate) => candidate.id === match.id);
  // 저장 전 경기의 세션 표시(개근상 정기·출사표 대회)는 저장 후 목록의 같은 세션 값으로 맞춘다
  const sessionById = new Map(
    after.flatMap((candidate) =>
      candidate.session ? [[candidate.session.id, candidate.session] as const] : [],
    ),
  );
  const before = [
    ...after.filter((candidate) => candidate.id !== match.id),
    ...(previous?.status === "completed"
      ? [
          {
            ...previous,
            session: previous.session
              ? (sessionById.get(previous.session.id) ?? {
                  id: previous.session.id,
                })
              : null,
            doublesRatingAfter: saved?.doublesRatingAfter,
            ratingBefore: saved?.ratingBefore,
          },
        ]
      : []),
  ];
  return findNewAchievements({
    // 게스트는 업적을 받지 않는다
    playerIds: match.teams.flatMap((team) =>
      team.players.flatMap((player) => (player.isGuest ? [] : [player.id])),
    ),
    before,
    after,
  });
};

/** 검증·저장소 오류는 지정된 상태로, 그 밖의 검증 예외는 400으로 응답한다. */
const sendMatchRecordFailure = (res: express.Response, error: unknown) => {
  const status =
    error instanceof MatchRecordRequestError ||
    error instanceof MatchRepositoryError
      ? error.status
      : 400;
  res.status(status).json({ error: (error as Error).message });
};

const authErrorStatus: Record<AuthErrorCode, number> = {
  SESSION_INVALID: 401,
  SESSION_UNAVAILABLE: 503,
  ACCOUNT_NOT_LINKED: 403,
  FORBIDDEN: 403,
};

const sendAuthError = (
  res: express.Response,
  code: AuthErrorCode,
  error: string,
) => {
  const body: AuthErrorResponse = { error, code };
  res.status(authErrorStatus[code]).json(body);
};

/** AuthError는 code대로, 그 밖의 오류(Auth 서버·DB 장애)는 세션을 확인하지 못한 것으로 응답한다. */
const handleAuthFailure = (res: express.Response, error: unknown) => {
  if (error instanceof AuthError) {
    return sendAuthError(res, error.code, error.message);
  }
  console.error("[AUTH] Failed to verify session", error);
  sendAuthError(
    res,
    "SESSION_UNAVAILABLE",
    "세션을 일시적으로 확인하지 못했습니다.",
  );
};

const BEARER_PREFIX = "Bearer ";

const getBearerToken = (req: express.Request, res: express.Response) => {
  const header = req.headers.authorization;
  const token = header?.startsWith(BEARER_PREFIX)
    ? header.slice(BEARER_PREFIX.length).trim()
    : "";
  if (!token) {
    sendAuthError(res, "SESSION_INVALID", "로그인이 필요합니다.");
    return null;
  }
  return token;
};

/**
 * 요청자 세션을 확인한다. requireAdmin과 라우트가 같은 요청에서 다시 부르면
 * Auth 서버를 한 번만 호출하도록 res.locals에 담아 둔다.
 */
const getAuthSession = async (
  req: express.Request,
  res: express.Response,
): Promise<AuthenticatedSession | null> => {
  const cached = res.locals.authSession as AuthenticatedSession | undefined;
  if (cached) {
    return cached;
  }

  const token = getBearerToken(req, res);
  if (!token) {
    return null;
  }

  try {
    const session = await authService.authenticateAccessToken(token);
    res.locals.authSession = session;
    return session;
  } catch (err) {
    handleAuthFailure(res, err);
    return null;
  }
};

const getAuthPayload = async (req: express.Request, res: express.Response) => {
  const session = await getAuthSession(req, res);
  return session?.payload ?? null;
};

const requireAdmin = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const session = await getAuthSession(req, res);
  if (!session) {
    return;
  }
  if (!session.payload.isAdmin) {
    return sendAuthError(res, "FORBIDDEN", "관리자 권한이 필요합니다.");
  }
  next();
};

const toMeResponse = (session: AuthenticatedSession): MeResponse => ({
  ...session.player,
  isAdmin: session.payload.isAdmin,
  isFirstLogin: session.isFirstLogin,
});

/** 계정 관리 요청 오류는 지정한 상태로, 그 밖의 오류는 500으로 `{error}`를 응답한다. */
const sendAccountRequestFailure = (res: express.Response, error: unknown) => {
  const status = error instanceof AccountRequestError ? error.status : 500;
  res.status(status).json({ error: (error as Error).message });
};

app.get("/api/me", async (req, res) => {
  const session = await getAuthSession(req, res);
  if (!session) {
    return;
  }
  res.json(toMeResponse(session));
});

app.post("/api/me/password-changed", async (req, res) => {
  const session = await getAuthSession(req, res);
  if (!session) {
    return;
  }

  try {
    res.json(toMeResponse(await authService.markPasswordChanged(session)));
  } catch (error) {
    sendAccountRequestFailure(res, error);
  }
});

app.get("/api/players", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const [players, lastPlayedAtByPlayerId] = await Promise.all([
      authService.getPublicPlayers(),
      matchRepository.getLastPlayedAtByPlayerId(),
    ]);
    const memberList: MemberListPlayer[] = players.map((player) => ({
      ...player,
      lastPlayedAt: lastPlayedAtByPlayerId[player.id] ?? null,
    }));
    res.json(memberList);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/players/:playerId/profile-summary", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const playerId = req.params.playerId;
    const viewerPlayerId = decoded.playerId;
    // 회원 목록(active만)에 없는 비활성 회원도 이름·상태를 보이도록 요약에 함께 싣는다.
    // 없는 회원이면 평점 차트 projection을 만들기 전에 끝낸다
    const player = await authService.getPlayerById(playerId);
    if (!player) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }
    const now = new Date();
    const [result, ratingChangeLogs, viewerRatingChangeLogs, projection, rankingSource] =
      await Promise.all([
        matchRepository.findByPlayerId(playerId, 0, 10_000),
        matchRepository.getPlayerRatingChangeLogs(playerId),
        // 상대 전적의 "상대가 바꾼 내 평점"용. 본인 프로필이면 필요 없다
        viewerPlayerId === playerId
          ? Promise.resolve([])
          : matchRepository.getPlayerRatingChangeLogs(viewerPlayerId),
        playerRatingChartProjectionService.getOrRebuild(playerId),
        // 무패 세션·세션 지배자(세션 만료)·연승 저지·환영 인사·개근상 업적은 전체 원천이 필요해 함께 읽는다.
        // 실패해도 요약은 돌려주고 업적은 이 회원 경기로만 계산한다.
        loadRankingSource().catch((err) => {
          console.error("[PROFILE] 업적 원천 조회 실패", playerId, err);
          return null;
        }),
      ]);
    const matches = attachMatchRatingChanges(result.matches, ratingChangeLogs);
    const endedSessions = rankingSource
      ? findEndedSessions(rankingSource.context, rankingSource.sessions, now)
      : undefined;
    res.json({
      player,
      peakRating: buildPeakRating(ratingChangeLogs, player.duprRating),
      ...buildPlayerProfileSummary(
        matches,
        playerId,
        selectRatingTrendWindow(
          projection.history,
          PROFILE_RATING_TREND_WINDOW_DAYS,
        ),
        viewerPlayerId,
        now,
        endedSessions,
        groupRatingChangeLogsByMatchId(viewerRatingChangeLogs),
        rankingSource
          ? toContextAchievementMatches(rankingSource.context)
          : undefined,
      ),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** 분류 필터용으로 한 선수의 경기를 한 번에 읽는 상한. 넘는 경기는 필터·total에서 빠진다(동호회 규모라 닿지 않는다). */
const MAX_CATEGORY_FILTER_SCAN = 10_000;

/** 선수 경기를 모두 읽어 메모리에서 분류로 거른 뒤 페이지를 나눈다(동호회 규모). */
const findPlayerMatchesByCategory = async (
  playerId: string,
  category: MatchTopLevelType,
  page: number,
  limit: number,
) => {
  const { matches } = await matchRepository.findByPlayerId(
    playerId,
    0,
    MAX_CATEGORY_FILTER_SCAN,
  );
  const filtered = matches.filter(
    (match) => getMatchTopLevelType(match.type) === category,
  );
  const start = page * limit;
  return {
    matches: filtered.slice(start, start + limit),
    total: filtered.length,
  };
};

app.get("/api/matches", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const page = Number(req.query.page ?? 0);
    const limit = Number(req.query.limit ?? 20);
    const playerId =
      typeof req.query.playerId === "string" ? req.query.playerId : undefined;
    const rawCategory = req.query.category;
    let category: MatchTopLevelType | undefined;
    if (rawCategory !== undefined) {
      if (
        typeof rawCategory !== "string" ||
        !(matchTopLevelTypeValues as readonly string[]).includes(rawCategory)
      ) {
        return res
          .status(400)
          .json({ error: "category는 singles 또는 doubles여야 합니다." });
      }
      if (!playerId) {
        return res
          .status(400)
          .json({ error: "category 필터는 playerId와 함께 써야 합니다." });
      }
      category = rawCategory as MatchTopLevelType;
    }

    await matchRepository.cleanupExpired();
    let result: { matches: Match[]; total: number };
    if (!playerId) {
      result = await matchRepository.findAll(page, limit);
    } else if (category) {
      result = await findPlayerMatchesByCategory(playerId, category, page, limit);
    } else {
      result = await matchRepository.findByPlayerId(playerId, page, limit);
    }

    if (playerId) {
      const ratingChangeLogs = await matchRepository.getPlayerRatingChangeLogs(
        playerId,
      );
      result.matches = attachMatchRatingChanges(
        result.matches,
        ratingChangeLogs,
      );
      return res.json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/match-feed", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const page = Number(req.query.page ?? 0);
    const limit = Number(req.query.limit ?? 20);
    const playerId =
      typeof req.query.playerId === "string" ? req.query.playerId : undefined;
    await matchRepository.cleanupExpired();
    res.json(await matchRepository.findFeed(page, limit, playerId));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/match-sessions/:sessionId/matches", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const sessionId = req.params.sessionId;
    if (!isEntityId(sessionId, "session")) {
      return res.status(400).json({ error: "유효한 세션 ID가 필요합니다." });
    }

    await matchRepository.cleanupExpired();
    res.json(await matchRepository.findBySession(sessionId));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/match-sessions/today", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const dateKey = toKstDateKey(now);
    const [todaySessions, yesterdaySessions, activePlayersById] =
      await Promise.all([
        matchRepository.findSessionsByDateKey(dateKey),
        matchRepository.findSessionsByDateKey(addKstDays(dateKey, -1)),
        loadActivePlayersById(),
      ]);
    // 전날 시작해 자정을 넘긴 회원 세션은 끝나기 전까지 오늘 세션으로 함께 준다
    const sessions = [
      ...yesterdaySessions.filter((session) => isSessionOnToday(session, now)),
      ...todaySessions,
    ];
    // 저장소가 시각 오름차순으로 주므로 정기 세션만 맨 앞으로 옮긴다(정렬은 안정적이다).
    const ordered = [...sessions].sort(
      (a, b) => Number(b.kind === "regular") - Number(a.kind === "regular"),
    );
    const response: TodayMatchSessionsResponse = {
      dateKey,
      regularSessionOpen: canOpenRegularSession(now),
      sessions: await attachTournamentPlacements(
        ordered.map((session) =>
          toMatchSessionDetail(session, activePlayersById, now),
        ),
      ),
    };
    res.json(response);
  } catch (err) {
    sendMatchSessionFailure(res, err);
  }
});

app.get("/api/match-sessions/upcoming", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const now = new Date();
    await matchRepository.cleanupExpired(now);
    // 예약 작업이 실패해도 다음 정기 회차 1개는 조회 때 보장한다(날짜당 하나는 regular_date_key 유니크가 보장).
    // 공휴일·정기 쉬는 날은 만들어지지 않으므로 그다음 정기 회차로 넘어간다.
    for (const regularDateKey of getRegularSessionDateKeys(
      now,
      REGULAR_SESSION_LOOKAHEAD_DAYS,
    )) {
      if (await matchRepository.findOrCreateRegularSession(regularDateKey)) {
        break;
      }
    }
    const dateKey = toKstDateKey(now);
    const [sessions, activePlayersById] = await Promise.all([
      findUpcomingSessions(now),
      loadActivePlayersById(),
    ]);
    const details = await attachTournamentPlacements(
      sessions.map((session) =>
        toMatchSessionDetail(session, activePlayersById, now),
      ),
    );
    // 저장소가 시각 오름차순으로 주므로 날짜 키·정기 여부로만 다시 정렬한다(정렬은 안정적이다).
    details.sort(compareSessionDetailsByDay);
    const response: UpcomingMatchSessionsResponse = {
      dateKey,
      sessions: details,
    };
    res.json(response);
  } catch (err) {
    sendMatchSessionFailure(res, err);
  }
});

app.post("/api/match-sessions/regular/today", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const now = new Date();
    await matchRepository.cleanupExpired(now);
    if (!canOpenRegularSession(now)) {
      throw new MatchSessionRequestError(
        "지금은 정기 세션을 열 수 없습니다.",
        409,
      );
    }
    const session = await matchRepository.findOrCreateRegularSession(
      toKstDateKey(now),
    );
    if (!session) {
      throw new MatchSessionRequestError(
        "오늘은 공휴일이거나 취소되어 정기 세션이 없습니다.",
        409,
      );
    }
    res.json(await requireMatchSessionDetail(session.id, now));
  } catch (err) {
    sendMatchSessionFailure(res, err);
  }
});

/**
 * 세션 만들기 요청(이름·장소·날짜·시각)을 검사해 다듬는다. 날짜를 생략하면 오늘이고, 오늘보다 이르면 400.
 * ignoreTime이면 시각을 읽지 않는다(정기 세션은 시각이 정해져 있다)
 */
const parseCreateMatchSessionRequest = (
  body: Partial<CreateMatchSessionRequest> | undefined,
  now: Date,
  options: { ignoreTime?: boolean } = {},
) => {
  const name = requireMatchSessionText(
    body?.name,
    "이름",
    MATCH_SESSION_NAME_MAX_LENGTH,
  );
  const location = requireMatchSessionText(
    body?.location,
    "장소",
    MATCH_SESSION_LOCATION_MAX_LENGTH,
  );

  const todayKey = toKstDateKey(now);
  const dateKey =
    body?.dateKey == null
      ? todayKey
      : typeof body.dateKey === "string"
        ? body.dateKey.trim()
        : "";
  if (!isValidKstDateKey(dateKey)) {
    throw new MatchSessionRequestError(
      "세션 날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.",
      400,
    );
  }
  // YYYY-MM-DD 날짜 키는 문자열 비교가 날짜 순서와 같다
  if (dateKey < todayKey) {
    throw new MatchSessionRequestError(
      "오늘이나 이후 날짜로만 세션을 만들 수 있습니다.",
      400,
    );
  }
  if (options.ignoreTime) {
    return { name, location, dateKey, startTime: null, endTime: null };
  }

  // 시각을 보내지 않는 이전 클라이언트도 받도록 둘 다 생략하면 시각 없는 세션으로 만든다.
  // 종료가 시작보다 이르면 다음 날 종료이고, 세션 날짜는 시작 시각의 날짜다
  const { startTime = null, endTime = null } = body ?? {};
  if (
    (startTime != null || endTime != null) &&
    !isValidSessionTimeRange(startTime, endTime)
  ) {
    throw new MatchSessionRequestError(
      "세션 시작·종료 시각은 HH:MM 형식으로 함께 보내고, 서로 달라야 합니다.",
      400,
    );
  }
  if (startTime != null && isPastSessionStart(dateKey, startTime, now)) {
    throw new MatchSessionRequestError(
      "이미 지난 시각으로는 세션을 만들 수 없습니다.",
      400,
    );
  }
  return { name, location, dateKey, startTime, endTime };
};

app.post("/api/match-sessions", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const now = new Date();
    const { name, location, dateKey, startTime, endTime } =
      parseCreateMatchSessionRequest(
        req.body as Partial<CreateMatchSessionRequest> | undefined,
        now,
      );

    await matchRepository.cleanupExpired(now);
    // 회원 세션 시각(date)은 시작 시각과 상관없이 고른 날 00:00 KST로 고정해
    // 같은 날 같은 이름은 (name, date) 유니크로 막는다.
    const created = await matchRepository.createSession(
      { name, date: kstDateKeyToDate(dateKey), location, startTime, endTime },
      { conflictOnDuplicate: true },
    );
    res.status(201).json(await requireMatchSessionDetail(created.id, now));
  } catch (err) {
    sendMatchSessionFailure(res, err);
  }
});

app.get("/api/match-sessions/:sessionId", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const sessionId = req.params.sessionId;
    if (!isEntityId(sessionId, "session")) {
      throw new MatchSessionRequestError("유효한 세션 ID가 필요합니다.", 400);
    }
    const now = new Date();
    await matchRepository.cleanupExpired(now);
    res.json(await requireMatchSessionDetail(sessionId, now));
  } catch (err) {
    sendMatchSessionFailure(res, err);
  }
});

/** courts 쿼리: 생략이면 기본값, 숫자가 아니면 400, 숫자면 1~4로 자른다 */
const parseRecommendationCourts = (value: unknown): number => {
  if (value === undefined) {
    return MATCHMAKING_DEFAULT_COURTS;
  }
  const courts = typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (Number.isNaN(courts)) {
    throw new MatchSessionRequestError("courts는 숫자여야 합니다.", 400);
  }
  return clampMatchmakingCourts(courts);
};

/** 0 이상 정수 쿼리 값. 숫자만으로 된 문자열이 아니거나 안전한 정수 범위를 넘으면 NaN */
const parseUnsignedIntegerQuery = (value: unknown): number => {
  const parsed =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(parsed) ? parsed : NaN;
};

/** reroll 쿼리: 생략이면 0(첫 추천), 0 이상 정수가 아니면 400. 순환 주기를 넘으면 추천 함수가 순환한다 */
const parseRecommendationReroll = (value: unknown): number => {
  if (value === undefined) {
    return 0;
  }
  const reroll = parseUnsignedIntegerQuery(value);
  if (Number.isNaN(reroll)) {
    throw new MatchSessionRequestError("reroll은 0 이상 정수여야 합니다.", 400);
  }
  return reroll;
};

/** 추천 매칭 응답·입력의 복식 평점. 게스트는 평점을 보이지 않고(null), 알고리즘은 isGuest로 게스트 평점을 쓴다 */
const getRecommendationDoublesRating = (member: MatchSessionMember) =>
  member.isGuest ? null : (member.duprRating?.doubles ?? null);

const toRecommendationPlayer = (
  member: MatchSessionMember,
  special: SpecialMatchCandidatePlayer | undefined,
): RecommendationPlayer => ({
  id: member.id,
  username: member.username,
  avatarUrl: member.avatarUrl,
  doublesRating: getRecommendationDoublesRating(member),
  doublesRank: special?.rank ?? null,
  winStreak: special?.winStreak ?? 0,
});

app.get("/api/match-sessions/:sessionId/recommendations", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const sessionId = req.params.sessionId;
    if (!isEntityId(sessionId, "session")) {
      throw new MatchSessionRequestError("유효한 세션 ID가 필요합니다.", 400);
    }
    const courts = parseRecommendationCourts(req.query.courts);
    // 옛 rank 쿼리는 읽지 않는다. 업데이트 전 캐시된 웹이 보내도 첫 추천을 돌려준다
    const reroll = parseRecommendationReroll(req.query.reroll);

    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const session = await requireMatchSessionDetail(sessionId, now);
    if (!session.isToday) {
      throw new MatchSessionRequestError(
        "오늘 세션에서만 추천 매칭을 볼 수 있습니다.",
        403,
      );
    }

    const [busyPlayerIds, sessionMatches, rankingSource] = await Promise.all([
      matchRepository.findInProgressPlayerIds(now),
      matchRepository.findBySession(sessionId),
      // 특수 유형·주인공 정보는 부가 정보라 원천 조회가 실패하면 가산점 없이 추천한다
      loadRankingSource().catch((err) => {
        console.error("[RECOMMENDATION] 랭킹 원천 조회 실패", sessionId, err);
        return null;
      }),
    ]);
    // 추천은 복식만이라 특수 유형 판정·주인공 순위는 복식 랭킹 기준이다
    const specialPlayers = rankingSource
      ? buildSpecialMatchCandidatePlayers(
          rankingSource.context,
          "doubles",
          session.participants,
        )
      : undefined;
    const completedMatches: MatchmakingPlayedMatch[] = sessionMatches
      .filter((match) => match.status === "completed")
      .map((match) => ({
        teams: [
          match.teams[0].players.map((player) => player.id),
          match.teams[1].players.map((player) => player.id),
        ],
      }));
    const plan = recommendDoublesMatches({
      participants: session.participants.map((member) => ({
        id: member.id,
        doublesRating: getRecommendationDoublesRating(member),
        isGuest: member.isGuest,
        gender: member.gender,
      })),
      busyPlayerIds,
      completedMatches,
      courts,
      seed: getMatchmakingSeed(sessionId, completedMatches.length),
      reroll,
      specialPlayers,
    });

    // 알고리즘은 participants 안의 id만 돌려주므로 조회가 항상 성공한다.
    const playersById = new Map(
      session.participants.map((member) => [
        member.id,
        toRecommendationPlayer(member, specialPlayers?.get(member.id)),
      ]),
    );
    const playerOf = (id: string) => playersById.get(id)!;
    const guestIds = new Set(
      session.participants
        .filter((member) => member.isGuest)
        .map((member) => member.id),
    );
    // 표시용 팀 평균은 게스트를 팀 나누기와 같은 게스트 평점으로, NR 정회원을 기본 평점(3.0)으로 친다.
    // NR 정회원의 3.0은 팀 나누기에 쓰는 NR 대체값(참여자 중앙값)과 다르다.
    const displayRatingOf = (player: RecommendationPlayer) =>
      guestIds.has(player.id)
        ? MATCHMAKING_GUEST_RATING
        : (player.doublesRating ?? DUPR_DEFAULT_RATING);
    const toTeam = ([first, second]: [string, string]): RecommendedTeam => {
      const players: [RecommendationPlayer, RecommendationPlayer] = [
        playerOf(first),
        playerOf(second),
      ];
      return {
        players,
        averageRating:
          players.reduce(
            (sum, player) => sum + displayRatingOf(player),
            0,
          ) / players.length,
      };
    };

    const response: MatchSessionRecommendationResponse = {
      sessionId,
      requestedCourts: courts,
      reroll: plan.reroll,
      candidateCount: plan.candidateCount,
      courts: plan.courts.map((court) => ({
        teams: [
          toTeam(court.teams[0]),
          toTeam(court.teams[1]),
        ],
        repeatedPartnerPairs: court.repeatedPartnerPairs,
        repeatedOpponentPairs: court.repeatedOpponentPairs,
        specialMatch: court.specialMatch,
      })),
      restingPlayers: plan.restingPlayerIds.map(playerOf),
    };
    res.json(response);
  } catch (err) {
    sendMatchSessionFailure(res, err);
  }
});

app.post("/api/match-sessions/:sessionId/participants", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const body = req.body as
      | Partial<AddMatchSessionParticipantRequest>
      | undefined;
    const playerId =
      typeof body?.playerId === "string" ? body.playerId.trim() : "";
    if (!playerId) {
      throw new MatchSessionRequestError("참여할 회원이 필요합니다.", 400);
    }

    const sessionId = req.params.sessionId;
    const now = new Date();
    await matchRepository.cleanupExpired(now);
    await requireOpenSessionForParticipants(sessionId, now);
    const player = await authService.getPlayerById(playerId);
    if (!player || player.status !== "active") {
      throw new MatchSessionRequestError(
        "활성 회원만 참여자로 추가할 수 있습니다.",
        400,
      );
    }
    // 한 명만 추가(ON CONFLICT DO NOTHING)하므로 동시에 다른 회원을 추가해도 서로 덮어쓰지 않는다.
    await matchRepository.addSessionParticipants(sessionId, [playerId]);
    res.json(await requireMatchSessionDetail(sessionId, now));
  } catch (err) {
    sendMatchSessionFailure(res, err);
  }
});

// 세션 완료: 종료 10분 전부터 자동 완료(정기 22:00, 회원·대회는 종료 시각) 전까지 활성 회원 누구나, 이미 완료됐으면 그대로 돌려준다
app.post("/api/match-sessions/:sessionId/complete", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }
    const sessionId = req.params.sessionId;
    if (!isEntityId(sessionId, "session")) {
      throw new MatchSessionRequestError("유효한 세션 ID가 필요합니다.", 400);
    }
    const now = new Date();
    const [session, activePlayersById] = await Promise.all([
      matchRepository.completeSession(sessionId, now),
      loadActivePlayersById(),
    ]);
    const [detail] = await attachTournamentPlacements([
      toMatchSessionDetail(session, activePlayersById, now),
    ]);
    res.json(detail);
  } catch (err) {
    sendMatchSessionFailure(res, err);
  }
});

app.post("/api/match-sessions/:sessionId/guests", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const body = req.body as Partial<AddMatchSessionGuestRequest> | undefined;
    const username = typeof body?.username === "string" ? body.username : "";

    const sessionId = req.params.sessionId;
    const now = new Date();
    await matchRepository.cleanupExpired(now);
    await requireOpenSessionForParticipants(sessionId, now);
    const guest = await authService.createGuestPlayer({
      username,
      addedByPlayerId: decoded.playerId,
      sessionId,
    });
    matchRepository.notifySessionsChanged([sessionId]);
    res.status(201).json(guest);
  } catch (err) {
    if (err instanceof AccountRequestError) {
      return sendAccountRequestFailure(res, err);
    }
    sendMatchSessionFailure(res, err);
  }
});

app.delete(
  "/api/match-sessions/:sessionId/participants/:playerId",
  async (req, res) => {
    try {
      if (!(await getAuthPayload(req, res))) {
        return;
      }

      const { sessionId, playerId } = req.params;
      const now = new Date();
      await matchRepository.cleanupExpired(now);
      await requireOpenSessionForParticipants(sessionId, now);
      await matchRepository.removeSessionParticipant(sessionId, playerId);
      res.json(await requireMatchSessionDetail(sessionId, now));
    } catch (err) {
      sendMatchSessionFailure(res, err);
    }
  },
);

app.post("/api/match-sessions/:sessionId/matches", async (req, res) => {
  const decoded = await getAuthPayload(req, res);
  if (!decoded) {
    return;
  }

  try {
    const sessionId = req.params.sessionId;
    if (!isEntityId(sessionId, "session")) {
      throw new MatchRecordRequestError("유효한 세션 ID가 필요합니다.", 400);
    }
    const body = req.body as Partial<StartSessionMatchRequest> | undefined;
    const { type, teams, location, courtName, recommendedSpecialKind } =
      body ?? {};
    if (type != null && !isMatchType(type)) {
      throw new MatchRecordRequestError("유효한 매치 타입이 필요합니다.", 400);
    }
    if (!Array.isArray(teams) || teams.length !== 2) {
      throw new MatchRecordRequestError("두 팀 구성이 필요합니다.", 400);
    }
    // 참여자 추가 같은 쓰기 전에 400을 내도록 코트명은 먼저 검증한다.
    const normalizedCourtName = normalizeNullableCourtName(courtName);

    // 시작 시각은 진행 중 만료(2시간)·24시간 수정 기한·정기 세션 판정의 기준이라 서버 now로 정한다.
    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const requestedSession = await matchRepository.findSessionById(sessionId);
    if (!requestedSession) {
      throw new MatchRecordRequestError("세션을 찾을 수 없습니다.", 404);
    }
    if (!isSessionOnToday(requestedSession, now)) {
      throw new MatchRecordRequestError(
        "오늘 세션에서만 경기를 시작할 수 있습니다.",
        403,
      );
    }

    const lineup = await prepareMatchLineup(type, teams, decoded.playerId);
    const specialMatch = await judgeRecommendedSpecialMatchForLineup(
      recommendedSpecialKind,
      lineup,
    );
    const session = await resolveSessionForNewMatch(sessionId, now);
    const match = await startInProgressMatch({
      requesterPlayerId: decoded.playerId,
      lineup,
      session,
      location: normalizeOptionalName(location) ?? requestedSession.location,
      courtName: normalizedCourtName ?? undefined,
      specialMatch,
      now,
    });
    res.status(201).json(match);
  } catch (err) {
    sendMatchRecordFailure(res, err);
  }
});

app.post("/api/matches/start", async (req, res) => {
  const decoded = await getAuthPayload(req, res);
  if (!decoded) {
    return;
  }

  try {
    const body = req.body as Partial<StartMatchRequest> | undefined;
    const { type, teams, location } = body ?? {};
    const requestedSessionId = parseRequestedSessionId(body?.sessionId);
    if (type != null && !isMatchType(type)) {
      throw new MatchRecordRequestError("유효한 매치 타입이 필요합니다.", 400);
    }
    if (!Array.isArray(teams) || teams.length !== 2) {
      throw new MatchRecordRequestError("두 팀 구성이 필요합니다.", 400);
    }

    // 시작 시각은 진행 중 만료(2시간)·24시간 수정 기한·정기 세션 판정의 기준이라 서버 now로 정한다.
    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const lineup = await prepareMatchLineup(type, teams, decoded.playerId);
    await assertPlayersNotInProgress(lineup, now);
    const specialMatch = await judgeRematchSpecialMatchForLineup(
      body?.rematchOfMatchId,
      lineup,
    );
    const session = await resolveSessionForStartedMatch(requestedSessionId, now);
    const match = await startInProgressMatch({
      requesterPlayerId: decoded.playerId,
      lineup,
      session,
      location:
        normalizeOptionalName(location) ??
        session?.location ??
        DEFAULT_MATCH_LOCATION,
      specialMatch,
      now,
    });
    res.status(201).json(match);
  } catch (err) {
    sendMatchRecordFailure(res, err);
  }
});

/**
 * 대진 예정 경기를 시작한다(created, matchStartsAt=지금). 활성 회원 누구나, 경기 세션이 오늘 세션일 때만.
 * 상태·"다른 경기 중" 최종 판정은 진행 중 경기 시작과 같은 잠금 안에서 저장소가 한다.
 */
app.post("/api/matches/:matchId/start", async (req, res) => {
  const decoded = await getAuthPayload(req, res);
  if (!decoded) {
    return;
  }

  try {
    const requester = await authService.getPlayerById(decoded.playerId);
    if (!requester || requester.status !== "active") {
      throw new MatchRecordRequestError("경기를 시작할 수 없는 계정입니다.", 403);
    }

    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const existing = await matchRepository.findById(req.params.matchId);
    if (!existing) {
      throw new MatchRecordRequestError("매치를 찾을 수 없습니다.", 404);
    }
    if (existing.status !== "scheduled") {
      throw new MatchRecordRequestError(MATCH_ALREADY_STARTED_MESSAGE, 409);
    }
    const session = existing.session
      ? await matchRepository.findSessionById(existing.session.id)
      : undefined;
    if (!session || !isSessionOnToday(session, now)) {
      throw new MatchRecordRequestError(
        "대회 날에만 경기를 시작할 수 있어요.",
        409,
      );
    }

    const result = await matchRepository.startScheduled(existing.id, now);
    if ("conflictPlayerId" in result) {
      throw toPlayerBusyError(existing, result.conflictPlayerId);
    }
    res.json(result.match);
  } catch (err) {
    sendMatchRecordFailure(res, err);
  }
});

/** 진행 중 경기 참가자 중 지금 연승이 WIN_STREAK_MIN 이상인 정회원의 연승 수(랭킹 winStreak과 같은 규칙) */
const buildInProgressWinStreaks = (
  matches: readonly Match[],
  completedMatches: readonly WinStreakMatch[],
): Record<string, number> => {
  const streaks = computeCurrentWinStreaks(completedMatches);
  const winStreaks: Record<string, number> = {};
  for (const match of matches) {
    for (const team of match.teams) {
      for (const player of team.players) {
        const streak = streaks.get(player.id) ?? 0;
        if (!player.isGuest && streak >= WIN_STREAK_MIN) {
          winStreaks[player.id] = streak;
        }
      }
    }
  }
  return winStreaks;
};

// "/api/matches/:matchId"보다 먼저 등록해야 "in-progress"를 경기 id로 읽지 않는다.
app.get("/api/matches/in-progress", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const matches = await matchRepository.findInProgress(now);
    // 연승은 완료 경기만으로 센다. 부가 정보라 못 읽어도 진행 중 경기는 돌려준다
    const completedMatches =
      matches.length > 0
        ? await matchRepository.findCompletedMatchOutcomes().catch((err) => {
            console.error("[IN_PROGRESS] 완료 경기 조회 실패", err);
            return null;
          })
        : null;
    const response: InProgressMatchesResponse = {
      matches,
      winStreaks: completedMatches
        ? buildInProgressWinStreaks(matches, completedMatches)
        : {},
    };
    res.json(response);
  } catch (err) {
    sendMatchRecordFailure(res, err);
  }
});

app.post("/api/matches", async (req, res) => {
  const decoded = await getAuthPayload(req, res);
  if (!decoded) {
    return;
  }

  let match: Match;
  try {
    const body = req.body as Partial<RecordMatchRequest> | undefined;
    const requestedSessionId = parseRequestedSessionId(body?.sessionId);
    const prepared = await prepareRecordedMatch(body, decoded.playerId);
    // 시작 시각은 24시간 수정 기한·정기 세션 판정의 기준이므로 클라이언트 값을 받지 않고 서버 now로 정한다.
    const now = new Date();
    const session = await resolveSessionForNewMatch(requestedSessionId, now);
    // 세션이 있으면 저장소가 경기 저장과 같은 트랜잭션에서 팀 선수를 세션 참여자로 넣는다.
    match = await matchRepository.create({
      ...prepared,
      session: session
        ? {
            id: session.id,
            name: session.name,
            date: session.date,
            location: session.location,
          }
        : undefined,
      source: "player_created",
      creatorPlayerId: decoded.playerId,
      status: "completed",
      resultSubmittedByPlayerId: decoded.playerId,
      resultSubmittedAt: now,
      matchStartsAt: now,
      completedAt: now,
      ratingExcluded: hasGuestPlayer(prepared.teams),
    });
  } catch (err) {
    return sendMatchRecordFailure(res, err);
  }

  try {
    const { ratingChangeLogs } =
      await authService.applyMatchResultToRatings(match);
    const response: RecordedMatchResponse = {
      ...match,
      ratingChanges: ratingChangeLogs,
      ...(await findAchievementsForSavedMatch(match, null)),
      // 직접 기록한 경기는 특수 매치가 아니다
      specialMatchCelebration: null,
    };
    res.status(201).json(response);
  } catch (err) {
    console.error("[MATCH] 경기 기록 후 평점 반영 실패", match.id, err);
    res.status(500).json({ error: MATCH_RATING_APPLY_FAILURE_MESSAGE });
  }
});

app.get("/api/admin/match-sessions", requireAdmin, async (_req, res) => {
  try {
    res.json(await matchRepository.findSessions());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** 정기 세션은 정기 요일(월·목)에만 둔다. 다른 요일이면 경기 기록이 정기 시간대 규칙으로 세션을 찾지 못한다 */
const assertRegularSessionWeekday = (dateKey: string) => {
  if (!REGULAR_SESSION_WEEKDAYS.includes(getKstWeekday(dateKey))) {
    throw new MatchSessionRequestError(
      "정기 세션은 월·목에만 둘 수 있어요.",
      400,
    );
  }
};

/**
 * 관리자 세션 만들기. 종류(kind)를 고른다.
 * 회원·대회 세션은 회원 세션 만들기와 같은 규칙이고, 정기 세션은 그 날짜의 정기 세션(18:00~21:00)이 된다
 */
app.post("/api/admin/match-sessions", requireAdmin, async (req, res) => {
  try {
    const body = req.body as Partial<AdminCreateMatchSessionRequest> | undefined;
    const kind = body?.kind;
    if (!isMatchSessionKind(kind)) {
      throw new MatchSessionRequestError(
        "세션 종류는 regular, custom, tournament 중 하나여야 합니다.",
        400,
      );
    }
    const now = new Date();
    const { name, location, dateKey, startTime, endTime } =
      parseCreateMatchSessionRequest(body, now, {
        ignoreTime: kind === "regular",
      });
    if (kind === "regular") assertRegularSessionWeekday(dateKey);

    await matchRepository.cleanupExpired(now);
    const created =
      kind === "regular"
        ? await matchRepository.createRegularSession(dateKey, { name, location })
        : await matchRepository.findSessionById(
            (
              await matchRepository.createSession(
                {
                  name,
                  date: kstDateKeyToDate(dateKey),
                  location,
                  startTime,
                  endTime,
                },
                { conflictOnDuplicate: true, kind },
              )
            ).id,
          );
    if (!created) {
      throw new MatchSessionRequestError("세션을 찾을 수 없습니다.", 404);
    }
    res.status(201).json(created);
  } catch (err) {
    sendMatchSessionFailure(res, err);
  }
});

app.delete(
  "/api/admin/match-sessions/:sessionId",
  requireAdmin,
  async (req, res) => {
    try {
      if (!isEntityId(req.params.sessionId, "session")) {
        return res.status(400).json({ error: "유효한 세션 ID가 필요합니다." });
      }
      // 오늘·미래 자동 정기 세션을 지우면 그 날짜는 정기 쉬는 날로 남아 다시 만들어지지 않는다
      await matchRepository.deleteSession(req.params.sessionId, new Date());
      res.status(204).send();
    } catch (err) {
      if (err instanceof MatchRepositoryError && err.status === 404) {
        return res.status(404).json({ error: err.message });
      }
      if (err instanceof MatchRepositoryError && err.status === 409) {
        return res.status(409).json({ error: err.message });
      }
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

/**
 * 세션의 이름·장소·종류·날짜·시각을 고친다. 생략한 필드는 그대로 둔다.
 * - 이름·장소·종류는 지난 세션을 포함한 모든 세션에서 고친다
 * - 날짜·시각은 오늘·미래의 정기가 아닌 세션(바꾼 뒤 종류 기준)만 고치고, 경기가 있는 세션은 날짜를 바꿀 수 없다(경기 시각과 세션 날짜가 어긋나므로)
 */
app.patch(
  "/api/admin/match-sessions/:sessionId",
  requireAdmin,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      if (!isEntityId(sessionId, "session")) {
        throw new MatchSessionRequestError("유효한 세션 ID가 필요합니다.", 400);
      }
      const body = (req.body ?? {}) as AdminUpdateMatchSessionRequest;
      const name =
        body.name === undefined
          ? undefined
          : requireMatchSessionText(
              body.name,
              "이름",
              MATCH_SESSION_NAME_MAX_LENGTH,
            );
      const location =
        body.location === undefined
          ? undefined
          : requireMatchSessionText(
              body.location,
              "장소",
              MATCH_SESSION_LOCATION_MAX_LENGTH,
            );
      if (body.kind !== undefined && !isMatchSessionKind(body.kind)) {
        throw new MatchSessionRequestError(
          "세션 종류는 regular, custom, tournament 중 하나여야 합니다.",
          400,
        );
      }

      const now = new Date();
      const todayKey = toKstDateKey(now);
      let dateKey: string | undefined;
      if (body.dateKey !== undefined) {
        dateKey = typeof body.dateKey === "string" ? body.dateKey.trim() : "";
        if (!isValidKstDateKey(dateKey)) {
          throw new MatchSessionRequestError(
            "세션 날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.",
            400,
          );
        }
        // YYYY-MM-DD 날짜 키는 문자열 비교가 날짜 순서와 같다
        if (dateKey < todayKey) {
          throw new MatchSessionRequestError(
            "오늘이나 이후 날짜로만 바꿀 수 있습니다.",
            400,
          );
        }
      }

      const timeProvided =
        body.startTime !== undefined || body.endTime !== undefined;
      const clearsTime = body.startTime === null && body.endTime === null;
      if (
        timeProvided &&
        !clearsTime &&
        !isValidSessionTimeRange(body.startTime, body.endTime)
      ) {
        throw new MatchSessionRequestError(
          "세션 시작·종료 시각은 HH:MM 형식으로 함께 보내고, 서로 달라야 합니다.",
          400,
        );
      }

      const session = await matchRepository.findSessionById(sessionId);
      if (!session) {
        throw new MatchSessionRequestError("세션을 찾을 수 없습니다.", 404);
      }
      const nextKind = body.kind ?? session.kind;
      const currentDateKey = toKstDateKey(session.date);
      if (nextKind === "regular" && session.kind !== "regular") {
        assertRegularSessionWeekday(currentDateKey);
      }
      if (dateKey !== undefined || timeProvided) {
        if (nextKind === "regular") {
          throw new MatchSessionRequestError(
            "정기 세션 날짜와 시간은 바꿀 수 없어요.",
            409,
          );
        }
        if (currentDateKey < todayKey) {
          throw new MatchSessionRequestError(
            "지난 세션은 날짜와 시간을 바꿀 수 없어요.",
            409,
          );
        }
      }
      const dateChanged = dateKey !== undefined && dateKey !== currentDateKey;
      if (dateChanged && session.matchCount > 0) {
        throw new MatchSessionRequestError(
          "경기가 있는 세션은 날짜를 바꿀 수 없어요.",
          409,
        );
      }

      const startTime = timeProvided
        ? (body.startTime ?? null)
        : session.startTime;
      const endTime = timeProvided ? (body.endTime ?? null) : session.endTime;
      const nextDateKey = dateKey ?? currentDateKey;
      // 이미 시작한 오늘 세션의 이름만 고치는 경우는 막지 않도록, 날짜나 시작 시각이 바뀔 때만 검사한다
      if (
        (dateChanged || startTime !== session.startTime) &&
        startTime != null &&
        isPastSessionStart(nextDateKey, startTime, now)
      ) {
        throw new MatchSessionRequestError(
          "이미 지난 시각으로는 세션을 바꿀 수 없습니다.",
          400,
        );
      }

      // 정기가 아닌 세션 시각(date)은 생성 때처럼 고른 날 00:00 KST다
      const input = {
        name,
        location,
        date: dateChanged ? kstDateKeyToDate(nextDateKey) : undefined,
        ...(timeProvided ? { startTime, endTime } : {}),
      };
      // 종류를 보내면 저장소가 잠근 행의 지금 종류와 비교한다(위에서 읽은 뒤 다른 관리자가 바꿨을 수 있다).
      // 자동 정기 세션은 종류를 바꿀 수 없고(409), 직접 만든 정기 세션을 바꿔도 정기 쉬는 날은 남지 않는다
      const updated =
        body.kind === undefined
          ? await matchRepository.updateSession(sessionId, input)
          : await matchRepository.changeSessionKind(sessionId, body.kind, input);
      res.json(updated);
    } catch (err) {
      sendMatchSessionFailure(res, err);
    }
  },
);

/** 대진 예정 경기의 시각 자리값. 시작 시각 있는 세션은 그날 그 시각, 없으면 세션 date */
const getSessionStartsAt = (session: ManagedMatchSession): Date =>
  session.startTime
    ? kstDateKeyTimeToDate(toKstDateKey(session.date), session.startTime)
    : session.date;

/**
 * 대진 팀 구성을 일괄 등록(POST /api/admin/matches/batch)과 같은 검증·메시지로 확인하고 유형을 추론한다(1:1 단식, 2:2 복식).
 * 선수는 활성 회원(게스트 포함)이어야 하고, 오류는 400이다.
 */
const prepareBracketTeams = async (teams: unknown) => {
  if (!Array.isArray(teams) || teams.length !== 2) {
    throw new MatchSessionRequestError("두 팀 구성이 필요합니다.", 400);
  }
  const requestedTeams = teams as [MatchTeamRequest, MatchTeamRequest];
  let requestedPlayerIds: string[];
  try {
    requestedPlayerIds = normalizeRequestedTeamPlayerIds(requestedTeams);
  } catch (error) {
    throw new MatchSessionRequestError((error as Error).message, 400);
  }
  if (requestedPlayerIds.length === 0) {
    throw new MatchSessionRequestError("참가자를 선택해주세요.", 400);
  }
  // 회원 조회 실패는 팀 구성 오류(400)가 아니라 서버 오류로 남긴다.
  const activePlayers = (await authService.getAllPlayers()).filter(
    (player) => player.status === "active",
  );
  try {
    const matchTeams = buildMatchTeamsFromRequests(
      requestedTeams,
      new Map(activePlayers.map((player) => [player.id, player])),
    );
    const teamPlayers: [Player[], Player[]] = [
      matchTeams[0].players,
      matchTeams[1].players,
    ];
    const type = inferMatchTypeFromTeams(teamPlayers);
    if (!validateCreateMatchTeams(type, teamPlayers)) {
      throw new Error(
        `${matchTypeLabels[type]}에 맞는 유효한 팀 구성이 필요합니다.`,
      );
    }
    return { type, teams: matchTeams };
  } catch (error) {
    throw new MatchSessionRequestError((error as Error).message, 400);
  }
};

/**
 * 대회 세션에 대진 예정 경기(status scheduled, 점수 없음) 하나를 만든다.
 * 팀 선수는 경기 저장 전에 세션 참여자로 넣는다(일괄 등록과 같음).
 */
app.post(
  "/api/admin/match-sessions/:sessionId/bracket-matches",
  requireAdmin,
  async (req, res) => {
    try {
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }
      const body = req.body as
        | Partial<AdminCreateBracketMatchRequest>
        | undefined;
      const now = new Date();
      const session = isEntityId(req.params.sessionId, "session")
        ? await matchRepository.findSessionById(req.params.sessionId)
        : undefined;
      if (!session) {
        throw new MatchSessionRequestError(MATCH_SESSION_NOT_FOUND_MESSAGE, 404);
      }
      if (session.kind !== "tournament") {
        throw new MatchSessionRequestError(
          "대회 세션에만 대진을 만들 수 있어요.",
          409,
        );
      }
      if (
        getEmptySessionExpiresAt(session.kind, session.date, session).getTime() <=
        now.getTime()
      ) {
        throw new MatchSessionRequestError(
          "끝난 세션에는 대진을 만들 수 없어요.",
          409,
        );
      }
      const round = body?.round;
      if (!isValidBracketRound(round)) {
        throw new MatchSessionRequestError(
          "라운드는 1 이상 정수로 입력해 주세요.",
          400,
        );
      }
      const lineup = await prepareBracketTeams(body?.teams);

      // 저장소가 경기 저장과 같은 트랜잭션에서 팀 선수를 세션 참여자로 넣는다.
      const match = await matchRepository.create({
        type: lineup.type,
        teams: lineup.teams,
        scores: [],
        session: {
          id: session.id,
          name: session.name,
          date: session.date,
          location: session.location,
        },
        source: "admin_created",
        creatorPlayerId: decoded.playerId,
        status: "scheduled",
        round,
        resultSubmittedByPlayerId: null,
        resultSubmittedAt: null,
        location: session.location,
        matchStartsAt: getSessionStartsAt(session),
        completedAt: null,
        // 평점 미반영 여부는 첫 점수로 completed가 될 때(PUT) 정한다.
        ratingExcluded: false,
      });
      res.status(201).json(match);
    } catch (err) {
      sendMatchSessionFailure(res, err);
    }
  },
);

/**
 * 요청의 최종 순위를 검사해 순위 오름차순으로 돌려준다. 오류는 400.
 * 선수는 세션 참여자(게스트 포함)여야 하고, 한 사람은 한 순위에만 들어간다
 */
const parseTournamentPlacements = (
  value: unknown,
  participantIds: ReadonlySet<string>,
): { place: TournamentPlace; playerIds: string[] }[] => {
  if (!Array.isArray(value)) {
    throw new MatchSessionRequestError("placements 배열이 필요합니다.", 400);
  }
  const places = new Set<TournamentPlace>();
  const placedPlayerIds = new Set<string>();
  const placements = value.map((item) => {
    const { place, playerIds } = (item ?? {}) as {
      place?: unknown;
      playerIds?: unknown;
    };
    if (!isTournamentPlace(place)) {
      throw new MatchSessionRequestError("순위는 1~3위만 정할 수 있어요.", 400);
    }
    if (places.has(place)) {
      throw new MatchSessionRequestError("순위가 중복됐어요.", 400);
    }
    places.add(place);
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      throw new MatchSessionRequestError("순위마다 1명 이상 골라 주세요.", 400);
    }
    const validPlayerIds: string[] = [];
    for (const playerId of playerIds) {
      if (typeof playerId !== "string" || !participantIds.has(playerId)) {
        throw new MatchSessionRequestError(
          "세션 참여자만 순위에 넣을 수 있어요.",
          400,
        );
      }
      if (placedPlayerIds.has(playerId)) {
        throw new MatchSessionRequestError(
          "한 사람은 한 순위에만 넣을 수 있어요.",
          400,
        );
      }
      placedPlayerIds.add(playerId);
      validPlayerIds.push(playerId);
    }
    return { place, playerIds: validPlayerIds };
  });
  return placements.sort((a, b) => a.place - b.place);
};

/** 대회 세션의 최종 순위를 통째로 바꾼다. 빠진 순위는 비우고, 빈 배열이면 순위를 모두 지운다 */
app.put(
  "/api/admin/match-sessions/:sessionId/placements",
  requireAdmin,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      if (!isEntityId(sessionId, "session")) {
        throw new MatchSessionRequestError("유효한 세션 ID가 필요합니다.", 400);
      }
      const session = await matchRepository.findSessionById(sessionId);
      if (!session) {
        throw new MatchSessionRequestError("세션을 찾을 수 없습니다.", 404);
      }
      if (session.kind !== "tournament") {
        throw new MatchSessionRequestError(
          "대회 세션만 순위를 정할 수 있어요.",
          409,
        );
      }
      const body = (req.body ?? {}) as Partial<AdminUpdateTournamentPlacementsRequest>;
      const placements = parseTournamentPlacements(
        body.placements,
        new Set(session.participantIds),
      );
      await matchRepository.replaceSessionPlacements(sessionId, placements);
      res.json(await requireMatchSessionDetail(sessionId, new Date()));
    } catch (err) {
      sendMatchSessionFailure(res, err);
    }
  },
);

app.get(
  "/api/admin/regular-session-skips",
  requireAdmin,
  async (_req, res) => {
    try {
      const response: AdminRegularSessionSkipsResponse = {
        skips: await matchRepository.findAllRegularSessionSkips(),
      };
      res.json(response);
    } catch (err) {
      sendMatchSessionFailure(res, err);
    }
  },
);

/**
 * 오늘 이후 정기 요일을 정기 쉬는 날로 지정한다. 그날 자동 정기 세션이 있으면 참여자와 함께 지운다(경기가 있으면 409).
 * 직접 만든 정기 세션은 그대로 둔다
 */
app.post(
  "/api/admin/regular-session-skips",
  requireAdmin,
  async (req, res) => {
    try {
      const body = req.body as
        | Partial<AdminAddRegularSessionSkipRequest>
        | undefined;
      const dateKey =
        typeof body?.dateKey === "string" ? body.dateKey.trim() : "";
      if (!isValidKstDateKey(dateKey)) {
        throw new MatchSessionRequestError(
          "날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.",
          400,
        );
      }
      if (dateKey < toKstDateKey(new Date())) {
        throw new MatchSessionRequestError(
          "오늘이나 이후 날짜만 쉬는 날로 정할 수 있어요.",
          400,
        );
      }
      if (!REGULAR_SESSION_WEEKDAYS.includes(getKstWeekday(dateKey))) {
        throw new MatchSessionRequestError(
          "정기 세션 요일(월·목)만 쉬는 날로 정할 수 있어요.",
          400,
        );
      }

      await matchRepository.addRegularSessionCancellation(dateKey);
      const skip: AdminRegularSessionSkip = { dateKey, reason: "canceled" };
      res.status(201).json(skip);
    } catch (err) {
      sendMatchSessionFailure(res, err);
    }
  },
);

/**
 * 정기 쉬는 날을 해제하고 그 날짜의 자동 정기 세션을 바로 다시 만든다(28일 범위와 상관없음).
 * 오늘이고 정기 세션을 열 수 없는 시각(22시 이후)이면 만들지 않는다. 지워졌던 참여 신청은 되살리지 않는다
 */
app.delete(
  "/api/admin/regular-session-skips/:dateKey",
  requireAdmin,
  async (req, res) => {
    try {
      const { dateKey } = req.params;
      if (!isValidKstDateKey(dateKey)) {
        throw new MatchSessionRequestError(
          "날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.",
          400,
        );
      }
      const notFound = () =>
        new MatchSessionRequestError("쉬는 날을 찾을 수 없습니다.", 404);
      const [skip] = await matchRepository.findRegularSessionSkips(
        dateKey,
        addKstDays(dateKey, 1),
      );
      if (!skip) {
        throw notFound();
      }
      if (skip.reason === "holiday") {
        throw new MatchSessionRequestError("공휴일은 되돌릴 수 없어요.", 409);
      }
      const now = new Date();
      const todayKey = toKstDateKey(now);
      if (dateKey < todayKey) {
        throw new MatchSessionRequestError(
          "지난 날짜는 되돌릴 수 없어요.",
          409,
        );
      }
      if (!(await matchRepository.deleteRegularSessionCancellation(dateKey))) {
        throw notFound();
      }

      const canCreate = dateKey !== todayKey || canOpenRegularSession(now);
      const response: AdminRevertRegularSessionSkipResponse = {
        session: canCreate
          ? ((await matchRepository.findOrCreateRegularSession(dateKey)) ??
            null)
          : null,
      };
      res.json(response);
    } catch (err) {
      sendMatchSessionFailure(res, err);
    }
  },
);

/**
 * 매일 예약 작업(GitHub Actions)이 부른다. 오늘부터 4주 안의 정기 회차를 공휴일·정기 쉬는 날을 빼고 미리 만들고,
 * 다가오는 세션의 구글 캘린더 일정을 현재 상태로 다시 쓴다(변경 때 반영이 빠진 일정을 하루 안에 맞춘다).
 * 헤더 x-cron-secret을 함수 secret CRON_SECRET과 비교한다.
 */
app.post("/api/cron/regular-sessions", async (req, res) => {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    console.error("[CRON] CRON_SECRET이 설정되지 않았습니다.");
    return res.status(503).json({ error: "예약 작업이 설정되지 않았습니다." });
  }
  const providedSecret = req.get("x-cron-secret");
  if (!providedSecret || !isCronSecretMatch(providedSecret, expectedSecret)) {
    return res.status(401).json({ error: "인증이 필요합니다." });
  }

  const now = new Date();
  let status = 200;
  let body: RegularSessionsCronResponse | { error: string };
  try {
    body = await runRegularSessionCron({
      now,
      calendarClient: getEnvGoogleCalendarClient(),
      repository: matchRepository,
    });
    console.log("[CRON] 정기 세션 예약 작업 완료", JSON.stringify(body));
  } catch (err) {
    console.error("[CRON] 정기 세션 예약 작업 실패", err);
    if (err instanceof RegularSessionCronError) {
      status = err.status;
      body = { error: err.message };
    } else {
      status = 500;
      body = { error: "정기 세션을 만들지 못했습니다." };
    }
  }

  // 정기 세션 생성 결과와 상관없이 하고, 실패해도 응답은 바꾸지 않는다.
  // Edge가 응답 뒤 작업을 끊지 않도록 응답 전에 마친다.
  try {
    const sessions = await findUpcomingSessions(now);
    await sessionCalendarSync.resyncSessions(sessions.map((session) => session.id));
  } catch (err) {
    console.error("[CRON] 세션 캘린더 일정 다시 쓰기 실패", err);
  }

  res.status(status).json(body);
});

app.post("/api/admin/matches/batch", requireAdmin, async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const {
      matches: payloadMatches,
      sessionId: requestedSessionId,
      session: requestedSession,
    } = (req.body ?? {}) as AdminBatchMatchPayload;
    if (!Array.isArray(payloadMatches) || payloadMatches.length === 0) {
      return res.status(400).json({ error: "한 개 이상의 경기가 필요합니다." });
    }

    if (requestedSession !== undefined) {
      return res
        .status(400)
        .json({ error: "세션은 sessionId로 지정해 주세요." });
    }

    let commonSession: Session | undefined;
    if (requestedSessionId != null) {
      const existingSession =
        typeof requestedSessionId === "string"
          ? await matchRepository.findSessionById(requestedSessionId)
          : undefined;
      if (!existingSession) {
        return res.status(400).json({ error: MATCH_SESSION_NOT_FOUND_MESSAGE });
      }
      commonSession = {
        id: existingSession.id,
        name: existingSession.name,
        date: existingSession.date,
        location: existingSession.location,
      };
    }

    const createdBy = await authService.getPlayerById(decoded.playerId);
    if (!createdBy || createdBy.status !== "active") {
      return res
        .status(403)
        .json({ error: "유효한 관리자 계정이 필요합니다." });
    }

    const allPlayers = await authService.getAllPlayers();
    const availablePlayers = allPlayers.filter(
      (candidate) => candidate.status === "active",
    );
    const playersById = new Map<string, Player>(
      availablePlayers.map((player) => [player.id, player]),
    );
    const matchesToCreate = payloadMatches.map((requestedMatch, index) => {
      const label = `${index + 1}번째 경기`;
      const {
        name,
        type,
        teams,
        location,
        courtName,
        matchStartsAt,
        scores,
      } =
        requestedMatch;

      if (!isMatchType(type)) {
        throw new Error(`${label}: 유효한 매치 타입이 필요합니다.`);
      }

      if (!teams || teams.length !== 2) {
        throw new Error(`${label}: 두 팀 구성이 필요합니다.`);
      }

      const normalizedLocation = normalizeOptionalName(location);
      if (!normalizedLocation) {
        throw new Error(`${label}: 장소를 입력해주세요.`);
      }

      const flatPlayerIds = normalizeRequestedTeamPlayerIds(teams);
      if (flatPlayerIds.length === 0) {
        throw new Error(`${label}: 참가자를 선택해주세요.`);
      }

      const matchTeams = buildMatchTeamsFromRequests(teams, playersById);
      if (
        !validateCreateMatchTeams(type, [
          matchTeams[0].players,
          matchTeams[1].players,
        ])
      ) {
        throw new Error(
          `${label}: ${matchTypeLabels[type]}에 맞는 유효한 팀 구성이 필요합니다.`,
        );
      }

      const matchStartsAtDate = matchStartsAt
        ? new Date(matchStartsAt)
        : new Date();
      if (Number.isNaN(matchStartsAtDate.getTime())) {
        throw new Error(`${label}: 유효한 매치 시작 시간이 필요합니다.`);
      }

      const normalizedScores = normalizeMatchScores(scores);

      return {
        name: normalizeOptionalName(name),
        session: commonSession,
        type,
        source: "admin_created_result" as const,
        creatorPlayerId: createdBy.id,
        status: "completed" as const,
        teams: matchTeams,
        scores: normalizedScores,
        resultSubmittedByPlayerId: createdBy.id,
        resultSubmittedAt: matchStartsAtDate,
        location: normalizedLocation,
        courtName: normalizeNullableCourtName(courtName) ?? undefined,
        matchStartsAt: matchStartsAtDate,
        completedAt: matchStartsAtDate,
        ratingExcluded: hasGuestPlayer(matchTeams),
      };
    });

    // 세션이 있으면 저장소가 경기 저장과 같은 트랜잭션에서 팀 선수를 세션 참여자로 넣는다.
    const createdMatches = commonSession
      ? await matchRepository.createCompletedBatch(matchesToCreate)
      : await Promise.all(matchesToCreate.map((match) => matchRepository.create(match)));
    const ratingResult = await authService.applyMatchResultsToRatings(createdMatches);
    const { ratingChangeLogs, changedPlayerCount } = ratingResult;

    const response: AdminBatchMatchResponse = {
      matches: createdMatches,
      createdCount: createdMatches.length,
      completedMatchCount: createdMatches.length,
      changedPlayerCount,
      ratingChangeLogs,
    };
    res.status(201).json(response);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/admin/matches", requireAdmin, async (_req, res) => {
  try {
    const result = await matchRepository.findAll(0, 10000, undefined, {
      includeScheduled: true,
    });
    res.json(result.matches);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get(
  "/api/admin/match-deletion-logs",
  requireAdmin,
  async (_req, res) => {
    try {
      const [logs, allPlayers] = await Promise.all([
        matchRepository.findDeletionLogs(),
        authService.getAllPlayers(),
      ]);
      const usernameById = new Map(
        allPlayers.map((player) => [player.id, player.username]),
      );
      const response: AdminMatchDeletionLogsResponse = {
        logs: logs.map((log) => ({
          ...log,
          deletedByUsername: usernameById.get(log.deletedByPlayerId) ?? null,
        })),
      };
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.get("/api/admin/match-edit-logs", requireAdmin, async (_req, res) => {
  try {
    const [logs, allPlayers] = await Promise.all([
      matchRepository.findEditLogs(),
      authService.getAllPlayers(),
    ]);
    const usernameById = new Map(
      allPlayers.map((player) => [player.id, player.username]),
    );
    const response: AdminMatchEditLogsResponse = {
      logs: logs.map((log) => ({
        ...log,
        editedByUsername: usernameById.get(log.editedByPlayerId) ?? null,
      })),
    };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get(
  "/api/admin/diagnostics/timestamp-units",
  requireAdmin,
  async (_req, res) => {
    try {
      res.json(await matchRepository.getTimestampUnitAudit());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.patch("/api/admin/matches/bulk-metadata", requireAdmin, async (req, res) => {
  try {
    const body = req.body as AdminBulkMatchMetadataUpdateRequest;
    const matchIds = Array.isArray(body.matchIds)
      ? [...new Set(body.matchIds.filter((matchId): matchId is string =>
          typeof matchId === "string" && matchId.trim().length > 0,
        ))]
      : [];
    if (!matchIds.length) {
      return res.status(400).json({ error: "수정할 매치를 선택해주세요." });
    }

    const update = parseAdminMatchMetadataUpdate(body);
    const matches = [];
    for (const matchId of matchIds) {
      // 세션에 연결하면 저장소가 경기마다 같은 트랜잭션에서 선수를 세션 참여자로 넣는다. 연결 해제(null)는 참여자를 그대로 둔다.
      const match = await matchRepository.updateMetadata(matchId, update);
      if (!match) {
        return res.status(404).json({ error: `매치를 찾을 수 없습니다: ${matchId}` });
      }
      matches.push(match);
    }

    res.json({ matches });
  } catch (err) {
    if (err instanceof MatchRepositoryError && err.status === 404) {
      return res.status(404).json({ error: err.message });
    }
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/matches/:matchId", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    await matchRepository.cleanupExpired();
    const result = await matchRepository.findByIdWithRatingChanges(
      req.params.matchId,
    );
    if (!result) {
      return res.status(404).json({ error: "매치를 찾을 수 없습니다." });
    }

    const response: MatchDetailResponse = {
      ...result.match,
      ratingChanges: result.ratingChanges,
      achievements: await findAchievementsEarnedByMatch(result.match),
    };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete(
  "/api/admin/matches/:matchId",
  requireAdmin,
  async (req, res) => {
    try {
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }

      const matchId = req.params.matchId;
      const deleted = await matchRepository.deleteRecorded(matchId, {
        deletedByPlayerId: decoded.playerId,
        deletedByAdmin: true,
      });
      const recalculation =
        deleted.status === "completed"
          ? await recalculateRatingsAfterMatchDelete(
              matchId,
              "admin-match-delete",
            )
          : EMPTY_DUPR_RECALCULATION_SUMMARY;

      res.json({ deletedMatchId: matchId, ...recalculation });
    } catch (err) {
      if (err instanceof MatchRepositoryError && err.status === 404) {
        return res.status(404).json({ error: err.message });
      }
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

/**
 * 점수 없는 created 경기가 시작 후 2시간을 넘겨 무효가 됐으면 true.
 * 라운드 있는 대진 경기는 지우지 않고 예정으로 되돌리므로 해당하지 않는다.
 */
const isExpiredInProgressMatch = (match: Match, now: Date) =>
  isMatchInProgress(match) &&
  match.round == null &&
  (match.scores?.length ?? 0) === 0 &&
  isInProgressMatchExpired(match.matchStartsAt, now);

const MATCH_ALREADY_DELETED_MESSAGE = "다른 회원이 지운 경기예요";

/** 요청의 expectedUpdatedAt(ISO 문자열). 없으면 undefined, 형식이 틀리면 400 */
const parseExpectedUpdatedAt = (value: unknown): Date | undefined => {
  if (value == null || value === "") {
    return undefined;
  }
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new MatchRecordRequestError(
      "expectedUpdatedAt은 ISO 날짜 문자열이어야 합니다.",
      400,
    );
  }
  return date;
};

/** updated_at은 초 단위로 저장되므로 같은 초면 같은 값으로 본다 */
const isSameUpdatedAt = (expected: Date, actual: Date) =>
  Math.floor(expected.getTime() / 1000) === Math.floor(actual.getTime() / 1000);

/** 평점 재계산이 읽는 경기 수 상한 */
const MAX_RECALCULATION_MATCHES = 10000;

/** 평점 재계산 입력. 평점 쓰기 잠금 안에서 불려 최신 완료 경기 목록을 읽는다 */
const loadCompletedMatches = async () => {
  const { matches } = await matchRepository.findAll(
    0,
    MAX_RECALCULATION_MATCHES,
  );
  return matches.filter((match) => match.status === "completed");
};

const EMPTY_DUPR_RECALCULATION_SUMMARY: DuprRecalculationSummary = {
  ratingChangeLogs: [],
  perMatchLogs: [],
  changedPlayerCount: 0,
  restoredMatchDuprSnapshotCount: 0,
  restoredMatchDuprSnapshotMatchCount: 0,
  perMatchLogCount: 0,
};

/** 평점에 반영돼 있던(completed) 경기를 지운 뒤 평점을 처음부터 다시 계산한다 */
const recalculateRatingsAfterMatchDelete = (
  matchId: string,
  sourceLogIdPrefix: string,
) =>
  authService.recalculateDuprRatings(loadCompletedMatches, {
    source: "manual_recalculation",
    sourceLogId: `${sourceLogIdPrefix}-${matchId}-${Date.now()}-${randomUUID()}`,
    perMatchLogs: true,
  });

/** 회원이 지울 수 없는 경기면 그 이유(403 응답 문구), 지울 수 있으면 null */
const getMatchDeleteForbiddenReason = (
  match: Match,
  now: Date,
): string | null => {
  if (isMatchRecordDeletable(match, now)) {
    return null;
  }
  if (match.status === "cancelled") {
    return "취소된 경기는 지울 수 없습니다.";
  }
  if (!isWithinMatchEditWindow(match.matchStartsAt, now)) {
    return "경기 시작 후 24시간이 지나 지울 수 없습니다. 관리자에게 요청해 주세요.";
  }
  if (match.matchStartsAt.getTime() > now.getTime()) {
    return "아직 시작하지 않은 예정 경기는 지울 수 없습니다.";
  }
  return "완료되지 않은 관리자 예정 경기는 회원이 지울 수 없습니다.";
};

/**
 * 회원 경기 삭제. 활성 회원 누구나 isMatchRecordDeletable인 경기를 지울 수 있다.
 * 평점 재계산 여부는 미리 읽은 상태가 아니라 실제로 지운 행의 상태로 정한다.
 * 경기가 없어진 세션은 빈 세션 정리 규칙(조회 시점 cleanupExpired)을 그대로 따른다.
 */
app.delete("/api/matches/:matchId", async (req, res) => {
  const decoded = await getAuthPayload(req, res);
  if (!decoded) {
    return;
  }

  const matchId = req.params.matchId;
  let deletedStatus: Match["status"];
  try {
    const expectedUpdatedAt = parseExpectedUpdatedAt(
      req.query.expectedUpdatedAt,
    );
    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const existing = await matchRepository.findById(matchId);
    // 정리가 실패해 남아 있어도 만료된 진행 중 경기는 이미 없는 경기로 본다.
    if (!existing || isExpiredInProgressMatch(existing, now)) {
      return res.status(404).json({ error: MATCH_ALREADY_DELETED_MESSAGE });
    }
    if (
      expectedUpdatedAt &&
      !isSameUpdatedAt(expectedUpdatedAt, existing.updatedAt)
    ) {
      return res.status(409).json({ error: MATCH_STALE_UPDATE_ERROR_MESSAGE });
    }
    const forbiddenReason = getMatchDeleteForbiddenReason(existing, now);
    if (forbiddenReason) {
      return res.status(403).json({ error: forbiddenReason });
    }

    ({ status: deletedStatus } = await matchRepository.deleteRecorded(matchId, {
      deletedByPlayerId: decoded.playerId,
      deletedByAdmin: false,
      expectedUpdatedAt,
      notFoundMessage: MATCH_ALREADY_DELETED_MESSAGE,
    }));
  } catch (err) {
    return sendMatchRecordFailure(res, err);
  }

  try {
    if (deletedStatus === "completed") {
      await recalculateRatingsAfterMatchDelete(matchId, "match-delete");
    }
    res.status(204).end();
  } catch (err) {
    console.error("[MATCH] 경기 삭제 후 평점 재계산 실패", matchId, err);
    res.status(500).json({ error: MATCH_RATING_APPLY_FAILURE_MESSAGE });
  }
});

app.put("/api/matches/:matchId", async (req, res) => {
  const decoded = await getAuthPayload(req, res);
  if (!decoded) {
    return;
  }

  const matchId = req.params.matchId;
  let wasCompleted: boolean;
  let previous: Match;
  let match: Match;
  try {
    const body = req.body as Partial<RecordMatchRequest> | undefined;
    const expectedUpdatedAt = parseExpectedUpdatedAt(body?.expectedUpdatedAt);
    const adminEdit = parseAdminMatchEditFields(body, decoded.isAdmin);
    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const existing = await matchRepository.findById(matchId);
    // 정리가 실패해 남아 있어도 만료된 진행 중 경기는 없는 경기로 본다.
    if (!existing || isExpiredInProgressMatch(existing, now)) {
      return res.status(404).json({ error: "매치를 찾을 수 없습니다." });
    }
    if (
      expectedUpdatedAt &&
      !isSameUpdatedAt(expectedUpdatedAt, existing.updatedAt)
    ) {
      return res.status(409).json({ error: MATCH_STALE_UPDATE_ERROR_MESSAGE });
    }
    // 참가자·생성자 여부와 무관하게 활성 회원이면 누구나 고칠 수 있다(세션 경기 포함).
    // 관리자는 24시간이 지난 경기도 정정할 수 있다.
    if (
      !decoded.isAdmin &&
      !isWithinMatchEditWindow(existing.matchStartsAt, now)
    ) {
      return res.status(403).json({
        error:
          "경기 시작 후 24시간이 지나 수정할 수 없습니다. 관리자에게 요청해 주세요.",
      });
    }
    if (existing.status === "cancelled") {
      return res
        .status(409)
        .json({ error: "취소된 경기는 기록을 수정할 수 없습니다." });
    }
    // 회원은 대진 예정 경기를 POST /api/matches/:matchId/start로 시작한 뒤에만 점수를 넣는다(오늘 세션·다른 경기 중 검사).
    // 예정 경기에 바로 점수를 넣는 것은 관리자 정정뿐이다.
    if (existing.status === "scheduled" && !decoded.isAdmin) {
      return res
        .status(409)
        .json({ error: "경기를 시작한 뒤에 점수를 넣어 주세요." });
    }

    const prepared = await prepareRecordedMatch(
      body,
      decoded.playerId,
      // 관리자 정정은 이 경기에 이미 있던 선수를 지금 비활성이어도 그대로 둘 수 있다
      decoded.isAdmin ? existing.teams.flatMap((team) => team.players) : [],
    );
    if (
      typeof adminEdit.sessionId === "string" &&
      !(await matchRepository.findSessionById(adminEdit.sessionId))
    ) {
      return res.status(400).json({ error: MATCH_SESSION_NOT_FOUND_MESSAGE });
    }
    wasCompleted = existing.status === "completed";
    previous = existing;
    // 요청에 없어도 미리 읽은 updatedAt을 조건으로 저장해, 그사이 다른 회원이 고쳤으면 409로 막는다.
    // 그래서 아래 재계산 여부(wasCompleted)는 실제로 고친 행의 이전 상태와 같다.
    // 관리자의 세션·시각 컬럼 변경도 같은 UPDATE로 저장돼 점수·팀과 함께 반영되거나 함께 막힌다.
    // 저장 뒤 경기 세션이 있으면 팀 선수 전원(세션을 옮기면 새 세션)을 같은 트랜잭션에서 세션 참여자로 넣는다.
    // 빠진 선수는 참여자에서 지우지 않는다.
    match = await matchRepository.updateRecordedMatch(matchId, {
      ...prepared,
      ...adminEdit,
      resultSubmittedByPlayerId: decoded.playerId,
      resultSubmittedAt: now,
      ratingExcluded: resolveRatingExcludedAfterEdit(
        existing,
        prepared.teams,
      ),
      // 판정한 선수 구성이 아니게 되면 특수 매치가 아니다
      ...(existing.specialMatch &&
      !hasSameTeamPlayers(existing.teams, prepared.teams)
        ? { specialMatch: null }
        : {}),
      expectedUpdatedAt: expectedUpdatedAt ?? existing.updatedAt,
      // 완료 경기를 고칠 때만 저장소가 수정 기록을 남긴다(첫 점수 입력은 기록이라 남기지 않음)
      editLog: {
        id: `match-edit-${randomUUID()}`,
        editedByAdmin: decoded.isAdmin,
      },
    });
  } catch (err) {
    return sendMatchRecordFailure(res, err);
  }

  try {
    let ratingChanges: PlayerRatingChangeLog[];
    if (wasCompleted) {
      // 증분 반영은 같은 경기의 로그가 이미 있으면 아무것도 하지 않으므로, 반영된 경기를 고치면 전체 재계산한다.
      const { perMatchLogs } = await authService.recalculateDuprRatings(
        loadCompletedMatches,
        {
          source: "manual_recalculation",
          sourceLogId: `match-edit-${matchId}-${Date.now()}-${randomUUID()}`,
          perMatchLogs: true,
        },
      );
      const matchLogPrefix = `match-completed-${matchId}-`;
      ratingChanges = perMatchLogs.filter((log) =>
        log.sourceLogId.startsWith(matchLogPrefix),
      );
    } else {
      ({ ratingChangeLogs: ratingChanges } =
        await authService.applyMatchResultToRatings(match));
    }
    const settled = await settleSpecialMatchForSavedMatch(match);
    const response: RecordedMatchResponse = {
      ...settled.match,
      ratingChanges,
      ...(await findAchievementsForSavedMatch(match, previous)),
      specialMatchCelebration: settled.specialMatchCelebration,
    };
    res.json(response);
  } catch (err) {
    console.error("[MATCH] 경기 기록 수정 후 평점 반영 실패", matchId, err);
    res.status(500).json({ error: MATCH_RATING_APPLY_FAILURE_MESSAGE });
  }
});

const hasOwnProperty = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

const normalizeProfileAffiliations = (value: unknown): PlayerAffiliation[] => {
  if (!Array.isArray(value)) {
    throw new Error("소속은 목록 형식이어야 합니다.");
  }
  if (value.length > PLAYER_AFFILIATION_MAX_COUNT) {
    throw new Error(`소속은 최대 ${PLAYER_AFFILIATION_MAX_COUNT}개까지 등록할 수 있습니다.`);
  }

  const names = new Set<string>();
  const affiliations = value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("소속 정보가 올바르지 않습니다.");
    }
    const { name, isPrimary } = item as Record<string, unknown>;
    const normalizedName = typeof name === "string" ? name.trim() : "";
    if (!normalizedName) {
      throw new Error("소속명을 입력해 주세요.");
    }
    if (Array.from(normalizedName).length > PLAYER_AFFILIATION_NAME_MAX_LENGTH) {
      throw new Error(
        `소속명은 ${PLAYER_AFFILIATION_NAME_MAX_LENGTH}자 이하여야 합니다.`,
      );
    }
    const duplicateKey = normalizedName.replace(/\s+/g, " ").toLocaleLowerCase();
    if (names.has(duplicateKey)) {
      throw new Error("같은 소속을 중복 등록할 수 없습니다.");
    }
    names.add(duplicateKey);
    if (typeof isPrimary !== "boolean") {
      throw new Error("대표 소속 정보를 확인해 주세요.");
    }
    return { name: normalizedName, isPrimary };
  });

  const primaryCount = affiliations.filter((item) => item.isPrimary).length;
  if (affiliations.length > 0 && primaryCount !== 1) {
    throw new Error("대표 소속을 하나 지정해 주세요.");
  }
  return affiliations;
};

const normalizeStatusMessage = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new Error("상태메시지는 문자열이어야 합니다.");
  }
  const message = value.trim();
  if (Array.from(message).length > PLAYER_STATUS_MESSAGE_MAX_LENGTH) {
    throw new Error(
      `상태메시지는 ${PLAYER_STATUS_MESSAGE_MAX_LENGTH}자 이하여야 합니다.`,
    );
  }
  return message || null;
};

const normalizeStatusMessageBackgroundColor = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error("상태메시지 배경색 형식이 올바르지 않습니다.");
  }
  return value.toUpperCase();
};

app.patch("/api/me/profile", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const input = req.body as Record<string, unknown>;
    const update: {
      affiliations?: PlayerAffiliation[];
      statusMessage?: string | null;
      statusMessageBackgroundColor?: string | null;
    } = {};
    // 아바타는 서버가 Storage에 올린 URL만 저장하므로 /api/me/avatar로만 바꿀 수 있다.
    if (hasOwnProperty(input, "avatarUrl")) {
      return res.status(400).json({
        error: "프로필 이미지는 /api/me/avatar로만 변경할 수 있습니다.",
      });
    }
    if (hasOwnProperty(input, "affiliations")) {
      update.affiliations = normalizeProfileAffiliations(input.affiliations);
    }
    if (hasOwnProperty(input, "statusMessage")) {
      update.statusMessage = normalizeStatusMessage(input.statusMessage);
      if (!update.statusMessage && !hasOwnProperty(input, "statusMessageBackgroundColor")) {
        update.statusMessageBackgroundColor = null;
      }
    }
    if (hasOwnProperty(input, "statusMessageBackgroundColor")) {
      update.statusMessageBackgroundColor = normalizeStatusMessageBackgroundColor(
        input.statusMessageBackgroundColor,
      );
    }

    const player = await authService.updatePlayerProfile(decoded.playerId, update);
    res.json(player);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/me/avatar", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const previousPlayer = await authService.getPlayerById(decoded.playerId);
    if (!previousPlayer) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    const { imageDataUrl } = req.body as { imageDataUrl?: unknown };
    const avatar = parseAvatarDataUrl(imageDataUrl);
    const objectPath = buildAvatarObjectPath(decoded.playerId, avatar.ext);
    const avatarUrl = buildAvatarPublicUrl(objectPath);

    await uploadAvatarObject(objectPath, avatar);

    let player: Player;
    try {
      player = await authService.updatePlayerProfile(decoded.playerId, {
        avatarUrl,
      });
    } catch (err) {
      await deleteAvatarObjectQuietly(objectPath);
      throw err;
    }

    await deleteAvatarObjectQuietly(
      getOwnedAvatarObjectPath(decoded.playerId, previousPlayer.avatarUrl),
    );

    res.json(player);
  } catch (err) {
    if (err instanceof AvatarValidationError) {
      return res.status(400).json({ error: err.message });
    }
    // Storage 응답 본문·서버 설정·DB 오류는 내부 정보이므로 로그로만 남긴다.
    console.error("[Avatar] 업로드 실패", err);
    res.status(500).json({ error: "프로필 이미지를 저장하지 못했습니다." });
  }
});

app.delete("/api/me/avatar", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const previousPlayer = await authService.getPlayerById(decoded.playerId);
    if (!previousPlayer) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    const previousObjectPath = getOwnedAvatarObjectPath(
      decoded.playerId,
      previousPlayer.avatarUrl,
    );
    // 객체를 먼저 지워 실패 시 avatar_url이 남아 다시 시도할 수 있게 한다.
    if (previousObjectPath) {
      await deleteAvatarObject(previousObjectPath);
    }

    const player = await authService.updatePlayerProfile(decoded.playerId, {
      avatarUrl: null,
    });

    res.json(player);
  } catch (err) {
    console.error("[Avatar] 삭제 실패", err);
    res.status(500).json({ error: "프로필 이미지를 삭제하지 못했습니다." });
  }
});

/** 랭킹·세션 리포트 요청 오류. status로 400·404를 구분해 응답한다 */
class RankingRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RankingRequestError";
  }
}

const sendRankingFailure = (res: express.Response, error: unknown) => {
  const status =
    error instanceof RankingRequestError ||
    error instanceof MatchRepositoryError
      ? error.status
      : 500;
  res.status(status).json({ error: (error as Error).message });
};

/** 랭킹·세션 리포트 계산 원천. 회원 약 20명 규모라 로그·경기·세션을 모두 메모리로 읽는다 */
const loadRankingSource = async () => {
  const [players, logs, matches, sessions] = await Promise.all([
    authService.getAllPlayers(),
    matchRepository.getAllRatingChangeLogs(),
    matchRepository.findCompletedMatchOutcomes(),
    matchRepository.findSessionsWithParticipantIds(),
  ]);
  return {
    context: createRankingContext(players, logs, matches),
    sessions,
    players,
  };
};

const parseRankingCategory = (value: unknown): RankingCategory => {
  if (value === undefined) {
    return "doubles";
  }
  if (value === "doubles" || value === "singles" || value === "achievements") {
    return value;
  }
  throw new RankingRequestError(
    "category는 doubles, singles, achievements 중 하나여야 합니다.",
    400,
  );
};

/** limit 쿼리: 생략이면 기본값, 양의 정수가 아니면 400, 최대값으로 자른다 */
const parseSessionHistoryLimit = (value: unknown): number => {
  if (value === undefined) {
    return SESSION_HISTORY_DEFAULT_LIMIT;
  }
  const limit = parseUnsignedIntegerQuery(value);
  if (Number.isNaN(limit) || limit < 1) {
    throw new RankingRequestError("limit은 1 이상의 정수여야 합니다.", 400);
  }
  return Math.min(limit, SESSION_HISTORY_MAX_LIMIT);
};

app.get("/api/rankings", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const category = parseRankingCategory(req.query.category);
    const now = new Date();
    const { context, sessions } = await loadRankingSource();
    const response: RankingResponse | AchievementRankingResponse =
      category === "achievements"
        ? buildAchievementRankingResponse(
            context,
            findEndedSessions(context, sessions, now),
          )
        : buildRankingResponse({ context, category, sessions, now });
    res.json(response);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

app.get("/api/session-reports", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const limit = parseSessionHistoryLimit(req.query.limit);
    const playerId = req.query.playerId;
    if (playerId !== undefined && typeof playerId !== "string") {
      throw new RankingRequestError("playerId는 문자열이어야 합니다.", 400);
    }
    const { context, sessions } = await loadRankingSource();
    const response: MatchSessionHistoryResponse = {
      sessions: buildSessionHistory({
        context,
        sessions,
        limit,
        playerId: playerId?.trim() || undefined,
      }),
    };
    res.json(response);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

/** 기록 줄의 경기 id를 공개 Match로 바꾼다. 줄에 든 경기만 조회하고, 그새 사라진 경기는 뺀다 */
const hydrateRecordEntries = async (
  entries: RecordsPageEntry[],
): Promise<RecordItem[]> => {
  const matchesById = new Map(
    (
      await matchRepository.findByIds(
        entries.flatMap((entry) =>
          entry.kind === "match" ? [entry.matchId] : [],
        ),
      )
    ).map((match) => [match.id, match]),
  );
  return entries.flatMap((entry): RecordItem[] => {
    if (entry.kind === "session") return [entry];
    const match = matchesById.get(entry.matchId);
    return match ? [{ kind: "match", match }] : [];
  });
};

app.get("/api/records", async (req, res) => {
  try {
    const auth = await getAuthPayload(req, res);
    if (!auth) {
      return;
    }

    const limit = parseSessionHistoryLimit(req.query.limit);
    const playerId = req.query.playerId;
    if (playerId !== undefined && typeof playerId !== "string") {
      throw new RankingRequestError("playerId는 문자열이어야 합니다.", 400);
    }
    const rawCursor = req.query.cursor;
    const cursor =
      typeof rawCursor === "string" ? parseRecordsCursor(rawCursor) : null;
    if (rawCursor !== undefined && !cursor) {
      throw new RankingRequestError("cursor 형식이 올바르지 않습니다.", 400);
    }

    const { context, sessions } = await loadRankingSource();
    const page = buildRecordsPage({
      context,
      sessions,
      limit,
      cursor,
      playerId: playerId?.trim() || undefined,
      requesterId: auth.playerId,
    });
    const response: RecordsResponse = {
      items: await hydrateRecordEntries(page.entries),
      nextCursor: page.nextCursor,
    };
    res.json(response);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

app.get("/api/news-feed", async (req, res) => {
  try {
    const auth = await getAuthPayload(req, res);
    if (!auth) {
      return;
    }

    const rawCursor = req.query.cursor;
    const cursor =
      typeof rawCursor === "string" ? parseNewsFeedCursor(rawCursor) : null;
    if (rawCursor !== undefined && cursor == null) {
      throw new RankingRequestError("cursor 형식이 올바르지 않습니다.", 400);
    }

    const { context, sessions, players } = await loadRankingSource();
    const response: NewsFeedResponse = buildNewsFeedPage({
      context,
      sessions,
      players,
      endedSessions: findEndedSessions(context, sessions, new Date()),
      requesterId: auth.playerId,
      cursor,
    });
    res.json(response);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

app.get("/api/schedule", async (req, res) => {
  try {
    const auth = await getAuthPayload(req, res);
    if (!auth) {
      return;
    }

    const month = req.query.month;
    if (typeof month !== "string" || !parseScheduleMonth(month)) {
      throw new RankingRequestError("month는 YYYY-MM 형식이어야 합니다.", 400);
    }
    const { fromDateKey, toDateKey } = getScheduleMonthDateKeyRange(month);

    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const [monthSessions, activePlayersById, { context, sessions }] =
      await Promise.all([
        matchRepository.findSessionsInDateKeyRange(fromDateKey, toDateKey),
        loadActivePlayersById(),
        loadRankingSource(),
      ]);

    const entries = buildRecordsInRange({
      context,
      sessions,
      from: kstDateKeyToDate(fromDateKey),
      to: kstDateKeyToDate(toDateKey),
      requesterId: auth.playerId,
    });
    // 끝난 세션은 완료 경기가 있는(기록 줄이 있는) 세션만 남긴다.
    // 정리가 best-effort라 남은 빈 세션, 취소·진행 중 경기만 있던 세션은 일정에 보일 내용이 없다
    const recordedSessionIds = new Set(
      entries.flatMap((entry) =>
        entry.kind === "session" ? [entry.session.id] : [],
      ),
    );
    const scheduleSessions = await attachTournamentPlacements(
      monthSessions
        .map((session): ScheduleSession => {
          const isEnded =
            getSessionEndsAt(session.kind, session.date, session) <= now;
          return {
            ...toMatchSessionDetail(session, activePlayersById, now),
            isEnded,
          };
        })
        .filter(
          (session) => !session.isEnded || recordedSessionIds.has(session.id),
        ),
    );
    // 저장소가 시각 오름차순으로 주므로 날짜 키·정기 여부로만 다시 정렬한다(정렬은 안정적이다)
    scheduleSessions.sort(compareSessionDetailsByDay);

    const response: ScheduleMonthResponse = {
      sessions: scheduleSessions,
      records: await hydrateRecordEntries(entries),
    };
    res.json(response);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

app.get("/api/session-reports/:sessionId", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const sessionId = req.params.sessionId;
    if (!isEntityId(sessionId, "session")) {
      throw new RankingRequestError("유효한 세션 ID가 필요합니다.", 400);
    }
    const { context, sessions } = await loadRankingSource();
    const session = sessions.find((candidate) => candidate.id === sessionId);
    const report = session
      ? buildSessionReport({
          context,
          session,
          endedSessions: findEndedSessions(context, sessions, new Date()),
        })
      : null;
    if (!report) {
      throw new RankingRequestError("세션 리포트를 찾을 수 없습니다.", 404);
    }
    res.json(report);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

/** 세션 칭찬 요청의 세션: id 형식 오류 400, 없으면 404 */
const findPraiseSession = (
  sessions: RankingSession[],
  sessionId: string,
): RankingSession => {
  if (!isEntityId(sessionId, "session")) {
    throw new RankingRequestError("유효한 세션 ID가 필요합니다.", 400);
  }
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new RankingRequestError("세션을 찾을 수 없습니다.", 404);
  }
  return session;
};

app.get("/api/match-sessions/:sessionId/praise", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }
    const { context, sessions } = await loadRankingSource();
    const session = findPraiseSession(sessions, req.params.sessionId);
    const response: SessionPraiseResponse = buildSessionPraiseResponse(
      context,
      session,
      decoded.playerId,
      new Date(),
    );
    res.json(response);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

app.post("/api/match-sessions/:sessionId/praise", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }
    const body = req.body as Partial<SessionPraiseRequest> | undefined;
    const targetPlayerId =
      typeof body?.targetPlayerId === "string" ? body.targetPlayerId : "";
    const { context, sessions } = await loadRankingSource();
    const session = findPraiseSession(sessions, req.params.sessionId);
    const now = new Date();
    const current = buildSessionPraiseResponse(
      context,
      session,
      decoded.playerId,
      now,
    );
    if (current.status !== "open" || current.candidates.length === 0) {
      throw new RankingRequestError("지금은 칭찬할 수 없어요.", 409);
    }
    if (
      !current.candidates.some(
        (candidate) => candidate.player.id === targetPlayerId,
      )
    ) {
      throw new RankingRequestError("칭찬 후보가 아니에요.", 400);
    }
    const praise = {
      sessionId: session.id,
      voterPlayerId: decoded.playerId,
      targetPlayerId,
    };
    if (
      current.myTargetPlayerId ||
      !(await matchRepository.createSessionPraise(praise, now))
    ) {
      throw new RankingRequestError("이미 칭찬했어요.", 409);
    }
    // 후보는 칭찬 수와 무관하므로 저장 전 계산에 방금 칭찬만 더해 돌려준다
    const response: SessionPraiseResponse = {
      ...current,
      candidates: current.candidates.map((candidate) =>
        candidate.player.id === targetPlayerId
          ? { ...candidate, praiseCount: candidate.praiseCount + 1 }
          : candidate,
      ),
      myTargetPlayerId: targetPlayerId,
    };
    res.json(response);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

app.get("/api/me/session-praises/pending", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }
    const { context, sessions } = await loadRankingSource();
    const response: PendingSessionPraisesResponse = {
      items: findPendingSessionPraises(
        context,
        sessions,
        decoded.playerId,
        new Date(),
      ),
    };
    res.json(response);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

app.get("/api/achievements/holders", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const { context, sessions } = await loadRankingSource();
    const response: AchievementHoldersResponse = {
      counts: countAchievementHolders(
        context,
        findEndedSessions(context, sessions, new Date()),
      ),
    };
    res.json(response);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

// player_seen_achievements.earned_match_id 길이
const MAX_ID_LENGTH = 255;
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((definition) => definition.id));

/** POST /api/me/achievements/seen 본문. 형식이 틀리거나 모르는 업적이면 null */
const parseSeenAchievements = (body: unknown): SeenAchievementRef[] | null => {
  const items = (body as { achievements?: unknown } | null)?.achievements;
  if (!Array.isArray(items) || items.length > ACHIEVEMENTS.length) return null;
  const parsed: SeenAchievementRef[] = [];
  for (const item of items) {
    const { achievementId, earnedMatchId } = (item ?? {}) as Record<
      string,
      unknown
    >;
    if (
      typeof achievementId !== "string" ||
      !ACHIEVEMENT_IDS.has(achievementId) ||
      typeof earnedMatchId !== "string" ||
      earnedMatchId.length === 0 ||
      earnedMatchId.length > MAX_ID_LENGTH
    ) {
      return null;
    }
    parsed.push({ achievementId, earnedMatchId });
  }
  return parsed;
};

app.get("/api/me/achievements/unseen", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const [{ context, sessions }, seen] = await Promise.all([
      loadRankingSource(),
      db.playerSeenAchievements.findByPlayerId(decoded.playerId),
    ]);
    const earned = findPlayerEarnedAchievements(
      toContextAchievementMatches(context),
      findEndedSessions(context, sessions, new Date()),
      decoded.playerId,
    );
    const response: UnseenAchievementsResponse = {
      achievements: findUnseenAchievements(earned, seen),
      points: sumEarnedAchievementPoints(earned),
    };
    res.json(response);
  } catch (err) {
    sendRankingFailure(res, err);
  }
});

app.post("/api/me/achievements/seen", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const items = parseSeenAchievements(req.body);
    if (!items) {
      res.status(400).json({ error: "확인할 업적 형식이 올바르지 않습니다." });
      return;
    }
    await db.playerSeenAchievements.markSeen(
      decoded.playerId,
      items,
      new Date(),
    );
    res.status(204).end();
  } catch (err) {
    // DB 오류 문구에는 제약·컬럼 이름이 들어가므로 서버에만 남긴다
    console.error("[ACHIEVEMENT] 업적 확인 저장 실패", err);
    res.status(500).json({ error: "업적 확인을 저장하지 못했습니다." });
  }
});

app.get("/api/admin/players", requireAdmin, async (_req, res) => {
  try {
    const players = await authService.getAdminPlayers();
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete("/api/admin/players/:playerId", requireAdmin, async (req, res) => {
  const session = res.locals.authSession as AuthenticatedSession;
  try {
    const { sessionIds } = await authService.deletePlayer(
      req.params.playerId,
      session.payload.playerId,
    );
    matchRepository.notifySessionsChanged(sessionIds);
    res.status(204).send();
  } catch (err) {
    sendAccountRequestFailure(res, err);
  }
});

app.get("/api/admin/player-creation-logs", requireAdmin, async (_req, res) => {
  try {
    const logs = await authService.getPlayerCreationLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/admin/player-status-logs", requireAdmin, async (_req, res) => {
  try {
    const logs = await authService.getPlayerStatusLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.patch(
  "/api/admin/players/:playerId/gender",
  requireAdmin,
  async (req, res) => {
    try {
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }

      const { gender } = req.body as { gender?: unknown };
      if (!isPlayerGender(gender)) {
        return res
          .status(400)
          .json({ error: "gender는 M 또는 F 여야 합니다." });
      }

      const result = await authService.updatePlayerGender(
        req.params.playerId,
        gender,
        decoded.playerId,
      );

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

app.patch(
  "/api/admin/players/:playerId/status",
  requireAdmin,
  async (req, res) => {
    try {
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }

      const { status } = req.body as { status?: PlayerStatus };
      if (!status || !playerStatuses.includes(status)) {
        return res
          .status(400)
          .json({ error: "status는 active 또는 inactive 여야 합니다." });
      }

      const result = await authService.updatePlayerStatus(
        req.params.playerId,
        status,
        decoded.playerId,
      );

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post("/api/admin/ratings/recalculate", requireAdmin, async (_req, res) => {
  try {
    let completedMatchCount = 0;
    const result = await authService.recalculateDuprRatings(
      async () => {
        const completedMatches = await loadCompletedMatches();
        completedMatchCount = completedMatches.length;
        return completedMatches;
      },
      {
        source: "manual_recalculation",
        sourceLogId: `manual-recalculation-${Date.now()}-${randomUUID()}`,
        perMatchLogs: true,
      },
    );

    res.json({
      ...result,
      completedMatchCount,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post(
  "/api/admin/players/:playerId/official-dupr",
  requireAdmin,
  async (req, res) => {
    try {
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }

      const result = await authService.applyOfficialDuprAdjustment(
        {
          playerId: req.params.playerId,
          changedByPlayerId: decoded.playerId,
          ratings: req.body.ratings,
          confidence: req.body.confidence,
          reason: req.body.reason,
        },
        loadCompletedMatches,
      );

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/api/admin/players/:playerId/official-dupr/preview",
  requireAdmin,
  async (req, res) => {
    try {
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }

      const result = await authService.previewOfficialDuprAdjustment(
        {
          playerId: req.params.playerId,
          changedByPlayerId: decoded.playerId,
          ratings: req.body.ratings,
          confidence: req.body.confidence,
          reason: req.body.reason,
        },
        await loadCompletedMatches(),
      );

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

app.post("/api/admin/register", requireAdmin, async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const { username, gender } = (req.body ?? {}) as Partial<
      Record<keyof AdminRegisterPlayerRequest, unknown>
    >;
    const normalizedUsername =
      typeof username === "string" ? username.trim() : "";
    if (!normalizedUsername || !isPlayerGender(gender)) {
      return res.status(400).json({ error: "username, gender는 필수입니다." });
    }
    const result = await authService.registerAdmin(
      { username: normalizedUsername, gender },
      decoded.playerId,
    );
    res.json(result);
  } catch (err) {
    sendAccountRequestFailure(res, err);
  }
});

app.post(
  "/api/admin/players/:playerId/password-reset",
  requireAdmin,
  async (req, res) => {
    try {
      res.json(await authService.resetPlayerPassword(req.params.playerId));
    } catch (err) {
      sendAccountRequestFailure(res, err);
    }
  },
);

app.patch(
  "/api/admin/players/:playerId/username",
  requireAdmin,
  async (req, res) => {
    const { username } = (req.body ?? {}) as Partial<
      Record<keyof AdminUpdateUsernameRequest, unknown>
    >;
    if (typeof username !== "string") {
      return res.status(400).json({ error: "username은 필수입니다." });
    }

    try {
      res.json(
        await authService.updatePlayerUsername(req.params.playerId, username),
      );
    } catch (err) {
      sendAccountRequestFailure(res, err);
    }
  },
);

app.post(
  "/api/admin/players/:playerId/promote",
  requireAdmin,
  async (req, res) => {
    const { gender } = (req.body ?? {}) as Partial<
      Record<keyof AdminPromoteGuestRequest, unknown>
    >;
    if (!isPlayerGender(gender)) {
      return res.status(400).json({ error: "gender는 M 또는 F 여야 합니다." });
    }

    try {
      res.json(await authService.promoteGuest(req.params.playerId, gender));
    } catch (err) {
      sendAccountRequestFailure(res, err);
    }
  },
);

export { app };

/** dev mock 경기는 평점 변경 로그 없이 들어오므로 시딩 직후 관리자 재계산과 같은 경로로 로그를 채운다 */
const recalculateDevMockRatings = async () => {
  await authService.recalculateDuprRatings(
    loadCompletedMatches,
    {
      source: "manual_recalculation",
      sourceLogId: `dev-mock-recalculation-${Date.now()}-${randomUUID()}`,
      perMatchLogs: true,
    },
  );
};

export const startServer = async () => {
  assertRequiredEnv();
  await initDatabase();
  await authService.seedDevAuthAccounts();
  if (isDevMockDataEnabled()) {
    await recalculateDevMockRatings();
  }
  return (app as any).listen(PORT, () => {
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
  });
};

// Edge Runtime은 supabase/functions/api 진입점이 app을 서비스하므로 Node 부팅(시딩·listen)을 건너뛴다.
if (
  process.env.NODE_ENV !== "test" &&
  process.env.VITEST !== "true" &&
  !isEdgeRuntime()
) {
  startServer().catch((error) => {
    console.error("[API] Failed to start", error);
    process.exit(1);
  });
}

import cors from "cors";
import express from "express";
import { randomUUID } from "crypto";
import {
  DEFAULT_MATCH_MODE,
  MATCH_RESULT_MAX_SCORE_COUNT,
  isMatchInProgress,
  isSinglesMatchType,
  canEditMatchRecord,
  isWithinMatchEditWindow,
  inferMatchModeFromScores,
  matchModeValues,
  matchTypeLabels,
  matchTypeValues,
  type Match,
  type MatchMode,
  type MatchScore,
  type RecordMatchRequest,
  type RecordedMatchResponse,
  type Team,
  type Session,
  type ManagedMatchSession,
  type MatchType,
  validateMatchScoresForMode,
} from "@pkpkdupr/shared/match";
import {
  canOpenRegularSession,
  isInProgressMatchExpired,
  isRegularSessionTime,
  toKstDateKey,
  type AddMatchSessionParticipantRequest,
  type CreateMatchSessionRequest,
  type StartSessionMatchRequest,
  type MatchSessionDetail,
  type MatchSessionMember,
  type TodayMatchSessionsResponse,
} from "@pkpkdupr/shared/session";
import { generateEntityId, isEntityId } from "@pkpkdupr/shared/entityId";
import {
  MATCHMAKING_DEFAULT_COURTS,
  clampMatchmakingCourts,
  recommendDoublesMatches,
  type MatchSessionRecommendationResponse,
  type RecommendationPlayer,
  type RecommendedTeam,
} from "@pkpkdupr/shared/matchmaking";
import {
  PLAYER_AFFILIATION_MAX_COUNT,
  PLAYER_AFFILIATION_NAME_MAX_LENGTH,
  PLAYER_STATUS_MESSAGE_MAX_LENGTH,
} from "@pkpkdupr/shared/player";
import type {
  MemberListPlayer,
  Player,
  PlayerAffiliation,
  PlayerRatingChangeLog,
  PlayerStatus,
} from "@pkpkdupr/shared/player";
import type {
  AdminRegisterPlayerRequest,
  AdminUpdateUsernameRequest,
  AuthErrorCode,
  AuthErrorResponse,
  MeResponse,
} from "@pkpkdupr/shared/auth";
import { assertRequiredEnv } from "./config/env";
import { initDatabase } from "./db";
import {
  MatchRepository,
  MatchRepositoryError,
} from "./repositories/MatchRepository";
import {
  AccountRequestError,
  AuthError,
  AuthService,
  type AuthenticatedSession,
} from "./services/AuthService";
import {
  attachMatchRatingChanges,
  PlayerRatingChartProjectionService,
} from "./services/PlayerRatingChartProjectionService";
import { buildPlayerProfileSummary } from "./services/PlayerProfileSummaryService";
import {
  buildCourtSchedule,
  findCourtScheduleConflicts,
  normalizeCourtName,
  normalizeCourtNames,
} from "./services/SessionCourtSchedule";
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
import { isEdgeRuntime } from "./runtime";

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
const matchRepository = new MatchRepository();
const playerRatingChartProjectionService =
  new PlayerRatingChartProjectionService(matchRepository, authService);
authService.setPlayerRatingChartProjectionRefresher(
  playerRatingChartProjectionService,
);
const playerStatuses: PlayerStatus[] = ["active", "inactive"];
const playerGenders: Array<Player["gender"]> = ["M", "F"];

type MatchTeamRequest = { name?: string; playerIds?: string[] };

type MatchSessionRequest = {
  name?: string;
  date?: string;
  location?: string;
};

type AdminBatchMatchRequest = {
  session?: MatchSessionRequest;
  matches?: Array<{
    name?: string;
    type?: MatchType;
    mode?: MatchMode;
    teams?: [MatchTeamRequest, MatchTeamRequest];
    location?: string;
    courtName?: string;
    matchStartsAt?: string;
    scores?: MatchScore[];
  }>;
};

type AdminScheduledMatchRequest = {
  name?: string;
  type?: MatchType;
  mode?: MatchMode;
  teams?: [MatchTeamRequest, MatchTeamRequest];
  courtName?: string;
  matchStartsAt?: string;
};

type AdminScheduledMatchBatchRequest = {
  courts?: unknown;
  matches?: AdminScheduledMatchRequest[];
};

type SubmitMatchResultRequest = {
  scores?: MatchScore[];
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
  return normalizeCourtName(value) ?? null;
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

const normalizeMatchSession = (
  session: MatchSessionRequest | undefined,
): Session | undefined => {
  if (!session) {
    return undefined;
  }

  const name = normalizeOptionalName(session.name);
  const dateValue = typeof session.date === "string" ? session.date : undefined;
  const location = normalizeOptionalName(session.location);

  if (!name && !dateValue && !location) {
    return undefined;
  }

  if (!name) {
    throw new Error("세션명이 필요합니다.");
  }

  if (!dateValue) {
    throw new Error("세션 날짜를 입력해주세요.");
  }

  if (!location) {
    throw new Error("세션 장소를 입력해주세요.");
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error("유효한 세션 날짜가 필요합니다.");
  }

  return { id: generateEntityId("session"), name, date, location };
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

const isPlayerGender = (value: unknown): value is Player["gender"] =>
  typeof value === "string" &&
  playerGenders.includes(value as Player["gender"]);

const isMatchMode = (value: unknown): value is MatchMode =>
  typeof value === "string" && matchModeValues.includes(value as MatchMode);

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

    return firstPlayer.gender === secondPlayer.gender
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

type PreparedAdminScheduledMatch = {
  name?: string;
  type: MatchType;
  mode: MatchMode;
  teams: [Team, Team];
  matchStartsAt?: Date;
  courtName?: string;
};

const prepareAdminScheduledMatches = ({
  requestedMatches,
  registeredPlayerIds,
  playersById,
  requireSchedule,
}: {
  requestedMatches: unknown;
  registeredPlayerIds: Set<string>;
  playersById: Map<string, Player>;
  requireSchedule: boolean;
}): PreparedAdminScheduledMatch[] => {
  if (!Array.isArray(requestedMatches) || requestedMatches.length === 0) {
    throw new Error("한 개 이상의 대진이 필요합니다.");
  }

  return requestedMatches.map((requested, index) => {
    const label = `${index + 1}번 경기`;
    const { name, type, mode, teams, matchStartsAt, courtName } =
      requested as AdminScheduledMatchRequest;
    if (!isMatchType(type)) {
      throw new Error(`${label}: 유효한 매치 타입이 필요합니다.`);
    }
    if (mode != null && !isMatchMode(mode)) {
      throw new Error(`${label}: 유효한 경기 모드가 필요합니다.`);
    }
    if (!teams || teams.length !== 2) {
      throw new Error(`${label}: 두 팀 구성이 필요합니다.`);
    }

    const requestedPlayerIds = normalizeRequestedTeamPlayerIds(teams);
    if (
      requestedPlayerIds.length === 0 ||
      requestedPlayerIds.some((playerId) => !registeredPlayerIds.has(playerId))
    ) {
      throw new Error(`${label}: 세션에 등록된 참여자만 경기에 배정할 수 있습니다.`);
    }

    const matchTeams = buildMatchTeamsFromRequests(teams, playersById);
    if (
      !validateCreateMatchTeams(type, [
        matchTeams[0].players,
        matchTeams[1].players,
      ])
    ) {
      throw new Error(
        `${label}: ${matchTypeLabels[type]}에 맞는 팀 구성이 필요합니다.`,
      );
    }

    const prepared: PreparedAdminScheduledMatch = {
      name: normalizeOptionalName(name),
      type,
      mode: mode ?? DEFAULT_MATCH_MODE,
      teams: matchTeams,
    };
    if (requireSchedule) {
      const parsedMatchStartsAt = new Date(matchStartsAt ?? "");
      if (Number.isNaN(parsedMatchStartsAt.getTime())) {
        throw new Error(`${label}: 경기 예정 일시가 필요합니다.`);
      }
      const normalizedCourtName = normalizeCourtName(courtName);
      if (!normalizedCourtName) {
        throw new Error(`${label}: 코트명이 필요합니다.`);
      }
      prepared.matchStartsAt = parsedMatchStartsAt;
      prepared.courtName = normalizedCourtName;
    }
    return prepared;
  });
};

const loadAdminSessionMatchContext = async (sessionId: string) => {
  const session = await matchRepository.findSessionById(sessionId);
  if (!session) {
    return undefined;
  }

  const registeredPlayerIds = new Set(session.participantIds);
  const playersById = new Map<string, Player>(
    (await authService.getAllPlayers())
      .filter(
        (player) =>
          player.status === "active" && registeredPlayerIds.has(player.id),
      )
      .map((player) => [player.id, player]),
  );

  return { session, registeredPlayerIds, playersById };
};

const normalizeMatchScores = (scores: unknown): MatchScore[] => {
  if (!Array.isArray(scores) || scores.length === 0) {
    throw new Error("한 개 이상의 스코어가 필요합니다.");
  }

  if (scores.length > MATCH_RESULT_MAX_SCORE_COUNT) {
    throw new Error(
      `스코어는 최대 ${MATCH_RESULT_MAX_SCORE_COUNT}개까지 입력할 수 있습니다.`,
    );
  }

  return scores.map((score, index) => {
    const scoreA = Number((score as MatchScore | undefined)?.scoreA);
    const scoreB = Number((score as MatchScore | undefined)?.scoreB);

    if (
      !Number.isInteger(scoreA) ||
      !Number.isInteger(scoreB) ||
      scoreA < 0 ||
      scoreB < 0 ||
      scoreA === scoreB
    ) {
      throw new Error(`${index + 1}번째 스코어가 유효하지 않습니다.`);
    }

    return { scoreA, scoreB };
  });
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
 */
const prepareRecordedMatch = async (
  body: Partial<RecordMatchRequest> | undefined,
  requesterPlayerId: string,
) => {
  const { name, type, mode, teams, location, scores } = body ?? {};
  if (type != null && !isMatchType(type)) {
    throw new MatchRecordRequestError("유효한 매치 타입이 필요합니다.", 400);
  }
  if (mode != null && !isMatchMode(mode)) {
    throw new MatchRecordRequestError("유효한 경기 모드가 필요합니다.", 400);
  }
  if (!Array.isArray(teams) || teams.length !== 2) {
    throw new MatchRecordRequestError("두 팀 구성이 필요합니다.", 400);
  }

  const normalizedLocation = normalizeOptionalName(location);
  if (!normalizedLocation) {
    throw new MatchRecordRequestError("장소를 입력해주세요.", 400);
  }

  const normalizedScores = normalizeMatchScores(scores);
  const resolvedMode = mode ?? inferMatchModeFromScores(normalizedScores);
  validateMatchScoresForMode(resolvedMode, normalizedScores);

  const lineup = await prepareMatchLineup(
    type,
    teams as [MatchTeamRequest, MatchTeamRequest],
    requesterPlayerId,
  );

  return {
    name: normalizeOptionalName(name),
    type: lineup.type,
    mode: resolvedMode,
    teams: lineup.teams,
    location: normalizedLocation,
    scores: normalizedScores,
  };
};

/**
 * 경기 기록·시작 요청의 팀 구성을 검증한다. 요청자는 active여야 하고 팀에 없어도 된다.
 * 선수는 active 회원이어야 하며, type을 생략하면 팀 구성으로 추론한다.
 */
const prepareMatchLineup = async (
  type: MatchType | undefined,
  requestedTeams: [MatchTeamRequest, MatchTeamRequest],
  requesterPlayerId: string,
) => {
  const requester = await authService.getPlayerById(requesterPlayerId);
  if (!requester || requester.status !== "active") {
    throw new MatchRecordRequestError("경기를 기록할 수 없는 계정입니다.", 403);
  }

  const publicPlayers = await authService.getPublicPlayers();
  const playersById = new Map<string, Player>(
    [requester, ...publicPlayers].map((player) => [player.id, player]),
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
      if (toKstDateKey(requested.date) !== toKstDateKey(matchStartsAt)) {
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
  return await matchRepository.findOrCreateRegularSession(
    toKstDateKey(matchStartsAt),
  );
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
    isToday: dateKey === toKstDateKey(now),
    participants,
    matchCount: session.matchCount,
  };
};

/** 세션 상세를 만든다. 없으면 undefined */
const loadMatchSessionDetail = async (
  sessionId: string,
  now: Date,
): Promise<MatchSessionDetail | undefined> => {
  const [session, activePlayersById] = await Promise.all([
    matchRepository.findSessionById(sessionId),
    loadActivePlayersById(),
  ]);
  return session
    ? toMatchSessionDetail(session, activePlayersById, now)
    : undefined;
};

const requireMatchSessionDetail = async (sessionId: string, now: Date) => {
  const detail = await loadMatchSessionDetail(sessionId, now);
  if (!detail) {
    throw new MatchSessionRequestError("세션을 찾을 수 없습니다.", 404);
  }
  return detail;
};

/** 참여자 추가·삭제 대상 세션을 확인한다. 오늘 세션이 아니면 403 */
const requireTodaySessionForParticipants = async (
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
  if (toKstDateKey(session.date) !== toKstDateKey(now)) {
    throw new MatchSessionRequestError(
      "오늘 세션에서만 참여자를 바꿀 수 있습니다.",
      403,
    );
  }
};

const getTeamPlayerIds = (teams: Team[]) =>
  teams.flatMap((team) => team.players.map((player) => player.id));

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
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const playerId = req.params.playerId;
    const [result, ratingChangeLogs, projection] = await Promise.all([
      matchRepository.findByPlayerId(playerId, 0, 10_000),
      matchRepository.getPlayerRatingChangeLogs(playerId),
      playerRatingChartProjectionService.getOrRebuild(playerId),
    ]);
    const matches = attachMatchRatingChanges(result.matches, ratingChangeLogs);
    res.json(buildPlayerProfileSummary(matches, playerId, projection.history));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

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

    await matchRepository.cleanupExpired();
    const result = playerId
      ? await matchRepository.findByPlayerId(playerId, page, limit)
      : await matchRepository.findAll(page, limit);

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
    const [sessions, activePlayersById] = await Promise.all([
      matchRepository.findSessionsByDateKey(dateKey),
      loadActivePlayersById(),
    ]);
    // 저장소가 시각 오름차순으로 주므로 정기 세션만 맨 앞으로 옮긴다(정렬은 안정적이다).
    const ordered = [...sessions].sort(
      (a, b) => Number(b.kind === "regular") - Number(a.kind === "regular"),
    );
    const response: TodayMatchSessionsResponse = {
      dateKey,
      regularSessionOpen: canOpenRegularSession(now),
      sessions: ordered.map((session) =>
        toMatchSessionDetail(session, activePlayersById, now),
      ),
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
    res.json(await requireMatchSessionDetail(session.id, now));
  } catch (err) {
    sendMatchSessionFailure(res, err);
  }
});

app.post("/api/match-sessions", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const body = req.body as Partial<CreateMatchSessionRequest> | undefined;
    const name = normalizeOptionalName(body?.name);
    const location = normalizeOptionalName(body?.location);
    if (!name) {
      throw new MatchSessionRequestError("세션 이름이 필요합니다.", 400);
    }
    if (!location) {
      throw new MatchSessionRequestError("세션 장소가 필요합니다.", 400);
    }

    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const created = await matchRepository.createSession({
      name,
      date: now,
      location,
    });
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

/** 서버가 정하는 seed 범위 상한(미포함). 32비트 부호 있는 정수 양수 범위에 맞춘다 */
const GENERATED_SEED_MAX_EXCLUSIVE = 2 ** 31;

/** seed 쿼리: 생략이면 서버가 무작위 정수를 정하고, 정수가 아니면 400 */
const parseRecommendationSeed = (value: unknown): number => {
  if (value === undefined) {
    return Math.floor(Math.random() * GENERATED_SEED_MAX_EXCLUSIVE);
  }
  const seed =
    typeof value === "string" && /^-?\d+$/.test(value.trim())
      ? Number(value)
      : NaN;
  if (!Number.isSafeInteger(seed)) {
    throw new MatchSessionRequestError("seed는 정수여야 합니다.", 400);
  }
  return seed;
};

const toRecommendationPlayer = (
  member: MatchSessionMember,
): RecommendationPlayer => ({
  id: member.id,
  username: member.username,
  avatarUrl: member.avatarUrl,
  doublesRating: member.duprRating?.doubles ?? null,
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
    const seed = parseRecommendationSeed(req.query.seed);

    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const session = await requireMatchSessionDetail(sessionId, now);
    if (!session.isToday) {
      throw new MatchSessionRequestError(
        "오늘 세션에서만 추천 매칭을 볼 수 있습니다.",
        403,
      );
    }

    const [busyPlayerIds, sessionMatches] = await Promise.all([
      matchRepository.findInProgressPlayerIds(now),
      matchRepository.findBySession(sessionId),
    ]);
    const plan = recommendDoublesMatches({
      participants: session.participants.map((member) => ({
        id: member.id,
        doublesRating: member.duprRating?.doubles ?? null,
      })),
      busyPlayerIds,
      completedMatches: sessionMatches
        .filter((match) => match.status === "completed")
        .map((match) => ({
          teams: [
            match.teams[0].players.map((player) => player.id),
            match.teams[1].players.map((player) => player.id),
          ],
        })),
      courts,
      seed,
    });

    // 알고리즘은 participants 안의 id만 돌려주므로 조회가 항상 성공한다.
    const playersById = new Map(
      session.participants.map((member) => [
        member.id,
        toRecommendationPlayer(member),
      ]),
    );
    const playerOf = (id: string) => playersById.get(id)!;
    const toTeam = (
      [first, second]: [string, string],
      averageRating: number,
    ): RecommendedTeam => ({
      players: [playerOf(first), playerOf(second)],
      averageRating,
    });

    const response: MatchSessionRecommendationResponse = {
      sessionId,
      requestedCourts: courts,
      seed,
      courts: plan.courts.map((court) => ({
        teams: [
          toTeam(court.teams[0], court.teamAverages[0]),
          toTeam(court.teams[1], court.teamAverages[1]),
        ],
        repeatedPartnerPairs: court.repeatedPartnerPairs,
        repeatedOpponentPairs: court.repeatedOpponentPairs,
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
    await requireTodaySessionForParticipants(sessionId, now);
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
      await requireTodaySessionForParticipants(sessionId, now);
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
    const { type, teams, location, courtName } = body ?? {};
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
    if (toKstDateKey(requestedSession.date) !== toKstDateKey(now)) {
      throw new MatchRecordRequestError(
        "오늘 세션에서만 경기를 시작할 수 있습니다.",
        403,
      );
    }

    const lineup = await prepareMatchLineup(type, teams, decoded.playerId);
    const playerIds = getTeamPlayerIds(lineup.teams);
    const inProgressPlayerIds = new Set(
      await matchRepository.findInProgressPlayerIds(now),
    );
    if (playerIds.some((playerId) => inProgressPlayerIds.has(playerId))) {
      throw new MatchRecordRequestError(
        "이미 진행 중인 경기에 들어간 선수가 있습니다.",
        409,
      );
    }

    const session = await resolveSessionForNewMatch(sessionId, now);
    if (session) {
      await matchRepository.addSessionParticipants(session.id, playerIds);
    }
    const match = await matchRepository.create({
      type: lineup.type,
      mode: DEFAULT_MATCH_MODE,
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
      creatorPlayerId: decoded.playerId,
      status: "created",
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      location: normalizeOptionalName(location) ?? requestedSession.location,
      courtName: normalizedCourtName ?? undefined,
      matchStartsAt: now,
      completedAt: null,
    });
    res.status(201).json(match);
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
    if (session) {
      // 경기 저장 전에 참여자를 넣어, 저장된 세션 경기의 선수는 항상 참여자이게 한다.
      await matchRepository.addSessionParticipants(
        session.id,
        getTeamPlayerIds(prepared.teams),
      );
    }
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
    };
    res.status(201).json(response);
  } catch (err) {
    console.error("[MATCH] 경기 기록 후 평점 반영 실패", match.id, err);
    res.status(500).json({ error: MATCH_RATING_APPLY_FAILURE_MESSAGE });
  }
});

app.post("/api/admin/match-sessions", requireAdmin, async (req, res) => {
  try {
    const session = normalizeMatchSession(req.body as MatchSessionRequest);
    if (!session) {
      return res.status(400).json({ error: "세션 정보가 필요합니다." });
    }

    res.status(201).json(await matchRepository.createSession(session));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/admin/match-sessions", requireAdmin, async (_req, res) => {
  try {
    res.json(await matchRepository.findSessions());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
      await matchRepository.deleteSession(req.params.sessionId);
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

app.put(
  "/api/admin/match-sessions/:sessionId/participants",
  requireAdmin,
  async (req, res) => {
    try {
      const requestedPlayerIds = Array.isArray(req.body?.playerIds)
        ? req.body.playerIds
        : null;
      if (
        !requestedPlayerIds ||
        requestedPlayerIds.some(
          (playerId: unknown) => typeof playerId !== "string",
        )
      ) {
        return res.status(400).json({ error: "참여자 목록이 필요합니다." });
      }

      const availablePlayerIds = new Set(
        (await authService.getAllPlayers())
          .filter((player) => player.status === "active")
          .map((player) => player.id),
      );
      if (
        requestedPlayerIds.some(
          (playerId: string) => !availablePlayerIds.has(playerId),
        )
      ) {
        return res
          .status(400)
          .json({ error: "유효한 활성 회원만 참여자로 등록할 수 있습니다." });
      }

      res.json(
        await matchRepository.replaceSessionParticipants(
          req.params.sessionId,
          requestedPlayerIds,
        ),
      );
    } catch (err) {
      const status =
        err instanceof MatchRepositoryError && err.status === 404 ? 404 : 400;
      res.status(status).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/api/admin/match-sessions/:sessionId/matches",
  requireAdmin,
  async (req, res) => {
    try {
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }
      const session = await matchRepository.findSessionById(
        req.params.sessionId,
      );
      if (!session) {
        return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
      }

      const { name, type, mode, teams, courtName, matchStartsAt } =
        req.body as AdminScheduledMatchRequest;
      if (!isMatchType(type)) {
        return res
          .status(400)
          .json({ error: "유효한 매치 타입이 필요합니다." });
      }
      if (mode != null && !isMatchMode(mode)) {
        return res.status(400).json({ error: "유효한 경기 모드가 필요합니다." });
      }
      if (!teams || teams.length !== 2) {
        return res.status(400).json({ error: "두 팀 구성이 필요합니다." });
      }

      const matchStartsAtDate = new Date(matchStartsAt ?? "");
      if (Number.isNaN(matchStartsAtDate.getTime())) {
        return res.status(400).json({ error: "경기 예정 일시가 필요합니다." });
      }

      const registeredPlayerIds = new Set(session.participantIds);
      const requestedPlayerIds = normalizeRequestedTeamPlayerIds(teams);
      if (
        requestedPlayerIds.length === 0 ||
        requestedPlayerIds.some(
          (playerId) => !registeredPlayerIds.has(playerId),
        )
      ) {
        return res.status(400).json({
          error: "세션에 등록된 참여자만 경기에 배정할 수 있습니다.",
        });
      }

      const allPlayers = await authService.getAllPlayers();
      const playersById = new Map<string, Player>(
        allPlayers
          .filter(
            (player) =>
              player.status === "active" &&
              registeredPlayerIds.has(player.id),
          )
          .map((player) => [player.id, player]),
      );
      const matchTeams = buildMatchTeamsFromRequests(teams, playersById);
      if (
        !validateCreateMatchTeams(type, [
          matchTeams[0].players,
          matchTeams[1].players,
        ])
      ) {
        return res.status(400).json({
          error: `${matchTypeLabels[type]}에 맞는 팀 구성이 필요합니다.`,
        });
      }

      const match = await matchRepository.create({
        name: normalizeOptionalName(name),
        session: {
          id: session.id,
          name: session.name,
          date: session.date,
          location: session.location,
        },
        type,
        mode: mode ?? DEFAULT_MATCH_MODE,
        source: "admin_created",
        creatorPlayerId: decoded.playerId,
        status: "created",
        teams: matchTeams,
        scores: [],
        resultSubmittedByPlayerId: null,
        resultSubmittedAt: null,
        location: session.location,
        courtName: normalizeNullableCourtName(courtName) ?? undefined,
        matchStartsAt: matchStartsAtDate,
        completedAt: null,
      });
      res.status(201).json(match);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/api/admin/match-sessions/:sessionId/matches/schedule-preview",
  requireAdmin,
  async (req, res) => {
    try {
      const context = await loadAdminSessionMatchContext(req.params.sessionId);
      if (!context) {
        return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
      }

      const body = req.body as AdminScheduledMatchBatchRequest;
      const courts = normalizeCourtNames(body.courts);
      const matches = prepareAdminScheduledMatches({
        requestedMatches: body.matches,
        registeredPlayerIds: context.registeredPlayerIds,
        playersById: context.playersById,
        requireSchedule: false,
      });
      const existingMatches = await matchRepository.findBySession(
        context.session.id,
      );
      const schedule = buildCourtSchedule({
        courts,
        sessionStartsAt: context.session.date,
        existingMatches,
        modes: matches.map((match) => match.mode),
      });

      res.json({
        schedule: schedule.map((slot) => ({
          courtName: slot.courtName,
          matchStartsAt: slot.matchStartsAt.toISOString(),
        })),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/api/admin/match-sessions/:sessionId/matches/scheduled-batch",
  requireAdmin,
  async (req, res) => {
    try {
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }

      const context = await loadAdminSessionMatchContext(req.params.sessionId);
      if (!context) {
        return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
      }

      const body = req.body as AdminScheduledMatchBatchRequest;
      const courts = normalizeCourtNames(body.courts);
      const matches = prepareAdminScheduledMatches({
        requestedMatches: body.matches,
        registeredPlayerIds: context.registeredPlayerIds,
        playersById: context.playersById,
        requireSchedule: true,
      });
      const existingMatches = await matchRepository.findBySession(
        context.session.id,
      );
      const conflicts = findCourtScheduleConflicts({
        courts,
        existingMatches,
        scheduledMatches: matches.map((match) => ({
          name: match.name,
          mode: match.mode,
          matchStartsAt: match.matchStartsAt!,
          courtName: match.courtName,
        })),
      });
      if (conflicts.length > 0) {
        return res.status(400).json({ error: conflicts[0] });
      }

      const createdMatches = await matchRepository.createScheduledBatch(
        matches.map((match) => ({
          name: match.name,
          session: {
            id: context.session.id,
            name: context.session.name,
            date: context.session.date,
            location: context.session.location,
          },
          type: match.type,
          mode: match.mode,
          source: "admin_created" as const,
          creatorPlayerId: decoded.playerId,
          status: "created" as const,
          teams: match.teams,
          scores: [],
          resultSubmittedByPlayerId: null,
          resultSubmittedAt: null,
          location: context.session.location,
          courtName: match.courtName!,
          matchStartsAt: match.matchStartsAt!,
          completedAt: null,
        })),
      );

      res.status(201).json({
        matches: createdMatches,
        createdCount: createdMatches.length,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

app.post("/api/admin/matches/batch", requireAdmin, async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const { matches: payloadMatches, session: requestedSession } =
      req.body as AdminBatchMatchRequest;
    if (!Array.isArray(payloadMatches) || payloadMatches.length === 0) {
      return res.status(400).json({ error: "한 개 이상의 경기가 필요합니다." });
    }

    const commonSession = normalizeMatchSession(requestedSession);

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
        mode,
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
      if (mode != null && !isMatchMode(mode)) {
        throw new Error(`${label}: 유효한 경기 모드가 필요합니다.`);
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
      const resolvedMode = mode ?? inferMatchModeFromScores(normalizedScores);
      validateMatchScoresForMode(resolvedMode, normalizedScores);

      return {
        name: normalizeOptionalName(name),
        session: commonSession,
        type,
        mode: resolvedMode,
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
      };
    });

    const createdMatches = commonSession
      ? await matchRepository.createCompletedBatch(matchesToCreate)
      : await Promise.all(matchesToCreate.map((match) => matchRepository.create(match)));
    const ratingResult = await authService.applyMatchResultsToRatings(createdMatches);
    const { ratingChangeLogs, changedPlayerCount } = ratingResult;

    res.status(201).json({
      matches: createdMatches,
      createdCount: createdMatches.length,
      completedMatchCount: createdMatches.length,
      changedPlayerCount,
      ratingChangeLogs,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/admin/matches", requireAdmin, async (_req, res) => {
  try {
    const result = await matchRepository.findAll(0, 10000);
    res.json(result.matches);
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

app.patch(
  "/api/admin/matches/:matchId/metadata",
  requireAdmin,
  async (req, res) => {
    try {
      const body = req.body as AdminMatchMetadataUpdateRequest;
      const match = await matchRepository.updateMetadata(
        req.params.matchId,
        parseAdminMatchMetadataUpdate(body),
      );

      res.json(match);
    } catch (err) {
      if (err instanceof MatchRepositoryError && err.status === 404) {
        return res.status(404).json({ error: err.message });
      }
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

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

    res.json({ ...result.match, ratingChanges: result.ratingChanges });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post(
  "/api/admin/matches/:matchId/result",
  requireAdmin,
  async (req, res) => {
    try {
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }

      const scores = normalizeMatchScores(
        (req.body as SubmitMatchResultRequest).scores,
      );
      const match = await matchRepository.recordAdminResult(
        req.params.matchId,
        decoded.playerId,
        scores,
      );
      const ratingResult = await authService.applyMatchResultToRatings(match);

      res.json({ match, ...ratingResult });
    } catch (err) {
      if (err instanceof MatchRepositoryError && err.status === 409) {
        return res.status(409).json({ error: err.message });
      }
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

app.delete(
  "/api/admin/matches/:matchId",
  requireAdmin,
  async (req, res) => {
    try {
      await matchRepository.delete(req.params.matchId);
      const { matches } = await matchRepository.findAll(0, 10000);
      const recalculation = await authService.recalculateDuprRatings(
        matches.filter((candidate) => candidate.status === "completed"),
        {
          source: "manual_recalculation",
          sourceLogId: `admin-match-delete-${req.params.matchId}-${Date.now()}-${randomUUID()}`,
          perMatchLogs: true,
        },
      );

      res.json({ deletedMatchId: req.params.matchId, ...recalculation });
    } catch (err) {
      if (err instanceof MatchRepositoryError && err.status === 404) {
        return res.status(404).json({ error: err.message });
      }
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

/** 점수 없는 created 경기가 시작 후 2시간을 넘겨 무효가 됐으면 true */
const isExpiredInProgressMatch = (match: Match, now: Date) =>
  isMatchInProgress(match) &&
  (match.scores?.length ?? 0) === 0 &&
  isInProgressMatchExpired(match.matchStartsAt, now);

app.put("/api/matches/:matchId", async (req, res) => {
  const decoded = await getAuthPayload(req, res);
  if (!decoded) {
    return;
  }

  const matchId = req.params.matchId;
  let wasCompleted: boolean;
  let match: Match;
  try {
    const now = new Date();
    await matchRepository.cleanupExpired(now);
    const existing = await matchRepository.findById(matchId);
    // 정리가 실패해 남아 있어도 만료된 진행 중 경기는 없는 경기로 본다.
    if (!existing || isExpiredInProgressMatch(existing, now)) {
      return res.status(404).json({ error: "매치를 찾을 수 없습니다." });
    }
    // 관리자 여부와 무관하게 수정 전 참가자 또는 경기 생성자만 고칠 수 있다(세션 경기 포함).
    if (!canEditMatchRecord(existing, decoded.playerId)) {
      return res.status(403).json({
        error: "경기 참가자 또는 생성자만 기록을 수정할 수 있습니다.",
      });
    }
    if (!isWithinMatchEditWindow(existing.matchStartsAt, now)) {
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

    const prepared = await prepareRecordedMatch(
      req.body as Partial<RecordMatchRequest>,
      decoded.playerId,
    );
    if (existing.session) {
      // 바뀐 팀의 새 선수도 세션 참여자로 넣는다. 빠진 선수는 참여자에서 지우지 않는다.
      await matchRepository.addSessionParticipants(
        existing.session.id,
        getTeamPlayerIds(prepared.teams),
      );
    }
    wasCompleted = existing.status === "completed";
    match = await matchRepository.updateRecordedMatch(matchId, {
      ...prepared,
      resultSubmittedByPlayerId: decoded.playerId,
      resultSubmittedAt: now,
    });
  } catch (err) {
    return sendMatchRecordFailure(res, err);
  }

  try {
    let ratingChanges: PlayerRatingChangeLog[];
    if (wasCompleted) {
      // 증분 반영은 같은 경기의 로그가 이미 있으면 아무것도 하지 않으므로, 반영된 경기를 고치면 전체 재계산한다.
      const { matches } = await matchRepository.findAll(0, 10000);
      const { perMatchLogs } = await authService.recalculateDuprRatings(
        matches.filter((candidate) => candidate.status === "completed"),
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
    const response: RecordedMatchResponse = { ...match, ratingChanges };
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

app.get("/api/admin/players", requireAdmin, async (_req, res) => {
  try {
    const players = await authService.getAdminPlayers();
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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

      const { gender } = req.body as { gender?: Player["gender"] };
      if (!gender || !playerGenders.includes(gender)) {
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
    const { matches } = await matchRepository.findAll(0, 10000);
    const completedMatches = matches.filter(
      (match) => match.status === "completed",
    );
    const result = await authService.recalculateDuprRatings(completedMatches, {
      source: "manual_recalculation",
      sourceLogId: `manual-recalculation-${Date.now()}-${randomUUID()}`,
      perMatchLogs: true,
    });

    res.json({
      ...result,
      completedMatchCount: completedMatches.length,
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

      const { matches } = await matchRepository.findAll(0, 10000);
      const result = await authService.applyOfficialDuprAdjustment(
        {
          playerId: req.params.playerId,
          changedByPlayerId: decoded.playerId,
          ratings: req.body.ratings,
          confidence: req.body.confidence,
          reason: req.body.reason,
        },
        matches.filter((match) => match.status === "completed"),
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

      const { matches } = await matchRepository.findAll(0, 10000);
      const result = await authService.previewOfficialDuprAdjustment(
        {
          playerId: req.params.playerId,
          changedByPlayerId: decoded.playerId,
          ratings: req.body.ratings,
          confidence: req.body.confidence,
          reason: req.body.reason,
        },
        matches.filter((match) => match.status === "completed"),
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

export { app };

export const startServer = async () => {
  assertRequiredEnv();
  await initDatabase();
  await authService.seedDevAuthAccounts();
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

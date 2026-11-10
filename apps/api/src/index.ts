import cors from "cors";
import express from "express";
import fs from "fs/promises";
import { createHash, randomUUID, timingSafeEqual } from "crypto";
import path from "path";
import {
  computeMatchStartsAt,
  DEFAULT_MATCH_MODE,
  MATCH_RESULT_MAX_SCORE_COUNT,
  isSinglesMatchType,
  inferMatchModeFromScores,
  matchModeValues,
  matchTypeLabels,
  matchTypeValues,
  type MatchMode,
  type MatchScore,
  type Team,
  type Session,
  type MatchType,
  validateMatchScoresForMode,
} from "@pkpkdupr/shared/match";
import { generateEntityId, isEntityId } from "@pkpkdupr/shared/entityId";
import {
  PLAYER_AFFILIATION_MAX_COUNT,
  PLAYER_AFFILIATION_NAME_MAX_LENGTH,
  PLAYER_STATUS_MESSAGE_MAX_LENGTH,
} from "@pkpkdupr/shared/player";
import type {
  MemberListPlayer,
  Player,
  PlayerAffiliation,
  PlayerStatus,
} from "@pkpkdupr/shared/player";
import type { VerifyPlayerQrTokenRequest } from "@pkpkdupr/shared/qr";
import { initDatabase } from "./db";
import {
  MatchRepository,
  MatchRepositoryError,
} from "./repositories/MatchRepository";
import {
  AuthService,
  InvalidAccessTokenError,
  type AuthenticatedSession,
} from "./services/AuthService";
import { AutoApprovalService } from "./services/AutoApprovalService";
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
import { sensitiveResponseHeaders } from "./middleware/sensitiveResponseHeaders";
import { isEdgeRuntime } from "./runtime";

const app: express.Express = express();
const PORT = process.env.PORT || 4000;
const AVATAR_UPLOAD_ROUTE = "/uploads/avatars";
const AVATAR_MAX_BYTES = 1024 * 1024;
const AVATAR_MIME_TO_EXT: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const defaultAvatarUploadDir =
  path.basename(process.cwd()) === "api" &&
  path.basename(path.dirname(process.cwd())) === "apps"
    ? path.resolve(process.cwd(), "../../data/uploads/avatars")
    : path.resolve(process.cwd(), "data/uploads/avatars");
const avatarUploadDir = process.env.AVATAR_UPLOAD_DIR
  ? path.resolve(process.env.AVATAR_UPLOAD_DIR)
  : defaultAvatarUploadDir;
const PROTECTED_ADMIN_USERNAME = process.env.API_ADMIN_USERNAME || "admin";
const INITIAL_ADMIN_CREATED_PASSWORD = "123qwe";
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
      // 허용되지 않은 origin은 에러(500) 대신 CORS 헤더 없이 응답해 브라우저가 차단하게 한다.
      callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(sensitiveResponseHeaders);
app.use(AVATAR_UPLOAD_ROUTE, express.static(avatarUploadDir));

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
const autoApprovalService = new AutoApprovalService(matchRepository, authService);
const AUTO_APPROVAL_INTERVAL_MS = 60_000;
let autoApprovalInterval: ReturnType<typeof setInterval> | undefined;
const playerStatuses: PlayerStatus[] = ["active", "inactive"];
const playerGenders: Array<Player["gender"]> = ["M", "F"];

type CreateMatchRequest = {
  name?: string;
  type?: MatchType;
  mode?: MatchMode;
  teams?: [
    { name?: string; playerIds?: string[] },
    { name?: string; playerIds?: string[] },
  ];
  location?: string;
  courtName?: string;
  matchStartsAt?: string;
};

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

const parseAvatarDataUrl = (value: unknown) => {
  if (typeof value !== "string") {
    throw new Error("이미지 데이터가 필요합니다.");
  }

  const match = value.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) {
    throw new Error("지원하지 않는 이미지 형식입니다.");
  }

  const [, mime, base64] = match;
  const ext = AVATAR_MIME_TO_EXT[mime];
  if (!ext) {
    throw new Error("지원하지 않는 이미지 형식입니다.");
  }

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) {
    throw new Error("이미지 데이터가 비어 있습니다.");
  }

  if (buffer.length > AVATAR_MAX_BYTES) {
    throw new Error("프로필 이미지는 1MB 이하만 업로드할 수 있습니다.");
  }

  return { buffer, ext };
};

const getLocalAvatarPath = (avatarUrl?: string | null) => {
  if (!avatarUrl?.startsWith(`${AVATAR_UPLOAD_ROUTE}/`)) {
    return null;
  }

  const fileName = path.basename(avatarUrl);
  if (
    !fileName ||
    fileName !== avatarUrl.slice(AVATAR_UPLOAD_ROUTE.length + 1)
  ) {
    return null;
  }

  return path.join(avatarUploadDir, fileName);
};

const removeLocalAvatarIfExists = async (avatarUrl?: string | null) => {
  const avatarPath = getLocalAvatarPath(avatarUrl);
  if (!avatarPath) {
    return;
  }

  await fs.unlink(avatarPath).catch(() => undefined);
};

const getBearerToken = (req: express.Request, res: express.Response) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "토큰이 필요합니다." });
    return null;
  }
  return header.split(" ")[1];
};

const getAuthSession = async (
  req: express.Request,
  res: express.Response,
): Promise<AuthenticatedSession | null> => {
  const token = getBearerToken(req, res);
  if (!token) {
    return null;
  }

  try {
    return await authService.authenticateAccessToken(token);
  } catch (err) {
    res.status(403).json({ error: (err as Error).message });
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
    return res.status(403).json({ error: "관리자 권한이 필요합니다." });
  }
  next();
};

app.post("/api/register", async (req, res) => {
  try {
    const { username, password, gender } = req.body;
    if (!username || !password || !gender) {
      return res
        .status(400)
        .json({ error: "username, password, gender는 필수입니다." });
    }
    const player = await authService.register({ username, password, gender });
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "username과 password는 필수입니다." });
    }
    const result = await authService.login(
      username,
      password,
      rememberMe === true,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/me", async (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.split(" ")[1] : null;

  if (!token) {
    return res.status(401).json({
      error: "로그인이 필요합니다.",
      code: "SESSION_INVALID",
    });
  }

  try {
    const session = await authService.authenticateAccessToken(token);
    res.json({
      ...session.player,
      isFirstLogin: session.isFirstLogin,
      isAdmin: session.payload.isAdmin === true,
      accessToken: session.refreshedAccessToken,
    });
  } catch (error) {
    if (error instanceof InvalidAccessTokenError) {
      return res.status(401).json({
        error: "세션이 만료되었거나 유효하지 않습니다.",
        code: "SESSION_INVALID",
      });
    }

    console.error("[AUTH] Failed to verify session", error);
    res.status(503).json({
      error: "세션을 일시적으로 확인하지 못했습니다.",
      code: "SESSION_UNAVAILABLE",
    });
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

app.get("/api/player-qr-token", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const result = await authService.createPlayerQrToken(decoded.playerId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/dev/player-qr-tokens", async (_req, res) => {
  try {
    const result = await authService.getDevPlayerQrTokens();
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

app.post("/api/player-qr-token/verify", async (req, res) => {
  try {
    if (!(await getAuthPayload(req, res))) {
      return;
    }

    const { payload } = req.body as VerifyPlayerQrTokenRequest;
    if (!payload) {
      return res.status(400).json({ error: "payload는 필수입니다." });
    }

    const result = await authService.verifyPlayerQrToken(payload);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
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

    res.json(await matchRepository.findBySession(sessionId));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/matches", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const { name, type, mode, teams, location, courtName, matchStartsAt } =
      req.body as CreateMatchRequest;
    if (type != null && !isMatchType(type)) {
      return res.status(400).json({ error: "유효한 매치 타입이 필요합니다." });
    }
    if (mode != null && !isMatchMode(mode)) {
      return res.status(400).json({ error: "유효한 경기 모드가 필요합니다." });
    }

    if (!teams || teams.length !== 2) {
      return res.status(400).json({ error: "두 팀 구성이 필요합니다." });
    }

    const normalizedLocation = normalizeOptionalName(location);
    if (!normalizedLocation) {
      return res.status(400).json({ error: "장소를 입력해주세요." });
    }

    const creator = await authService.getPlayerById(decoded.playerId);
    if (
      !creator ||
      creator.status !== "active" ||
      creator.username === PROTECTED_ADMIN_USERNAME
    ) {
      return res
        .status(403)
        .json({ error: "매치를 생성할 수 없는 계정입니다." });
    }

    const publicPlayers = await authService.getPublicPlayers();
    const playersById = new Map<string, Player>(
      [creator, ...publicPlayers].map((player) => [player.id, player]),
    );
    const flatPlayerIds = normalizeRequestedTeamPlayerIds(teams);
    if (!flatPlayerIds.includes(decoded.playerId)) {
      return res
        .status(400)
        .json({ error: "매치 멤버에 본인이 포함되어야 합니다." });
    }

    const matchTeams = buildMatchTeamsFromRequests(teams, playersById);
    const resolvedMatchType = type
      ? type
      : inferMatchTypeFromTeams([matchTeams[0].players, matchTeams[1].players]);

    if (
      !validateCreateMatchTeams(resolvedMatchType, [
        matchTeams[0].players,
        matchTeams[1].players,
      ])
    ) {
      return res.status(400).json({
        error: `${matchTypeLabels[resolvedMatchType]}에 맞는 유효한 팀 구성이 필요합니다.`,
      });
    }

    const matchStartsAtDate = matchStartsAt
      ? new Date(matchStartsAt)
      : computeMatchStartsAt();
    if (Number.isNaN(matchStartsAtDate.getTime())) {
      return res
        .status(400)
        .json({ error: "유효한 매치 시작 시간이 필요합니다." });
    }

    const match = await matchRepository.create({
      name: normalizeOptionalName(name),
      type: resolvedMatchType,
      mode: mode ?? DEFAULT_MATCH_MODE,
      source: "player_created",
      creatorPlayerId: decoded.playerId,
      status: "created",
      teams: matchTeams,
      scores: [],
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      approvals: [],
      location: normalizedLocation,
      courtName: normalizeNullableCourtName(courtName) ?? undefined,
      matchStartsAt: matchStartsAtDate,
      completedAt: null,
    });

    res.status(201).json(match);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
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
          .filter(
            (player) =>
              player.status === "active" &&
              player.username !== PROTECTED_ADMIN_USERNAME,
          )
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
        approvals: [],
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
          approvals: [],
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
      (candidate) =>
        candidate.status === "active" &&
        candidate.username !== PROTECTED_ADMIN_USERNAME,
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
        approvals: [],
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

app.post("/api/matches/:matchId/result", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const existingMatch = await matchRepository.findById(req.params.matchId);
    if (!existingMatch) {
      return res.status(404).json({ error: "매치를 찾을 수 없습니다." });
    }
    if (existingMatch.session && !decoded.isAdmin) {
      return res
        .status(403)
        .json({ error: "세션 경기 결과는 관리자만 입력할 수 있습니다." });
    }
    if (
      !existingMatch.session &&
      existingMatch.creatorPlayerId !== decoded.playerId
    ) {
      return res
        .status(403)
        .json({ error: "경기 생성자만 결과를 입력할 수 있습니다." });
    }

    const { scores } = req.body as SubmitMatchResultRequest;
    const normalizedScores = normalizeMatchScores(scores);
    const match = await matchRepository.submitResult(
      req.params.matchId,
      decoded.playerId,
      normalizedScores,
    );

    res.json(match);
  } catch (err) {
    if (err instanceof MatchRepositoryError && err.status === 409) {
      return res.status(409).json({ error: err.message });
    }
    res.status(400).json({ error: (err as Error).message });
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
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }
      const isValidAdminPassword = await authService.verifyAdminPassword(
        decoded.playerId,
        req.body?.adminPassword,
      );
      if (!isValidAdminPassword) {
        return res
          .status(400)
          .json({ error: "admin 비밀번호가 올바르지 않습니다." });
      }

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

app.post("/api/matches/:matchId/approval", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const match = await matchRepository.approveResult(
      req.params.matchId,
      decoded.playerId,
    );

    if (match.status === "completed") {
      await authService.applyMatchResultToRatings(match);
    }

    res.json(match);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete("/api/matches/:matchId/approval", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    const match = await matchRepository.cancelApproval(
      req.params.matchId,
      decoded.playerId,
    );

    res.json(match);
  } catch (err) {
    if (err instanceof MatchRepositoryError && err.status === 409) {
      return res.status(409).json({ error: err.message });
    }
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/matches/:matchId/rejection", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }

    res.json(
      await matchRepository.rejectResult(req.params.matchId, decoded.playerId),
    );
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/change-password", async (req, res) => {
  try {
    const decoded = await getAuthPayload(req, res);
    if (!decoded) {
      return;
    }
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "비밀번호는 6자 이상이어야 합니다." });
    }
    await authService.changePassword(
      decoded.playerId,
      typeof currentPassword === "string" ? currentPassword : undefined,
      newPassword,
    );
    res.json({ message: "비밀번호가 변경되었습니다." });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
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
      avatarUrl?: string | null;
      affiliations?: PlayerAffiliation[];
      statusMessage?: string | null;
      statusMessageBackgroundColor?: string | null;
    } = {};
    const avatarUrl = input.avatarUrl;
    if (
      typeof avatarUrl === "string" &&
      avatarUrl.trim().length > 0 &&
      avatarUrl.trim().length > 2048
    ) {
      return res
        .status(400)
        .json({ error: "프로필 이미지 URL이 너무 깁니다." });
    }
    if (hasOwnProperty(input, "avatarUrl")) {
      update.avatarUrl =
        typeof avatarUrl === "string" && avatarUrl.trim()
          ? avatarUrl.trim()
          : null;
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
  let nextAvatarPath: string | null = null;

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
    const { buffer, ext } = parseAvatarDataUrl(imageDataUrl);
    const fileName = `${decoded.playerId}-${Date.now()}-${randomUUID()}.${ext}`;
    const avatarUrl = `${AVATAR_UPLOAD_ROUTE}/${fileName}`;
    nextAvatarPath = path.join(avatarUploadDir, fileName);

    await fs.mkdir(avatarUploadDir, { recursive: true });
    await fs.writeFile(nextAvatarPath, buffer);

    const player = await authService.updatePlayerProfile(decoded.playerId, {
      avatarUrl,
    });
    await removeLocalAvatarIfExists(previousPlayer.avatarUrl);

    res.json(player);
  } catch (err) {
    if (nextAvatarPath) {
      await fs.unlink(nextAvatarPath).catch(() => undefined);
    }
    res.status(400).json({ error: (err as Error).message });
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

    const player = await authService.updatePlayerProfile(decoded.playerId, {
      avatarUrl: null,
    });
    await removeLocalAvatarIfExists(previousPlayer.avatarUrl);

    res.json(player);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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

app.post(
  "/api/admin/players/:playerId/password-reset",
  requireAdmin,
  async (req, res) => {
    try {
      const decoded = await getAuthPayload(req, res);
      if (!decoded) {
        return;
      }

      const { password } = req.body as { password?: unknown };
      if (typeof password !== "string" || password.length < 6) {
        return res
          .status(400)
          .json({ error: "임시 비밀번호는 6자 이상이어야 합니다." });
      }

      const player = await authService.resetPlayerPassword(
        req.params.playerId,
        password,
        decoded.playerId,
      );

      res.json({ player });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
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

app.get("/api/admin/ratings/comparison", requireAdmin, async (_req, res) => {
  try {
    const { matches } = await matchRepository.findAll(0, 10000);
    const completedMatches = matches.filter(
      (match) => match.status === "completed",
    );

    // 이전에 추가된 테스트 매치는 참가자 당시의 DUPR 스냅샷과 저장 레이팅이
    // 비어 있을 수 있다. 비교값을 만들기 전에 신규 득점률식으로 한 번 재생해
    // 누락 데이터를 보강하고, 두 방식 모두 같은 완료 매치 집합에서 계산한다.
    await authService.recalculateDuprRatings(completedMatches);
    res.json(await authService.compareRatingMethods(completedMatches));
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

    const { username, gender } = req.body;
    if (!username || !gender) {
      return res.status(400).json({ error: "username, gender는 필수입니다." });
    }
    const player = await authService.registerAdmin(
      { username, password: INITIAL_ADMIN_CREATED_PASSWORD, gender },
      decoded.playerId,
    );
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export const processAutoApprovals = (now: Date = new Date()) =>
  autoApprovalService.process(now);

const hashCronSecret = (value: string) =>
  createHash("sha256").update(value).digest();

/** 길이가 달라도 비교 시간이 같도록 해시끼리 비교한다. */
const isValidCronSecret = (received: string | undefined) => {
  const expected = process.env.CRON_SECRET;
  if (!expected || !received) return false;
  return timingSafeEqual(hashCronSecret(received), hashCronSecret(expected));
};

// Supabase Cron(pg_cron + pg_net)이 주기적으로 호출한다. 로컬 Node 개발에서는 interval이 같은 처리를 한다.
app.post("/api/internal/cron/auto-approvals", async (req, res) => {
  if (!isValidCronSecret(req.header("x-cron-secret"))) {
    return res.status(401).json({ error: "인증되지 않은 요청입니다." });
  }

  try {
    const { completedMatches, appliedRatingCount } =
      await processAutoApprovals();
    res.json({
      completedMatchCount: completedMatches.length,
      appliedRatingCount,
    });
  } catch (error) {
    console.error("[AUTO_APPROVAL] 자동 합의 처리 실패", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export { app };

const startAutoApprovalScheduler = () => {
  if (autoApprovalInterval) return;

  const process = () => {
    void processAutoApprovals().catch((error) => {
      console.error("[AUTO_APPROVAL] 자동 합의 처리 실패", error);
    });
  };

  process();
  autoApprovalInterval = setInterval(process, AUTO_APPROVAL_INTERVAL_MS);
  autoApprovalInterval.unref?.();
};

export const startServer = async () => {
  await initDatabase();
  await authService.initAdmin();
  startAutoApprovalScheduler();
  return (app as any).listen(PORT, () => {
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
    console.log(
      `👤 Admin 계정 동기화 (${process.env.API_ADMIN_USERNAME || "admin"} / ${process.env.API_ADMIN_PASSWORD || "admin123qwe"})`,
    );
  });
};

// Edge Runtime은 supabase/functions/api 진입점이 app을 서비스하므로 Node 부팅(시딩·관리자 동기화·interval·listen)을 건너뛴다.
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

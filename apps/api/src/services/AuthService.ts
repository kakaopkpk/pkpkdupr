import {
  OfficialDuprAdjustmentLog,
  OfficialDuprAdjustmentImpact,
  OfficialDuprAdjustmentPreview,
  Player,
  PlayerAffiliation,
  PlayerCreationLog,
  PlayerCreationSource,
  PlayerDupr,
  PlayerDuprCategory,
  PlayerDuprMetrics,
  PlayerRatingChangeLog,
  PlayerRatingChangeSource,
  PlayerStatus,
  PlayerStatusChangeLog,
  PublicPlayerDupr,
  StoredPlayerDupr,
  createDefaultPlayerDupr,
  createDefaultPlayerDuprMetrics,
  getDuprMetricByCategory,
  getDuprRatingByCategory,
  normalizeNullablePlayerDupr,
  normalizePlayerDupr,
  normalizeStoredPlayerDupr,
  normalizeDuprRatingValue,
  roundDuprRating,
  setDuprMetricByCategory,
  setDuprRatingByCategory,
  toPublicPlayerDupr,
} from "@pkpkdupr/shared/player";
import type {
  DevPlayerQrTokenListResponse,
  PlayerQrPublicPlayer,
  PlayerQrTokenResponse,
  VerifyPlayerQrTokenResponse,
} from "@pkpkdupr/shared/qr";
import {
  isValidUsername,
  toInternalEmail,
  type AdminPasswordResetResponse,
  type AdminRegisterPlayerRequest,
  type AdminRegisterPlayerResponse,
  type AdminUpdateUsernameResponse,
  type AuthErrorCode,
} from "@pkpkdupr/shared/auth";
import { randomUUID } from "crypto";
import { generateEntityId } from "@pkpkdupr/shared/entityId";
import { SupabaseAuthUserVerifier } from "./supabaseAuthUser";
import {
  AuthEmailExistsError,
  generateInitialPassword,
  SupabaseAuthAdmin,
} from "./supabaseAuthAdmin";
import {
  createDevPlayerQrPayload,
  createPlayerQrToken as createPlayerQrTokenPayload,
  isDevPlayerQrPayload,
  verifyDevPlayerQrPayload,
  verifyPlayerQrPayload,
} from "./playerQrToken";
import {
  getDuprCategoryForMatchType,
  RatingService,
  type RatingServiceContract,
} from "./RatingService";
import { ScorePerformanceRatingService } from "./ScorePerformanceRatingService";
import { matchTypeValues, type Match, type MatchType } from "@pkpkdupr/shared/match";
import {
  getDevMockUsernames,
  isDevMockDataEnabled,
  type CreateStoredPlayerInput,
} from "@pkpkdupr/db";
import { db } from "../db";

const DEV_MOCK_DATA_ENABLED = process.env.ENABLE_DEV_MOCK_DATA === "true";

/** 로컬 dev mock 회원 Auth 계정의 공통 비밀번호. dev mock이 켜졌을 때만 쓴다. */
const DEV_MOCK_AUTH_PASSWORD = "devpass1234";

const USERNAME_FORMAT_MESSAGE =
  "아이디는 영문·숫자·.·_·-로 1~64자여야 하며 .은 맨 앞·맨 뒤나 연달아 쓸 수 없습니다.";
const DUPLICATE_USERNAME_MESSAGE = "중복된 사용자명입니다.";

interface StoredPlayerRecord extends Player {
  authUserId: string | null;
  isFirstLogin: boolean;
  duprMetrics: PlayerDuprMetrics;
  duprState: StoredPlayerDupr;
}

export interface AuthenticatedSession {
  payload: {
    playerId: string;
    isAdmin: boolean;
  };
  player: Player;
  /** 관리자가 발급·초기화한 비밀번호를 아직 바꾸지 않았다. */
  isFirstLogin: boolean;
}

/** 인증·가입 실패. index.ts가 code에 맞는 HTTP 상태로 응답한다. */
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * 세션 자체가 더 이상 유효하지 않은 경우에만 사용합니다. Auth 서버·DB 연결 같은
 * 일시적인 인프라 오류와 구분해 클라이언트가 저장된 세션을 보존할 수 있게 합니다.
 */
export class InvalidAccessTokenError extends AuthError {
  constructor(message: string) {
    super("SESSION_INVALID", message);
    this.name = "InvalidAccessTokenError";
  }
}

/** 관리자 계정 관리 요청의 실패. index.ts가 status 그대로 `{error}`로 응답한다. */
export class AccountRequestError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "AccountRequestError";
  }
}

export interface AdminPlayer extends Player {
  duprMetrics: PlayerDuprMetrics;
}

const buildId = (prefix: string) =>
  `${prefix}-${randomUUID()}`;

const createPlayer = (
  input: Pick<Player, "username" | "gender">,
): Player & { duprRating: null } => {
  const now = new Date();

  return {
    id: generateEntityId("player"),
    username: input.username,
    duprRating: null,
    gender: input.gender,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
};

const toDate = (value: string | Date) => new Date(value);

const hydratePlayer = (record: any): StoredPlayerRecord => {
  const duprState = normalizeStoredPlayerDupr(record.duprRating);
  return {
    ...record,
    avatarUrl: record.avatarUrl ?? undefined,
    duprRating: normalizeNullablePlayerDupr(record.duprRating),
    duprMetrics: duprState.metrics,
    duprState,
    isFirstLogin: record.isFirstLogin === true,
    status: record.status === "deleted" ? "inactive" : record.status,
    createdAt: toDate(record.createdAt),
    updatedAt: toDate(record.updatedAt),
  };
};

const hydrateCreationLog = (record: any): PlayerCreationLog => ({
  ...record,
  createdAt: toDate(record.createdAt),
});

const hydrateStatusChangeLog = (record: any): PlayerStatusChangeLog => ({
  ...record,
  previousStatus:
    record.previousStatus === "deleted" ? "inactive" : record.previousStatus,
  nextStatus: record.nextStatus === "deleted" ? "inactive" : record.nextStatus,
  changedAt: toDate(record.changedAt),
});

const averagePresent = (values: Array<number | null | undefined>) => {
  const presentValues = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  if (!presentValues.length) {
    return null;
  }
  return (
    presentValues.reduce((sum, value) => sum + value, 0) / presentValues.length
  );
};

const normalizeLegacyDuprTrackPatchValue = (
  value: unknown,
  keys: string[],
): number | undefined => {
  if (value == null) {
    return undefined;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const collapsed = averagePresent(
      keys
        .filter((key) => key in record)
        .map((key) => normalizeDuprRatingValue(record[key])),
    );
    return collapsed == null ? undefined : roundDuprRating(collapsed);
  }

  return normalizeDuprRatingValue(value);
};

const normalizeLegacyConfidencePatchValue = (
  value: unknown,
  keys: string[],
): number | undefined => {
  if (value == null) {
    return undefined;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const collapsed = averagePresent(
      keys
        .filter((key) => key in record)
        .map((key) => normalizeConfidenceValue(record[key])),
    );
    return collapsed == null ? undefined : Math.round(collapsed);
  }

  return normalizeConfidenceValue(value);
};

const normalizeLegacyAccuracyPatchValue = (
  value: unknown,
  keys: string[],
): number | null | undefined => {
  if (value == null) {
    return undefined;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const collapsed = averagePresent(
      keys.map((key) => {
        if (!(key in record)) {
          return null;
        }
        const rawValue = record[key];
        if (rawValue == null) {
          return null;
        }
        const parsed = Number(rawValue);
        return Number.isFinite(parsed) ? parsed : null;
      }),
    );
    return collapsed == null ? null : Math.round(collapsed);
  }

  if (value == null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const normalizeOfficialDuprPatch = (
  patch: OfficialDuprAdjustmentLog["ratings"] | undefined,
) => ({
  singles: normalizeLegacyDuprTrackPatchValue(patch?.singles, [
    "standard",
    "unrestricted",
  ]),
  doubles: normalizeLegacyDuprTrackPatchValue(patch?.doubles, [
    "mixed",
    "men",
    "women",
    "unrestricted",
  ]),
});

const normalizeOfficialDuprConfidencePatch = (
  patch: OfficialDuprAdjustmentLog["confidence"] | undefined,
) => ({
  singles: normalizeLegacyConfidencePatchValue(patch?.singles, [
    "standard",
    "unrestricted",
  ]),
  doubles: normalizeLegacyConfidencePatchValue(patch?.doubles, [
    "mixed",
    "men",
    "women",
    "unrestricted",
  ]),
});

const normalizeOfficialDuprAccuracyPatch = (
  patch: OfficialDuprAdjustmentLog["preUpdateAccuracy"] | undefined,
) => ({
  singles: normalizeLegacyAccuracyPatchValue(patch?.singles, [
    "standard",
    "unrestricted",
  ]),
  doubles: normalizeLegacyAccuracyPatchValue(patch?.doubles, [
    "mixed",
    "men",
    "women",
    "unrestricted",
  ]),
});

const hydrateOfficialDuprAdjustmentLog = (
  record: any,
): OfficialDuprAdjustmentLog => ({
  ...record,
  ratings: normalizeOfficialDuprPatch(record.ratings),
  confidence: normalizeOfficialDuprConfidencePatch(record.confidence),
  previousRating: normalizePlayerDupr(record.previousRating),
  nextRating: normalizePlayerDupr(record.nextRating),
  preUpdateAccuracy: normalizeOfficialDuprAccuracyPatch(
    record.preUpdateAccuracy,
  ),
  createdAt: toDate(record.createdAt),
});

const hydratePlayerRatingChangeLog = (record: any): PlayerRatingChangeLog => ({
  ...record,
  previousRating: normalizePlayerDupr(record.previousRating),
  nextRating: normalizePlayerDupr(record.nextRating),
  delta: record.delta as PlayerDupr,
  createdAt: toDate(record.createdAt),
});

const groupByPlayerId = <T extends { playerId: string }>(items: T[]) =>
  items.reduce<Record<string, T[]>>((acc, item) => {
    acc[item.playerId] = [...(acc[item.playerId] ?? []), item];
    return acc;
  }, {});

const toPublicPlayer = (stored: StoredPlayerRecord): Player => {
  const {
    authUserId: _authUserId,
    isFirstLogin: _isFirstLogin,
    duprMetrics: _duprMetrics,
    duprState: _duprState,
    ...player
  } = stored;
  return player;
};

const toAdminPlayer = (stored: StoredPlayerRecord): AdminPlayer => ({
  ...toPublicPlayer(stored),
  duprMetrics: stored.duprMetrics,
});

const toPlayerQrPublicPlayer = (player: Player): PlayerQrPublicPlayer => ({
  id: player.id,
  username: player.username,
  gender: player.gender,
  avatarUrl: player.avatarUrl,
  duprRating: player.duprRating,
});

const isActiveDevPlayer = (player: Player) =>
  player.status === "active" && player.username.startsWith("dev_");

/** Postgres unique_violation(23505). 표현식 유니크 인덱스(lower(username)) 위반도 같은 코드다. */
const isUniqueViolation = (error: unknown) => {
  if ((error as { code?: unknown })?.code === "23505") {
    return true;
  }
  const message = (error as Error)?.message ?? "";
  return message.includes("UNIQUE") || message.includes("unique");
};

/** 갱신 대상 플레이어가 없을 때 기존 공개 API와 같은 메시지로 실패시킨다. */
const requireStoredPlayer = <T>(player: T | undefined): T => {
  if (!player) {
    throw new Error("사용자를 찾을 수 없습니다.");
  }
  return player;
};

type OfficialDuprRatingPatch = NonNullable<
  OfficialDuprAdjustmentLog["ratings"]
>;
type OfficialDuprConfidencePatch = NonNullable<
  OfficialDuprAdjustmentLog["confidence"]
>;
type OfficialDuprAccuracyPatch = OfficialDuprAdjustmentLog["preUpdateAccuracy"];

interface OfficialDuprAdjustmentDraft {
  ratings: OfficialDuprRatingPatch;
  confidence: OfficialDuprConfidencePatch;
  nextRating: PlayerDupr;
  nextMetrics: PlayerDuprMetrics;
  preUpdateAccuracy: OfficialDuprAccuracyPatch;
}

interface DuprRecalculationResult {
  players: StoredPlayerRecord[];
  stateByPlayerId: Map<string, StoredPlayerDupr>;
  relatedMatchCountByPlayerId: Map<string, number>;
  matchParticipantDuprSnapshots: MatchParticipantDuprSnapshot[];
  perMatchChanges: Array<{
    matchId: string;
    completedAt: Date;
    players: Array<{
      playerId: string;
      previousRating: PlayerDupr;
      nextRating: PlayerDupr;
      delta: PlayerDupr;
    }>;
  }>;
}

interface MatchParticipantDuprSnapshot {
  matchId: string;
  playerId: string;
  duprRating: PublicPlayerDupr | null;
}

interface RecalculateDuprRatingsOptions {
  source?: PlayerRatingChangeSource;
  sourceLogId?: string;
  perMatchLogs?: boolean;
}

interface OfficialDuprRatingAnchor {
  playerId: string;
  category: keyof PlayerDupr;
  rating: number;
  confidence: number;
  createdAtMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFICIAL_DUPR_RECENCY_HALF_LIFE_MS = 30 * DAY_MS;

export const getOfficialDuprRecencyWeight = (
  matchCompletedAt: string | Date | number,
  officialAppliedAt: string | Date | number,
): number => {
  const matchCompletedAtMs = new Date(matchCompletedAt).getTime();
  const officialAppliedAtMs = new Date(officialAppliedAt).getTime();

  if (
    !Number.isFinite(matchCompletedAtMs) ||
    !Number.isFinite(officialAppliedAtMs) ||
    matchCompletedAtMs >= officialAppliedAtMs
  ) {
    return 1;
  }

  return Math.pow(
    2,
    -(officialAppliedAtMs - matchCompletedAtMs) /
      OFFICIAL_DUPR_RECENCY_HALF_LIFE_MS,
  );
};

const duprPatchEntries = (["singles", "doubles"] as const).map((category) => ({
  category,
  getRating: (ratings?: OfficialDuprRatingPatch) => ratings?.[category],
  getConfidence: (confidence?: OfficialDuprConfidencePatch) =>
    confidence?.[category],
  getAccuracy: (accuracy?: OfficialDuprAccuracyPatch) => accuracy?.[category],
  setRating: (patch: OfficialDuprRatingPatch, value: number) => {
    patch[category] = value;
  },
  setConfidence: (patch: OfficialDuprConfidencePatch, value: number) => {
    patch[category] = value;
  },
  setAccuracy: (patch: OfficialDuprAccuracyPatch, value: number | null) => {
    patch[category] = value;
  },
}));

const normalizeConfidenceValue = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("confidence는 숫자여야 합니다.");
  }
  return Math.round(Math.min(100, Math.max(0, parsed)));
};

const buildWinnerTeamIndex = (match: Match): 0 | 1 | null => {
  if (!match.scores?.length) {
    return null;
  }

  const teamWins = match.scores.reduce<[number, number]>(
    (acc, score) => {
      if (score.scoreA > score.scoreB) acc[0] += 1;
      if (score.scoreB > score.scoreA) acc[1] += 1;
      return acc;
    },
    [0, 0],
  );

  if (teamWins[0] !== teamWins[1]) {
    return teamWins[0] > teamWins[1] ? 0 : 1;
  }

  const points = match.scores.reduce<[number, number]>(
    (acc, score) => [acc[0] + score.scoreA, acc[1] + score.scoreB],
    [0, 0],
  );
  if (points[0] === points[1]) {
    return null;
  }
  return points[0] > points[1] ? 0 : 1;
};

const buildDuprDelta = (
  nextRating: PlayerDupr,
  previousRating: PlayerDupr,
): PlayerDupr => ({
  singles: roundDuprRating(nextRating.singles - previousRating.singles),
  doubles: roundDuprRating(nextRating.doubles - previousRating.doubles),
});

const hasDuprChange = (delta: PlayerDupr) =>
  delta.singles !== 0 || delta.doubles !== 0;

const hasDuprMetricChange = (
  nextMetrics: PlayerDuprMetrics,
  previousMetrics: PlayerDuprMetrics,
) =>
  nextMetrics.singles.confidence !== previousMetrics.singles.confidence ||
  nextMetrics.singles.accuracy !== previousMetrics.singles.accuracy ||
  nextMetrics.doubles.confidence !== previousMetrics.doubles.confidence ||
  nextMetrics.doubles.accuracy !== previousMetrics.doubles.accuracy;

const hasStoredDuprStateChange = (
  nextState: StoredPlayerDupr,
  previousState: StoredPlayerDupr,
) =>
  hasDuprChange(buildDuprDelta(nextState.rating, previousState.rating)) ||
  hasDuprMetricChange(nextState.metrics, previousState.metrics);

type PlayerRatingChartProjectionRefresher = {
  rebuildPlayers(playerIds: Iterable<string>): Promise<void>;
};

export class AuthService {
  private playerRatingChartProjectionRefresher?: PlayerRatingChartProjectionRefresher;

  constructor(
    private readonly ratingService: RatingServiceContract =
      new ScorePerformanceRatingService(),
    private readonly authUserVerifier = new SupabaseAuthUserVerifier(),
    private readonly authAdmin = new SupabaseAuthAdmin(),
  ) {}

  setPlayerRatingChartProjectionRefresher(
    refresher: PlayerRatingChartProjectionRefresher,
  ) {
    this.playerRatingChartProjectionRefresher = refresher;
  }

  private async refreshPlayerRatingChartProjections(playerIds: Iterable<string>) {
    const uniquePlayerIds = [...new Set([...playerIds].filter(Boolean))];
    if (
      uniquePlayerIds.length === 0 ||
      !this.playerRatingChartProjectionRefresher
    ) {
      return;
    }

    try {
      await this.playerRatingChartProjectionRefresher.rebuildPlayers(
        uniquePlayerIds,
      );
    } catch (error) {
      // 차트 projection은 평점 로그에서 다시 만들 수 있는 파생 데이터다.
      // 여기서의 DB deadlock이 완료 경기의 평점 반영 자체를 중단시키면 안 된다.
      console.error(
        "[RATING_CHART_PROJECTION] projection 갱신 실패; 평점 반영은 유지합니다.",
        { playerIds: uniquePlayerIds, error },
      );
    }
  }

  /** username unique 위반은 공개 API가 기대하는 중복 메시지로 바꾼다. */
  private async createStoredPlayer(
    input: CreateStoredPlayerInput,
  ): ReturnType<typeof db.players.create> {
    try {
      return await db.players.create(input);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AccountRequestError(409, DUPLICATE_USERNAME_MESSAGE);
      }
      throw error;
    }
  }

  private async getStoredPlayerById(
    playerId: string,
  ): Promise<StoredPlayerRecord | undefined> {
    const player = await db.players.findById(playerId);
    return player ? hydratePlayer(player) : undefined;
  }

  private async buildSession(
    stored: StoredPlayerRecord,
  ): Promise<AuthenticatedSession> {
    if (stored.status === "inactive") {
      throw new InvalidAccessTokenError(
        "비활성 계정입니다. 관리자에게 문의해주세요.",
      );
    }

    return {
      payload: {
        playerId: stored.id,
        isAdmin: await db.playerAdmins.isAdmin(stored.id),
      },
      player: toPublicPlayer(stored),
      isFirstLogin: stored.isFirstLogin,
    };
  }

  /**
   * Supabase Auth로 토큰을 확인하고 `players.auth_user_id`로 연결된 회원 세션을 만든다.
   * Auth 사용자는 관리자만 만들 수 있으므로 provider·이메일은 따로 검사하지 않는다.
   */
  async authenticateAccessToken(
    accessToken: string,
  ): Promise<AuthenticatedSession> {
    const user = await this.authUserVerifier.getUser(accessToken);
    if (!user) {
      throw new InvalidAccessTokenError("세션이 만료되었거나 유효하지 않습니다.");
    }

    const linked = await db.players.findByAuthUserId(user.id);
    if (!linked) {
      throw new AuthError(
        "ACCOUNT_NOT_LINKED",
        "연결된 회원이 없습니다. 관리자에게 문의해주세요.",
      );
    }

    return await this.buildSession(hydratePlayer(linked));
  }

  /**
   * 첫 로그인 비밀번호 변경을 마쳤다고 기록한다. 클라이언트가 Auth에서 비밀번호를 바꾼 뒤 부르며,
   * 실제로 바뀌었는지는 확인하지 않는다(우회해도 본인의 강제 변경을 건너뛸 뿐이다).
   */
  async markPasswordChanged(
    session: AuthenticatedSession,
  ): Promise<AuthenticatedSession> {
    const updated = hydratePlayer(
      requireStoredPlayer(
        await db.players.updateFirstLogin(session.payload.playerId, false),
      ),
    );
    return {
      ...session,
      player: toPublicPlayer(updated),
      isFirstLogin: updated.isFirstLogin,
    };
  }

  /** username의 내부 이메일로 Auth 사용자를 만든다. 같은 이메일의 사용자가 이미 있으면 409다. */
  private async createAuthUser(
    username: string,
    password: string,
  ): Promise<string> {
    try {
      return await this.authAdmin.createUser({
        email: toInternalEmail(username),
        password,
      });
    } catch (error) {
      if (error instanceof AuthEmailExistsError) {
        throw new AccountRequestError(
          409,
          "같은 아이디의 로그인 계정이 이미 있습니다.",
        );
      }
      throw error;
    }
  }

  private async updateAuthUser(
    authUserId: string,
    input: { email?: string; password?: string },
  ): Promise<void> {
    try {
      await this.authAdmin.updateUser(authUserId, input);
    } catch (error) {
      if (error instanceof AuthEmailExistsError) {
        throw new AccountRequestError(
          409,
          "같은 아이디의 로그인 계정이 이미 있습니다.",
        );
      }
      throw error;
    }
  }

  /** 회원과 연결하지 못한 Auth 사용자를 지운다. 실패하면 수동 정리할 수 있게 id를 로그로 남긴다. */
  private async deleteOrphanAuthUser(authUserId: string): Promise<void> {
    try {
      await this.authAdmin.deleteUser(authUserId);
    } catch (error) {
      console.error(
        "[AUTH] 회원과 연결하지 못한 Auth 사용자를 지우지 못했습니다. 수동으로 지워주세요.",
        { authUserId, error },
      );
    }
  }

  /**
   * 관리자가 회원 비밀번호를 임시 비밀번호로 초기화한다. 연결된 Auth 사용자가 없으면 새로 만들어 연결한다(계정 발급).
   * 연결된 사용자의 이메일도 현재 아이디의 내부 이메일로 맞춰, 예전 방식으로 만든 계정도 아이디로 로그인하게 한다.
   */
  async resetPlayerPassword(
    playerId: string,
  ): Promise<AdminPasswordResetResponse> {
    const stored = await this.getStoredPlayerById(playerId);
    if (!stored) {
      throw new AccountRequestError(404, "사용자를 찾을 수 없습니다.");
    }
    if (stored.status !== "active") {
      throw new AccountRequestError(
        400,
        "비활성 회원에게는 비밀번호를 발급할 수 없습니다. 먼저 활성화해주세요.",
      );
    }
    if (!isValidUsername(stored.username)) {
      throw new AccountRequestError(
        400,
        `현재 아이디로는 로그인 계정을 만들 수 없습니다. 먼저 아이디를 바꿔주세요. ${USERNAME_FORMAT_MESSAGE}`,
      );
    }

    const temporaryPassword = generateInitialPassword();

    if (stored.authUserId) {
      // 플래그를 먼저 켠다. Auth 갱신이 실패해도 다음 로그인에서 비밀번호 변경을 한 번 더 요구할 뿐이다.
      await db.players.updateFirstLogin(stored.id, true);
      await this.updateAuthUser(stored.authUserId, {
        email: toInternalEmail(stored.username),
        password: temporaryPassword,
      });
      return { temporaryPassword };
    }

    const authUserId = await this.createAuthUser(
      stored.username,
      temporaryPassword,
    );
    let linked: boolean;
    try {
      linked = await db.players.linkAuthUser(stored.id, authUserId, true);
    } catch (error) {
      await this.deleteOrphanAuthUser(authUserId);
      throw error;
    }
    if (!linked) {
      // 조회 뒤 다른 요청이 먼저 연결했거나 회원이 inactive로 바뀌었다.
      await this.deleteOrphanAuthUser(authUserId);
      throw new AccountRequestError(
        409,
        "회원 상태가 바뀌어 계정을 발급하지 못했습니다. 다시 시도해주세요.",
      );
    }
    return { temporaryPassword };
  }

  /**
   * 관리자가 회원 아이디를 바꾼다. 연결된 Auth 사용자의 이메일도 새 아이디의 내부 이메일로 바꾸며,
   * Auth 이메일을 먼저 바꾸고 username 갱신이 실패하면 Auth 이메일을 되돌려 둘이 어긋나지 않게 한다.
   */
  async updatePlayerUsername(
    playerId: string,
    rawUsername: string,
  ): Promise<AdminUpdateUsernameResponse> {
    const username = rawUsername.trim();
    if (!isValidUsername(username)) {
      throw new AccountRequestError(400, USERNAME_FORMAT_MESSAGE);
    }

    const stored = await this.getStoredPlayerById(playerId);
    if (!stored) {
      throw new AccountRequestError(404, "사용자를 찾을 수 없습니다.");
    }

    const conflict = await db.players.findByUsernameIgnoringCase(username);
    if (conflict && conflict.id !== stored.id) {
      throw new AccountRequestError(409, DUPLICATE_USERNAME_MESSAGE);
    }
    if (stored.username === username) {
      return { player: toPublicPlayer(stored) };
    }

    const nextEmail = toInternalEmail(username);
    let previousAuthEmail: string | null = null;
    if (stored.authUserId) {
      const currentEmail = await this.authAdmin.getUserEmail(stored.authUserId);
      if (currentEmail?.toLowerCase() !== nextEmail) {
        await this.updateAuthUser(stored.authUserId, { email: nextEmail });
        previousAuthEmail = currentEmail;
      }
    }

    try {
      const updated = hydratePlayer(
        requireStoredPlayer(await db.players.updateUsername(stored.id, username)),
      );
      return { player: toPublicPlayer(updated) };
    } catch (error) {
      if (stored.authUserId && previousAuthEmail) {
        await this.restoreAuthEmail(stored.authUserId, previousAuthEmail);
      }
      if (isUniqueViolation(error)) {
        throw new AccountRequestError(409, DUPLICATE_USERNAME_MESSAGE);
      }
      throw error;
    }
  }

  private async restoreAuthEmail(
    authUserId: string,
    email: string,
  ): Promise<void> {
    try {
      await this.authAdmin.updateUser(authUserId, { email });
    } catch (error) {
      console.error(
        "[AUTH] 아이디 변경 실패 후 Auth 이메일을 되돌리지 못했습니다. 비밀번호 초기화로 이메일을 다시 맞춰주세요.",
        { authUserId, error },
      );
    }
  }

  /**
   * dev mock이 켜져 있으면 active dev mock 회원마다 아이디 로그인 계정(공통 dev 비밀번호)을 만들어 연결한다.
   * 이미 연결된 회원은 Auth 이메일이 내부 이메일이 아닐 때만 맞춘다. 실패해도 경고만 남기고 기동을 막지 않는다.
   */
  async seedDevAuthAccounts(): Promise<void> {
    if (!isDevMockDataEnabled()) {
      return;
    }
    for (const { username, status } of getDevMockUsernames()) {
      if (status !== "active") {
        continue;
      }
      try {
        await this.ensureDevAuthAccount(username);
      } catch (error) {
        console.warn(`[DEV_AUTH] ${username} 로그인 계정을 준비하지 못했습니다.`, error);
      }
    }
  }

  private async ensureDevAuthAccount(username: string): Promise<void> {
    const stored = await db.players.findByUsernameIgnoringCase(username);
    if (!stored || stored.status !== "active") {
      return;
    }
    const email = toInternalEmail(stored.username);

    if (stored.authUserId) {
      const currentEmail = await this.authAdmin.getUserEmail(stored.authUserId);
      if (currentEmail?.toLowerCase() !== email) {
        await this.authAdmin.updateUser(stored.authUserId, {
          email,
          password: DEV_MOCK_AUTH_PASSWORD,
        });
      }
      return;
    }

    let authUserId: string;
    try {
      authUserId = await this.authAdmin.createUser({
        email,
        password: DEV_MOCK_AUTH_PASSWORD,
      });
    } catch (error) {
      if (!(error instanceof AuthEmailExistsError)) {
        throw error;
      }
      // 이전 기동이 Auth 사용자만 만들고 연결 전에 멈췄으면 그 사용자를 이어서 쓴다.
      const existingId = await this.authAdmin.findUserIdByEmail(email);
      if (!existingId) {
        throw error;
      }
      await this.authAdmin.updateUser(existingId, {
        password: DEV_MOCK_AUTH_PASSWORD,
      });
      authUserId = existingId;
    }
    await db.players.linkAuthUser(stored.id, authUserId, false);
  }

  private async insertCreationLog(input: {
    playerId: string;
    createdByPlayerId: string | null;
    createdByUsername: string;
    creationSource: PlayerCreationSource;
    createdAt: Date;
  }): Promise<PlayerCreationLog> {
    const log = await db.playerCreationLogs.create({
      id: buildId("player-creation-log"),
      ...input,
    });
    return hydrateCreationLog(log);
  }

  private async insertStatusChangeLog(input: {
    playerId: string;
    previousStatus: PlayerStatus;
    nextStatus: PlayerStatus;
    changedByPlayerId: string;
    changedByUsername: string;
    changedAt: Date;
  }): Promise<PlayerStatusChangeLog> {
    const log = await db.playerStatusChangeLogs.create({
      id: buildId("player-status-log"),
      ...input,
    });
    return hydrateStatusChangeLog(log);
  }

  private async insertPlayerRatingChangeLog(
    input: Omit<PlayerRatingChangeLog, "id">,
  ): Promise<PlayerRatingChangeLog> {
    const log = await db.playerRatingChangeLogs.create({
      id: buildId("player-rating-change-log"),
      ...input,
    });
    return hydratePlayerRatingChangeLog(log);
  }

  /**
   * 경기별 변경 로그는 감사 이력이 아니라 현재 전체 재생 결과를 화면에
   * 전달하기 위한 materialized view다. 따라서 재계산 시 기존 값을 남기지
   * 않고 하나의 트랜잭션으로 교체해 경기·그래프가 같은 계산 결과를 보게 한다.
   */
  private async replaceMatchCompletedRatingChangeLogs(
    perMatchChanges: DuprRecalculationResult["perMatchChanges"],
  ): Promise<PlayerRatingChangeLog[]> {
    const logs = perMatchChanges.flatMap((change) => {
      const sourceLogId = `match-completed-${change.matchId}-${change.completedAt.getTime()}`;
      return change.players
        .map(
          (playerChange): PlayerRatingChangeLog => ({
            id: buildId("player-rating-change-log"),
            playerId: playerChange.playerId,
            source: "match_completed",
            sourceLogId,
            previousRating: playerChange.previousRating,
            nextRating: playerChange.nextRating,
            delta: playerChange.delta,
            createdAt: change.completedAt,
          }),
        );
    });

    await db.playerRatingChangeLogs.replaceMatchCompleted(logs);

    return logs;
  }

  async getPlayerById(playerId: string): Promise<Player | undefined> {
    const stored = await this.getStoredPlayerById(playerId);
    if (!stored) {
      return undefined;
    }
    return toPublicPlayer(stored);
  }

  async createPlayerQrToken(playerId: string): Promise<PlayerQrTokenResponse> {
    const stored = await this.getStoredPlayerById(playerId);
    if (!stored) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }
    if (stored.status !== "active") {
      throw new Error("QR 코드를 생성할 수 없는 계정입니다.");
    }

    return createPlayerQrTokenPayload(stored.id);
  }

  async verifyPlayerQrToken(
    payload: string,
  ): Promise<VerifyPlayerQrTokenResponse> {
    const playerId =
      DEV_MOCK_DATA_ENABLED && isDevPlayerQrPayload(payload)
        ? verifyDevPlayerQrPayload(payload)
        : verifyPlayerQrPayload(payload);
    const stored = await this.getStoredPlayerById(playerId);
    if (!stored) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }
    if (
      stored.status !== "active" ||
      (isDevPlayerQrPayload(payload) && !isActiveDevPlayer(stored))
    ) {
      throw new Error("유효하지 않은 플레이어 QR 코드입니다.");
    }

    return { player: toPlayerQrPublicPlayer(stored) };
  }

  async getDevPlayerQrTokens(): Promise<DevPlayerQrTokenListResponse> {
    if (!DEV_MOCK_DATA_ENABLED) {
      throw new Error("Dev mock data mode is not enabled.");
    }

    const players = (await this.getAllPlayers())
      .filter(isActiveDevPlayer)
      .sort((a, b) => {
        if (a.gender !== b.gender) {
          return a.gender === "M" ? -1 : 1;
        }
        return a.username.localeCompare(b.username);
      });

    return {
      players: players.map((player) => ({
        player: toPlayerQrPublicPlayer(player),
        payload: createDevPlayerQrPayload(player.id),
      })),
    };
  }

  async updatePlayerProfile(
    playerId: string,
    input: {
      avatarUrl?: string | null;
      affiliations?: PlayerAffiliation[];
      statusMessage?: string | null;
      statusMessageBackgroundColor?: string | null;
    },
  ): Promise<Player> {
    const stored = await this.getStoredPlayerById(playerId);
    if (!stored) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    const profilePatch: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(input, "avatarUrl")) {
      profilePatch.avatarUrl =
        typeof input.avatarUrl === "string" && input.avatarUrl.trim()
          ? input.avatarUrl.trim()
          : null;
    }
    if (Object.prototype.hasOwnProperty.call(input, "affiliations")) {
      profilePatch.affiliations = input.affiliations ?? [];
    }
    if (Object.prototype.hasOwnProperty.call(input, "statusMessage")) {
      profilePatch.statusMessage = input.statusMessage ?? null;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        input,
        "statusMessageBackgroundColor",
      )
    ) {
      profilePatch.statusMessageBackgroundColor =
        input.statusMessageBackgroundColor ?? null;
    }

    const updated = hydratePlayer(
      requireStoredPlayer(await db.players.updateProfile(playerId, profilePatch)),
    );

    return toPublicPlayer(updated);
  }

  async getAllPlayers(): Promise<Player[]> {
    const players = await db.players.findAll();
    return players.map((record) => toPublicPlayer(hydratePlayer(record)));
  }

  async getAdminPlayers(): Promise<AdminPlayer[]> {
    const players = await db.players.findAll();
    return players.map((record) => toAdminPlayer(hydratePlayer(record)));
  }

  async getPublicPlayers(): Promise<Player[]> {
    const players = await this.getAllPlayers();
    return players.filter((player) => player.status === "active");
  }

  async updatePlayerGender(
    playerId: string,
    nextGender: Player["gender"],
    changedByPlayerId: string,
  ): Promise<{ player: Player; changed: boolean }> {
    const stored = await this.getStoredPlayerById(playerId);
    if (!stored) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    const changedBy = await this.getStoredPlayerById(changedByPlayerId);
    if (!changedBy) {
      throw new Error("성별 변경 요청자를 찾을 수 없습니다.");
    }

    if (stored.gender === nextGender) {
      return { player: toPublicPlayer(stored), changed: false };
    }

    const updated = hydratePlayer(
      requireStoredPlayer(await db.players.updateGender(playerId, nextGender)),
    );

    return { player: toPublicPlayer(updated), changed: true };
  }

  async updatePlayerStatus(
    playerId: string,
    nextStatus: PlayerStatus,
    changedByPlayerId: string,
  ): Promise<{ player: Player; log: PlayerStatusChangeLog | null }> {
    const stored = await this.getStoredPlayerById(playerId);
    if (!stored) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    const changedBy = await this.getStoredPlayerById(changedByPlayerId);
    if (!changedBy) {
      throw new Error("상태 변경 요청자를 찾을 수 없습니다.");
    }

    if (stored.status === nextStatus) {
      return { player: toPublicPlayer(stored), log: null };
    }

    const updated = hydratePlayer(
      requireStoredPlayer(await db.players.updateStatus(playerId, nextStatus)),
    );

    const log = await this.insertStatusChangeLog({
      playerId: updated.id,
      previousStatus: stored.status,
      nextStatus,
      changedByPlayerId: changedBy.id,
      changedByUsername: changedBy.username,
      changedAt: updated.updatedAt,
    });

    return { player: toPublicPlayer(updated), log };
  }

  async getPlayerCreationLogs(): Promise<Record<string, PlayerCreationLog[]>> {
    const logs = await db.playerCreationLogs.findAll();
    return groupByPlayerId(logs.map(hydrateCreationLog));
  }

  async getPlayerStatusLogs(): Promise<
    Record<string, PlayerStatusChangeLog[]>
  > {
    const logs = await db.playerStatusChangeLogs.findAll();
    return groupByPlayerId(logs.map(hydrateStatusChangeLog));
  }

  async getOfficialDuprAdjustmentLogs(): Promise<OfficialDuprAdjustmentLog[]> {
    const logs = await db.officialDuprAdjustmentLogs.findAll();
    return logs.map(hydrateOfficialDuprAdjustmentLog);
  }

  private async updateStoredPlayerDuprState(
    playerId: string,
    duprState: StoredPlayerDupr,
  ): Promise<StoredPlayerRecord> {
    return hydratePlayer(
      requireStoredPlayer(await db.players.updateDuprState(playerId, duprState)),
    );
  }

  private buildOfficialDuprAdjustmentDraft(
    stored: StoredPlayerRecord,
    input: {
      ratings?: OfficialDuprRatingPatch;
      confidence?: OfficialDuprConfidencePatch;
    },
  ): OfficialDuprAdjustmentDraft {
    let nextRating = stored.duprState.rating;
    let nextMetrics = stored.duprState.metrics;
    const ratings: OfficialDuprRatingPatch = {};
    const confidence: OfficialDuprConfidencePatch = {};
    const preUpdateAccuracy: OfficialDuprAccuracyPatch = {};
    let touchedCount = 0;

    for (const entry of duprPatchEntries) {
      const ratingValue = entry.getRating(input.ratings);
      const confidenceValue = entry.getConfidence(input.confidence);
      const hasRating = ratingValue != null;
      const hasConfidence = confidenceValue != null;

      if (hasRating !== hasConfidence) {
        throw new Error(
          "rating과 confidence는 같은 종목에 함께 입력해야 합니다.",
        );
      }
      if (!hasRating || !hasConfidence) {
        continue;
      }

      const normalizedRating = normalizeDuprRatingValue(ratingValue);
      const normalizedConfidence = normalizeConfidenceValue(confidenceValue);
      const previousCategoryRating = getDuprRatingByCategory(
        stored.duprState.rating,
        entry.category,
      );
      const categoryAccuracy = this.ratingService.getAccuracy(
        previousCategoryRating,
        normalizedRating,
      );

      nextRating = setDuprRatingByCategory(
        nextRating,
        entry.category,
        normalizedRating,
      );
      nextMetrics = setDuprMetricByCategory(nextMetrics, entry.category, {
        confidence: normalizedConfidence,
        accuracy: 100,
      });
      entry.setRating(ratings, normalizedRating);
      entry.setConfidence(confidence, normalizedConfidence);
      entry.setAccuracy(preUpdateAccuracy, categoryAccuracy);
      touchedCount += 1;
    }

    if (touchedCount === 0) {
      throw new Error("반영할 공식 DUPR 종목이 필요합니다.");
    }

    return {
      ratings,
      confidence,
      nextRating,
      nextMetrics,
      preUpdateAccuracy,
    };
  }

  private buildOfficialDuprAdjustmentLog(input: {
    stored: StoredPlayerRecord;
    changedBy: StoredPlayerRecord;
    draft: OfficialDuprAdjustmentDraft;
    reason?: string | null;
    id?: string;
    createdAt?: Date;
  }): OfficialDuprAdjustmentLog {
    return {
      id: input.id ?? buildId("official-dupr-log"),
      playerId: input.stored.id,
      changedByPlayerId: input.changedBy.id,
      changedByUsername: input.changedBy.username,
      ratings: input.draft.ratings,
      confidence: input.draft.confidence,
      previousRating: input.stored.duprState.rating,
      nextRating: input.draft.nextRating,
      preUpdateAccuracy: input.draft.preUpdateAccuracy,
      reason: input.reason?.trim() || null,
      createdAt: input.createdAt ?? new Date(),
    };
  }

  private async calculateDuprRecalculation(
    completedMatches: Match[],
    additionalLogs: OfficialDuprAdjustmentLog[] = [],
    ratingService: RatingServiceContract = this.ratingService,
  ): Promise<DuprRecalculationResult> {
    const players = (await db.players.findAll()).map(hydratePlayer);
    const storedLogs = await this.getOfficialDuprAdjustmentLogs();
    const logs = [...storedLogs, ...additionalLogs].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const stateByPlayerId = new Map<string, StoredPlayerDupr>(
      players.map((player) => [
        player.id,
        {
          rating: createDefaultPlayerDupr(),
          metrics: createDefaultPlayerDuprMetrics(),
        },
      ]),
    );
    const correctionWeightByPlayerId: Record<string, number> = {};
    const officialAnchorByPlayerCategory = new Map<
      string,
      OfficialDuprRatingAnchor
    >();

    for (const log of logs) {
      const state = stateByPlayerId.get(log.playerId);
      if (!state) {
        continue;
      }

      let nextRating = state.rating;
      let nextMetrics = state.metrics;
      for (const entry of duprPatchEntries) {
        const ratingValue = entry.getRating(log.ratings);
        const confidenceValue = entry.getConfidence(log.confidence);
        if (ratingValue == null || confidenceValue == null) {
          continue;
        }
        nextRating = setDuprRatingByCategory(
          nextRating,
          entry.category,
          ratingValue,
        );
        nextMetrics = setDuprMetricByCategory(nextMetrics, entry.category, {
          confidence: normalizeConfidenceValue(confidenceValue),
          accuracy: 100,
        });
        officialAnchorByPlayerCategory.set(
          `${log.playerId}:${entry.category}`,
          {
            playerId: log.playerId,
            category: entry.category,
            rating: normalizeDuprRatingValue(ratingValue),
            confidence: normalizeConfidenceValue(confidenceValue),
            createdAtMs: new Date(log.createdAt).getTime(),
          },
        );
        const preUpdateAccuracy = entry.getAccuracy(log.preUpdateAccuracy);
        correctionWeightByPlayerId[log.playerId] = Math.max(
          correctionWeightByPlayerId[log.playerId] ?? 0,
          ratingService.getCorrectionWeight(
            preUpdateAccuracy == null ? null : Number(preUpdateAccuracy),
          ),
        );
      }

      stateByPlayerId.set(log.playerId, {
        rating: nextRating,
        metrics: nextMetrics,
      });
    }

    const relatedMatchCountByPlayerId = new Map<string, number>();
    const lastPlayedAtMsByCategoryKey = new Map<string, number>();
    const matchParticipantDuprSnapshots: MatchParticipantDuprSnapshot[] = [];
    const perMatchChanges: DuprRecalculationResult["perMatchChanges"] = [];
    const fixedOfficialAnchorKeys = new Set<string>();
    const replayMatches = completedMatches
      .filter((match) => match.status === "completed" && match.completedAt)
      .sort(
        (a, b) =>
          new Date(a.completedAt!).getTime() -
          new Date(b.completedAt!).getTime(),
      );

    for (const match of replayMatches) {
      const winnerTeamIndex = buildWinnerTeamIndex(match);
      if (winnerTeamIndex == null) {
        continue;
      }
      const category = getDuprCategoryForMatchType(match.type);
      const completedAtMs = new Date(match.completedAt!).getTime();

      for (const [anchorKey, anchor] of officialAnchorByPlayerCategory) {
        if (
          anchor.category !== category ||
          fixedOfficialAnchorKeys.has(anchorKey) ||
          completedAtMs <= anchor.createdAtMs
        ) {
          continue;
        }

        const state = stateByPlayerId.get(anchor.playerId);
        if (!state) {
          fixedOfficialAnchorKeys.add(anchorKey);
          continue;
        }
        const currentMetric = getDuprMetricByCategory(
          state.metrics,
          anchor.category,
        );
        stateByPlayerId.set(anchor.playerId, {
          rating: setDuprRatingByCategory(
            state.rating,
            anchor.category,
            anchor.rating,
          ),
          metrics: setDuprMetricByCategory(
            state.metrics,
            anchor.category,
            {
              ...currentMetric,
              confidence: anchor.confidence,
              accuracy: 100,
            },
          ),
        });
        fixedOfficialAnchorKeys.add(anchorKey);
      }

      const participants = match.teams.flatMap((team, teamIndex) =>
        team.players
          .map((player) => {
            const state = stateByPlayerId.get(player.id);
            if (!state) {
              return null;
            }
            return {
              playerId: player.id,
              teamIndex: teamIndex as 0 | 1,
              state,
            };
          })
          .filter(
            (participant): participant is NonNullable<typeof participant> =>
              Boolean(participant),
          ),
      );

      if (participants.length < 2) {
        continue;
      }

      matchParticipantDuprSnapshots.push(
        ...participants.map((participant) => ({
          matchId: match.id,
          playerId: participant.playerId,
          duprRating: toPublicPlayerDupr(participant.state),
        })),
      );

      const inactiveElapsedMsByPlayerId = Object.fromEntries(
        participants.map((participant) => {
          const categoryKey = `${participant.playerId}:${category}`;
          const lastPlayedAtMs = lastPlayedAtMsByCategoryKey.get(categoryKey);
          return [
            participant.playerId,
            lastPlayedAtMs == null
              ? 0
              : Math.max(0, completedAtMs - lastPlayedAtMs),
          ];
        }),
      );

      participants.forEach((participant) => {
        relatedMatchCountByPlayerId.set(
          participant.playerId,
          (relatedMatchCountByPlayerId.get(participant.playerId) ?? 0) + 1,
        );
      });

      const participantPlayerIds = new Set(
        participants.map((participant) => participant.playerId),
      );
      const matchRecencyWeight = Math.max(
        0,
        ...[...officialAnchorByPlayerCategory.values()]
          .filter(
            (anchor) =>
              anchor.category === category &&
              participantPlayerIds.has(anchor.playerId) &&
              completedAtMs <= anchor.createdAtMs,
          )
          .map((anchor) =>
            getOfficialDuprRecencyWeight(
              completedAtMs,
              anchor.createdAtMs,
            ),
          ),
      );
      const effectiveCorrectionWeightByPlayerId = Object.fromEntries(
        participants.map((participant) => [
          participant.playerId,
          (correctionWeightByPlayerId[participant.playerId] ?? 1) *
            (matchRecencyWeight || 1),
        ]),
      );
      const replayResult = ratingService.replayMatch(
        {
          type: match.type,
          winnerTeamIndex,
          participants,
          scores: match.scores,
          inactiveElapsedMsByPlayerId,
        },
        effectiveCorrectionWeightByPlayerId,
      );

      const matchPlayerChanges: Array<{
        playerId: string;
        previousRating: PlayerDupr;
        nextRating: PlayerDupr;
        delta: PlayerDupr;
      }> = [];
      for (const [playerId, nextState] of Object.entries(replayResult)) {
        const previousState = stateByPlayerId.get(playerId);
        if (!previousState) continue;

        const delta = buildDuprDelta(nextState.rating, previousState.rating);
        matchPlayerChanges.push({
          playerId,
          previousRating: previousState.rating,
          nextRating: nextState.rating,
          delta,
        });
        stateByPlayerId.set(playerId, nextState);
      }

      if (matchPlayerChanges.length > 0) {
        perMatchChanges.push({
          matchId: match.id,
          completedAt: new Date(match.completedAt!),
          players: matchPlayerChanges,
        });
      }

      participants.forEach((participant) => {
        lastPlayedAtMsByCategoryKey.set(
          `${participant.playerId}:${category}`,
          completedAtMs,
        );
      });
    }

    for (const [anchorKey, anchor] of officialAnchorByPlayerCategory) {
      if (fixedOfficialAnchorKeys.has(anchorKey)) {
        continue;
      }

      const state = stateByPlayerId.get(anchor.playerId);
      if (!state) {
        continue;
      }
      const currentMetric = getDuprMetricByCategory(
        state.metrics,
        anchor.category,
      );
      stateByPlayerId.set(anchor.playerId, {
        rating: setDuprRatingByCategory(
          state.rating,
          anchor.category,
          anchor.rating,
        ),
        metrics: setDuprMetricByCategory(
          state.metrics,
          anchor.category,
          {
            ...currentMetric,
            confidence: anchor.confidence,
            accuracy: 100,
          },
        ),
      });
    }

    return {
      players,
      stateByPlayerId,
      relatedMatchCountByPlayerId,
      matchParticipantDuprSnapshots,
      perMatchChanges,
    };
  }

  async compareRatingMethods(completedMatches: Match[]): Promise<{
    completedMatchCount: number;
    players: Array<{
      playerId: string;
      username: string;
      currentRating: PublicPlayerDupr | null;
      legacyRating: PublicPlayerDupr | null;
      scorePerformanceRating: PublicPlayerDupr | null;
      difference: PublicPlayerDupr;
      relatedMatchCount: number;
    }>;
  }> {
    const [legacy, scorePerformance] = await Promise.all([
      this.calculateDuprRecalculation(
        completedMatches,
        [],
        new RatingService(),
      ),
      this.calculateDuprRecalculation(
        completedMatches,
        [],
        new ScorePerformanceRatingService(),
      ),
    ]);

    return {
      completedMatchCount: completedMatches.length,
      players: scorePerformance.players
        .map((player) => {
          const legacyState = legacy.stateByPlayerId.get(player.id);
          const scorePerformanceState =
            scorePerformance.stateByPlayerId.get(player.id);
          if (!legacyState || !scorePerformanceState) {
            return null;
          }
          const currentRating = toPublicPlayerDupr(player.duprState);
          const legacyRating = toPublicPlayerDupr(legacyState);
          const scorePerformanceRating =
            toPublicPlayerDupr(scorePerformanceState);

          return {
            playerId: player.id,
            username: player.username,
            currentRating,
            legacyRating,
            scorePerformanceRating,
            difference: {
              singles:
                legacyRating?.singles != null &&
                scorePerformanceRating?.singles != null
                  ? roundDuprRating(
                      scorePerformanceRating.singles - legacyRating.singles,
                    )
                  : null,
              doubles:
                legacyRating?.doubles != null &&
                scorePerformanceRating?.doubles != null
                  ? roundDuprRating(
                      scorePerformanceRating.doubles - legacyRating.doubles,
                    )
                  : null,
            },
            relatedMatchCount:
              scorePerformance.relatedMatchCountByPlayerId.get(player.id) ?? 0,
          };
        })
        .filter(
          (
            comparison,
          ): comparison is {
            playerId: string;
            username: string;
            currentRating: PublicPlayerDupr | null;
            legacyRating: PublicPlayerDupr | null;
            scorePerformanceRating: PublicPlayerDupr | null;
            difference: PublicPlayerDupr;
            relatedMatchCount: number;
          } => Boolean(comparison),
        )
        .sort((a, b) => a.username.localeCompare(b.username)),
    };
  }

  private async fillMissingMatchParticipantDuprSnapshots(
    snapshots: MatchParticipantDuprSnapshot[],
  ): Promise<{
    updatedParticipantCount: number;
    updatedMatchCount: number;
  }> {
    if (!snapshots.length) {
      return { updatedParticipantCount: 0, updatedMatchCount: 0 };
    }

    return await db.matches.fillMissingParticipantDuprSnapshots(snapshots);
  }

  /**
   * 증분 반영 시 confidence 감쇠에만 사용할 해당 종목의 직전 경기 시각을 찾는다.
   * 전체 경기를 다시 계산하지 않고, 이번 경기 참가자별 이력만 조회한다.
   */
  private async getPreviousCompletedAtForRating(
    playerId: string,
    category: PlayerDuprCategory,
    currentMatch: Match,
  ): Promise<Date | null> {
    const matchTypes = matchTypeValues.filter(
      (matchType) => getDuprCategoryForMatchType(matchType) === category,
    ) as MatchType[];
    return await db.matches.findPreviousCompletedAt(
      playerId,
      matchTypes,
      new Date(currentMatch.completedAt!),
    );
  }

  private buildOfficialDuprImpacts(
    result: DuprRecalculationResult,
  ): OfficialDuprAdjustmentImpact[] {
    return result.players
      .map((player) => {
        const nextState = result.stateByPlayerId.get(player.id);
        if (!nextState) {
          return null;
        }
        const delta = buildDuprDelta(nextState.rating, player.duprState.rating);
        if (!hasDuprChange(delta)) {
          return null;
        }

        return {
          playerId: player.id,
          username: player.username,
          previousRating: player.duprState.rating,
          nextRating: nextState.rating,
          delta,
          relatedMatchCount:
            result.relatedMatchCountByPlayerId.get(player.id) ?? 0,
        };
      })
      .filter((impact): impact is OfficialDuprAdjustmentImpact =>
        Boolean(impact),
      )
      .sort((a, b) => {
        const deltaMagnitudeA =
          Math.abs(a.delta.singles) + Math.abs(a.delta.doubles);
        const deltaMagnitudeB =
          Math.abs(b.delta.singles) + Math.abs(b.delta.doubles);
        if (deltaMagnitudeB !== deltaMagnitudeA) {
          return deltaMagnitudeB - deltaMagnitudeA;
        }
        return a.username.localeCompare(b.username);
      });
  }

  private getChangedDuprStates(
    result: DuprRecalculationResult,
  ): Array<[string, StoredPlayerDupr]> {
    const playerById = new Map(
      result.players.map((player) => [player.id, player]),
    );
    return [...result.stateByPlayerId.entries()].filter(([playerId, state]) => {
      const player = playerById.get(playerId);
      return player ? hasStoredDuprStateChange(state, player.duprState) : false;
    });
  }

  async previewOfficialDuprAdjustment(
    input: {
      playerId: string;
      changedByPlayerId: string;
      ratings?: OfficialDuprRatingPatch;
      confidence?: OfficialDuprConfidencePatch;
      reason?: string | null;
    },
    completedMatches: Match[],
  ): Promise<OfficialDuprAdjustmentPreview> {
    const stored = await this.getStoredPlayerById(input.playerId);
    if (!stored) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }
    const changedBy = await this.getStoredPlayerById(input.changedByPlayerId);
    if (!changedBy) {
      throw new Error("공식 DUPR 반영 요청자를 찾을 수 없습니다.");
    }

    const draft = this.buildOfficialDuprAdjustmentDraft(stored, input);
    const previewLog = this.buildOfficialDuprAdjustmentLog({
      stored,
      changedBy,
      draft,
      reason: input.reason,
      id: "official-dupr-preview",
    });
    const recalculation = await this.calculateDuprRecalculation(
      completedMatches,
      [previewLog],
    );

    return {
      player: toPublicPlayer(stored),
      impacts: this.buildOfficialDuprImpacts(recalculation),
    };
  }

  async applyOfficialDuprAdjustment(
    input: {
      playerId: string;
      changedByPlayerId: string;
      ratings?: OfficialDuprRatingPatch;
      confidence?: OfficialDuprConfidencePatch;
      reason?: string | null;
    },
    completedMatches: Match[],
  ): Promise<{
    player: Player;
    log: OfficialDuprAdjustmentLog;
    ratingChangeLogs: PlayerRatingChangeLog[];
  }> {
    const stored = await this.getStoredPlayerById(input.playerId);
    if (!stored) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }
    const changedBy = await this.getStoredPlayerById(input.changedByPlayerId);
    if (!changedBy) {
      throw new Error("공식 DUPR 반영 요청자를 찾을 수 없습니다.");
    }

    const draft = this.buildOfficialDuprAdjustmentDraft(stored, input);
    const pendingLog = this.buildOfficialDuprAdjustmentLog({
      stored,
      changedBy,
      draft,
      reason: input.reason,
    });
    const log = hydrateOfficialDuprAdjustmentLog(
      await db.officialDuprAdjustmentLogs.create(
        pendingLog satisfies OfficialDuprAdjustmentLog,
      ),
    );

    const recalculation =
      await this.calculateDuprRecalculation(completedMatches);
    const impacts = this.buildOfficialDuprImpacts(recalculation);

    for (const [playerId, state] of this.getChangedDuprStates(recalculation)) {
      await this.updateStoredPlayerDuprState(playerId, state);
    }
    await this.fillMissingMatchParticipantDuprSnapshots(
      recalculation.matchParticipantDuprSnapshots,
    );
    await this.replaceMatchCompletedRatingChangeLogs(
      recalculation.perMatchChanges,
    );

    const createdAt = new Date();
    const ratingChangeLogs = await Promise.all(
      impacts.map((impact) =>
        this.insertPlayerRatingChangeLog({
          playerId: impact.playerId,
          source: "official_adjustment_recalculation",
          sourceLogId: log.id,
          previousRating: impact.previousRating,
          nextRating: impact.nextRating,
          delta: impact.delta,
          createdAt,
        }),
      ),
    );
    await this.refreshPlayerRatingChartProjections(
      recalculation.perMatchChanges.flatMap((change) =>
        change.players.map((player) => player.playerId),
      ),
    );
    const recalculated = await this.getStoredPlayerById(stored.id);

    return {
      player: toPublicPlayer(recalculated ?? stored),
      log,
      ratingChangeLogs,
    };
  }

  async recalculateDuprRatings(
    completedMatches: Match[],
    options: RecalculateDuprRatingsOptions = {},
  ): Promise<{
    ratingChangeLogs: PlayerRatingChangeLog[];
    perMatchLogs: PlayerRatingChangeLog[];
    changedPlayerCount: number;
    restoredMatchDuprSnapshotCount: number;
    restoredMatchDuprSnapshotMatchCount: number;
    perMatchLogCount: number;
  }> {
    const recalculation =
      await this.calculateDuprRecalculation(completedMatches);
    const impacts = this.buildOfficialDuprImpacts(recalculation);

    for (const [playerId, state] of this.getChangedDuprStates(recalculation)) {
      await this.updateStoredPlayerDuprState(playerId, state);
    }
    const snapshotRestore = await this.fillMissingMatchParticipantDuprSnapshots(
      recalculation.matchParticipantDuprSnapshots,
    );

    const createdAt = new Date();
    const ratingChangeLogs =
      options.source && options.sourceLogId
        ? await Promise.all(
            impacts.map((impact) =>
              this.insertPlayerRatingChangeLog({
                playerId: impact.playerId,
                source: options.source!,
                sourceLogId: options.sourceLogId!,
                previousRating: impact.previousRating,
                nextRating: impact.nextRating,
                delta: impact.delta,
                createdAt,
              }),
            ),
          )
        : [];

    const perMatchLogs = options.perMatchLogs
      ? await this.replaceMatchCompletedRatingChangeLogs(
          recalculation.perMatchChanges,
        )
      : [];

    await this.refreshPlayerRatingChartProjections(
      perMatchLogs.length > 0
        ? perMatchLogs.map((log) => log.playerId)
        : ratingChangeLogs.length > 0
          ? ratingChangeLogs.map((log) => log.playerId)
          : impacts.map((impact) => impact.playerId),
    );

    return {
      ratingChangeLogs,
      perMatchLogs,
      changedPlayerCount: impacts.length,
      restoredMatchDuprSnapshotCount: snapshotRestore.updatedParticipantCount,
      restoredMatchDuprSnapshotMatchCount: snapshotRestore.updatedMatchCount,
      perMatchLogCount: perMatchLogs.length,
    };
  }

  async applyMatchResultToRatings(
    match: Match,
    options: { refreshProjection?: boolean } = {},
  ): Promise<{
    ratingChangeLogs: PlayerRatingChangeLog[];
    changedPlayerCount: number;
  }> {
    const winnerTeamIndex = buildWinnerTeamIndex(match);
    if (winnerTeamIndex == null || !match.completedAt) {
      return { ratingChangeLogs: [], changedPlayerCount: 0 };
    }

    const existingLogs = (
      await db.playerRatingChangeLogs.findByMatchId(match.id)
    ).map(hydratePlayerRatingChangeLog);
    if (existingLogs.length > 0) {
      if (options.refreshProjection !== false) {
        await this.refreshPlayerRatingChartProjections(
          existingLogs.map((log) => log.playerId),
        );
      }
      return {
        ratingChangeLogs: existingLogs,
        changedPlayerCount: existingLogs.filter((log) =>
          hasDuprChange(log.delta),
        ).length,
      };
    }

    const category = getDuprCategoryForMatchType(match.type);
    const participantEntries = match.teams.flatMap((team, teamIndex) =>
      team.players.map((player) => ({
        playerId: player.id,
        teamIndex: teamIndex as 0 | 1,
      })),
    );
    const playerIds = [...new Set(participantEntries.map((entry) => entry.playerId))];
    const storedPlayerEntries = await Promise.all(
      playerIds.map(async (playerId) => [
        playerId,
        await this.getStoredPlayerById(playerId),
      ] as const),
    );
    const storedPlayerById = new Map(
      storedPlayerEntries.filter(
        (entry): entry is readonly [string, StoredPlayerRecord] =>
          entry[1] != null,
      ),
    );
    const participants = participantEntries
      .map((entry) => {
        const stored = storedPlayerById.get(entry.playerId);
        return stored ? { ...entry, state: stored.duprState } : null;
      })
      .filter(
        (participant): participant is NonNullable<typeof participant> =>
          participant != null,
      );

    if (participants.length < 2) {
      return { ratingChangeLogs: [], changedPlayerCount: 0 };
    }

    const previousCompletedAtEntries = await Promise.all(
      [...new Set(participants.map((participant) => participant.playerId))].map(
        async (playerId) => [
          playerId,
          await this.getPreviousCompletedAtForRating(playerId, category, match),
        ] as const,
      ),
    );
    const completedAtMs = match.completedAt.getTime();
    const inactiveElapsedMsByPlayerId = Object.fromEntries(
      previousCompletedAtEntries.map(([playerId, previousCompletedAt]) => [
        playerId,
        previousCompletedAt
          ? Math.max(0, completedAtMs - previousCompletedAt.getTime())
          : 0,
      ]),
    );
    const nextStateByPlayerId = this.ratingService.replayMatch({
      type: match.type,
      winnerTeamIndex,
      participants,
      scores: match.scores,
      inactiveElapsedMsByPlayerId,
    });

    const changes = Object.entries(nextStateByPlayerId)
      .map(([playerId, nextState]) => {
        const previousState = storedPlayerById.get(playerId)?.duprState;
        if (!previousState) return null;
        return {
          playerId,
          previousRating: previousState.rating,
          nextRating: nextState.rating,
          delta: buildDuprDelta(nextState.rating, previousState.rating),
          nextState,
        };
      })
      .filter((change): change is NonNullable<typeof change> => change != null);

    await Promise.all(
      changes.map((change) =>
        this.updateStoredPlayerDuprState(change.playerId, change.nextState),
      ),
    );
    await this.fillMissingMatchParticipantDuprSnapshots(
      participants.map((participant) => ({
        matchId: match.id,
        playerId: participant.playerId,
        duprRating: toPublicPlayerDupr(participant.state),
      })),
    );

    const sourceLogId = `match-completed-${match.id}-${match.completedAt.getTime()}`;
    const ratingChangeLogs = await Promise.all(
      changes.map((change) =>
        this.insertPlayerRatingChangeLog({
          playerId: change.playerId,
          source: "match_completed",
          sourceLogId,
          previousRating: change.previousRating,
          nextRating: change.nextRating,
          delta: change.delta,
          createdAt: match.completedAt!,
        }),
      ),
    );

    if (options.refreshProjection !== false) {
      await this.refreshPlayerRatingChartProjections(
        ratingChangeLogs.map((log) => log.playerId),
      );
    }

    return {
      ratingChangeLogs,
      changedPlayerCount: changes.filter((change) => hasDuprChange(change.delta))
        .length,
    };
  }

  /**
   * 관리자 일괄 완료 경기에서는 경기별 chart projection을 반복 재생성하지
   * 않고, 모든 평점 저장 후 고유 참가자별로 한 번만 갱신한다.
   */
  async applyMatchResultsToRatings(matches: Match[]): Promise<{
    ratingChangeLogs: PlayerRatingChangeLog[];
    changedPlayerCount: number;
  }> {
    const ratingResults = [];
    for (const match of [...matches].sort(
      (left, right) =>
        left.completedAt!.getTime() - right.completedAt!.getTime(),
    )) {
      ratingResults.push(
        await this.applyMatchResultToRatings(match, { refreshProjection: false }),
      );
    }
    const ratingChangeLogs = ratingResults.flatMap(
      (result) => result.ratingChangeLogs,
    );
    await this.refreshPlayerRatingChartProjections(
      ratingChangeLogs.map((log) => log.playerId),
    );
    return {
      ratingChangeLogs,
      changedPlayerCount: new Set(
        ratingChangeLogs
          .filter((log) => hasDuprChange(log.delta))
          .map((log) => log.playerId),
      ).size,
    };
  }

  /**
   * 회원을 만들고 서버가 만든 초기 비밀번호로 아이디 로그인 계정을 발급한다.
   * 초기 비밀번호는 응답으로만 돌려주고 저장·로그하지 않는다. 회원 생성이 실패하면 만든 Auth 사용자를 지운다.
   */
  async registerAdmin(
    input: AdminRegisterPlayerRequest,
    createdByPlayerId: string,
  ): Promise<AdminRegisterPlayerResponse> {
    const username = input.username.trim();
    if (!isValidUsername(username)) {
      throw new AccountRequestError(400, USERNAME_FORMAT_MESSAGE);
    }
    // username은 대소문자 구분 없이 unique다. 동시 요청은 createStoredPlayer가 유니크 위반으로 걸러낸다.
    if (await db.players.findByUsernameIgnoringCase(username)) {
      throw new AccountRequestError(409, DUPLICATE_USERNAME_MESSAGE);
    }

    const createdBy = await this.getStoredPlayerById(createdByPlayerId);
    if (!createdBy) {
      throw new Error("계정 생성 요청자를 찾을 수 없습니다.");
    }

    const player = createPlayer({ username, gender: input.gender });
    const initialPassword = generateInitialPassword();
    const authUserId = await this.createAuthUser(username, initialPassword);

    let created: StoredPlayerRecord;
    try {
      created = hydratePlayer(
        await this.createStoredPlayer({
          ...player,
          authUserId,
          isFirstLogin: true,
        }),
      );
    } catch (error) {
      await this.deleteOrphanAuthUser(authUserId);
      throw error;
    }

    await this.insertCreationLog({
      playerId: created.id,
      createdByPlayerId: createdBy.id,
      createdByUsername: createdBy.username,
      creationSource: "admin_register",
      createdAt: created.createdAt,
    });

    return { player: toPublicPlayer(created), initialPassword };
  }
}

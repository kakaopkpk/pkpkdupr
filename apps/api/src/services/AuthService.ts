import {
  GuestAddedInfo,
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
import {
  isValidUsername,
  toInternalEmail,
  type AdminPasswordResetResponse,
  type AdminPromoteGuestResponse,
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
import type { RatingServiceContract } from "./RatingContract";
import { ScorePerformanceRatingService } from "./ScorePerformanceRatingService";
import {
  getMatchTopLevelType,
  matchTypeValues,
  type Match,
  type MatchType,
} from "@pkpkdupr/shared/match";
import {
  getDevMockUsernames,
  isDevMockDataEnabled,
  type CreateStoredPlayerInput,
} from "@pkpkdupr/db";
import { db } from "../db";

/** 같은 내부 이메일의 Auth 사용자가 이미 있으면 409 AccountRequestError로 바꾸고, 그 밖의 오류는 그대로 둔다. */
const toDuplicateAuthEmailError = (error: unknown) =>
  error instanceof AuthEmailExistsError
    ? new AccountRequestError(409, "같은 아이디의 로그인 계정이 이미 있습니다.")
    : error;

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
  guestAddedByPlayerId: string | null;
  guestAddedSessionId: string | null;
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
  /** 게스트를 추가한 회원·세션. 정회원은 null */
  guestAddedInfo: GuestAddedInfo | null;
  /** 참가한 평점 미반영(게스트가 낀) 완료 경기 수 */
  ratingExcludedMatchCount: number;
}

const buildId = (prefix: string) =>
  `${prefix}-${randomUUID()}`;

const createPlayer = (
  input: Pick<Player, "username" | "gender"> & { isGuest?: boolean },
): Player & { duprRating: null } => {
  const now = new Date();

  return {
    id: generateEntityId("player"),
    username: input.username,
    duprRating: null,
    gender: input.gender,
    status: "active",
    isGuest: input.isGuest ?? false,
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
    gender: record.gender ?? null,
    isGuest: record.isGuest === true,
    guestAddedByPlayerId: record.guestAddedByPlayerId ?? null,
    guestAddedSessionId: record.guestAddedSessionId ?? null,
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
    guestAddedByPlayerId: _guestAddedByPlayerId,
    guestAddedSessionId: _guestAddedSessionId,
    ...player
  } = stored;
  return player;
};

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

export interface DuprRecalculationSummary {
  ratingChangeLogs: PlayerRatingChangeLog[];
  perMatchLogs: PlayerRatingChangeLog[];
  changedPlayerCount: number;
  restoredMatchDuprSnapshotCount: number;
  restoredMatchDuprSnapshotMatchCount: number;
  perMatchLogCount: number;
}

export interface MatchRatingApplyResult {
  ratingChangeLogs: PlayerRatingChangeLog[];
  changedPlayerCount: number;
}

interface MatchParticipantDuprSnapshot {
  matchId: string;
  playerId: string;
  duprRating: PublicPlayerDupr | null;
}

/**
 * 재계산 입력(완료 경기 목록)을 읽는 함수. 평점 쓰기 잠금 안에서 호출해,
 * 잠금을 기다리는 동안 다른 경로가 반영한 경기까지 포함한 최신 목록으로 재계산한다.
 */
export type CompletedMatchesLoader = () => Promise<Match[]>;

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

  /**
   * 평점을 쓰는 공개 메서드는 모두 이 잠금 안에서 실행한다(Postgres advisory 잠금 키 하나).
   * 잠금 안에서는 *Locked 메서드만 부른다. 잠금을 다시 잡으면 다른 커넥션이 같은 키를 기다려 교착된다.
   */
  private async withRatingWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    return await db.ratingWriteLock.run(fn);
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

  private buildSession(
    stored: StoredPlayerRecord,
    isAdmin: boolean,
  ): AuthenticatedSession {
    if (stored.status === "inactive") {
      throw new InvalidAccessTokenError(
        "비활성 계정입니다. 관리자에게 문의해주세요.",
      );
    }

    return {
      payload: {
        playerId: stored.id,
        isAdmin,
      },
      player: toPublicPlayer(stored),
      isFirstLogin: stored.isFirstLogin,
    };
  }

  /**
   * Supabase Auth 토큰을 확인하고 `players.auth_user_id`로 연결된 회원 세션을 만든다.
   * 회원과 관리자 여부는 DB 쿼리 1회로 가져온다.
   * Auth 사용자는 관리자만 만들 수 있으므로 provider·이메일은 따로 검사하지 않는다.
   */
  async authenticateAccessToken(
    accessToken: string,
  ): Promise<AuthenticatedSession> {
    const user = await this.authUserVerifier.getUser(accessToken);
    if (!user) {
      throw new InvalidAccessTokenError("세션이 만료되었거나 유효하지 않습니다.");
    }

    const linked = await db.players.findByAuthUserIdWithAdmin(user.id);
    if (!linked) {
      throw new AuthError(
        "ACCOUNT_NOT_LINKED",
        "연결된 회원이 없습니다. 관리자에게 문의해주세요.",
      );
    }

    return this.buildSession(hydratePlayer(linked.player), linked.isAdmin);
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
      throw toDuplicateAuthEmailError(error);
    }
  }

  private async updateAuthUser(
    authUserId: string,
    input: { email?: string; password?: string },
  ): Promise<void> {
    try {
      await this.authAdmin.updateUser(authUserId, input);
    } catch (error) {
      throw toDuplicateAuthEmailError(error);
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
   * 게스트는 정회원 승급(`promoteGuest`)으로만 계정을 받으므로 409로 거절한다.
   */
  async resetPlayerPassword(
    playerId: string,
  ): Promise<AdminPasswordResetResponse> {
    const stored = await this.getStoredPlayerById(playerId);
    if (!stored) {
      throw new AccountRequestError(404, "사용자를 찾을 수 없습니다.");
    }
    if (stored.isGuest) {
      throw new AccountRequestError(
        409,
        "게스트에게는 비밀번호를 발급할 수 없습니다. 정회원으로 승급해 계정을 발급해주세요.",
      );
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
   * 관리자가 게스트를 정회원으로 승급한다. 성별을 저장하고 로그인 계정을 함께 발급하며(첫 로그인 비밀번호 변경 강제),
   * 초기 비밀번호는 응답으로만 돌려준다. 이미 게스트로 뛴 ratingExcluded 경기는 그대로 미반영이다.
   * 게스트가 아니면 409, 없으면 404, inactive거나 아이디가 로그인 형식이 아니면 400이다.
   */
  async promoteGuest(
    playerId: string,
    gender: "M" | "F",
  ): Promise<AdminPromoteGuestResponse> {
    const stored = await this.getStoredPlayerById(playerId);
    if (!stored) {
      throw new AccountRequestError(404, "사용자를 찾을 수 없습니다.");
    }
    if (!stored.isGuest) {
      throw new AccountRequestError(409, "게스트가 아닌 회원입니다.");
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

    const initialPassword = generateInitialPassword();
    const stateChangedError = () =>
      new AccountRequestError(
        409,
        "회원 상태가 바뀌어 승급하지 못했습니다. 다시 시도해주세요.",
      );

    if (stored.authUserId) {
      // 게스트에게 이미 Auth 사용자가 연결돼 있으면 새로 만들지 않고 비밀번호만 바꾼다.
      // 승급을 먼저 확정해, 다른 요청이 먼저 승급한 경우 그 회원의 비밀번호를 덮어쓰지 않는다.
      // Auth 갱신이 실패해도 첫 로그인 플래그가 켜져 있어 관리자가 비밀번호 초기화로 복구할 수 있다.
      const promoted = await db.players.promoteGuest(stored.id, gender, null);
      if (!promoted) {
        throw stateChangedError();
      }
      await this.updateAuthUser(stored.authUserId, {
        email: toInternalEmail(stored.username),
        password: initialPassword,
      });
      return {
        player: toPublicPlayer(hydratePlayer(promoted)),
        initialPassword,
      };
    }

    const authUserId = await this.createAuthUser(
      stored.username,
      initialPassword,
    );
    let promoted: Awaited<ReturnType<typeof db.players.promoteGuest>>;
    try {
      promoted = await db.players.promoteGuest(stored.id, gender, authUserId);
    } catch (error) {
      await this.deleteOrphanAuthUser(authUserId);
      throw error;
    }
    if (!promoted) {
      // 조회 뒤 다른 요청이 먼저 승급했거나 회원이 inactive로 바뀌었다.
      await this.deleteOrphanAuthUser(authUserId);
      throw stateChangedError();
    }
    return {
      player: toPublicPlayer(hydratePlayer(promoted)),
      initialPassword,
    };
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
    if (!(await db.players.linkAuthUser(stored.id, authUserId, false))) {
      throw new Error(
        `회원에 Auth 사용자를 연결하지 못했습니다. 다음 기동에서 다시 연결합니다. (authUserId=${authUserId})`,
      );
    }
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
    const [players, excludedMatchCountByPlayerId] = await Promise.all([
      db.players.findAll().then((records) => records.map(hydratePlayer)),
      db.matches.countRatingExcludedMatchesByPlayerId(),
    ]);
    const usernameById = new Map(
      players.map((player) => [player.id, player.username]),
    );
    const guestSessionIds = [
      ...new Set(
        players.flatMap((player) =>
          player.isGuest && player.guestAddedSessionId
            ? [player.guestAddedSessionId]
            : [],
        ),
      ),
    ];
    const sessionById = new Map(
      (
        await Promise.all(
          guestSessionIds.map((sessionId) =>
            db.matches.findSessionById(sessionId),
          ),
        )
      ).flatMap((session) => (session ? [[session.id, session] as const] : [])),
    );

    return players.map((player): AdminPlayer => {
      const session = player.guestAddedSessionId
        ? sessionById.get(player.guestAddedSessionId)
        : undefined;
      return {
        ...toPublicPlayer(player),
        duprMetrics: player.duprMetrics,
        // 추가한 회원·세션이 지워졌으면 id만 남기고 이름·날짜는 null이다.
        guestAddedInfo: player.isGuest
          ? {
              addedByPlayerId: player.guestAddedByPlayerId,
              addedByUsername: player.guestAddedByPlayerId
                ? (usernameById.get(player.guestAddedByPlayerId) ?? null)
                : null,
              sessionId: player.guestAddedSessionId,
              sessionName: session?.name ?? null,
              sessionDate: session?.date ?? null,
            }
          : null,
        ratingExcludedMatchCount: excludedMatchCountByPlayerId[player.id] ?? 0,
      };
    });
  }

  /**
   * 세션에서 게스트를 만든다. Auth 계정 없이 active·성별 없음·NR로 만들고, 추가한 회원과 세션을 남긴다.
   * 아이디 형식이 틀리면 400, 대소문자 무시로 이미 있으면 409다. 세션 참여자 추가는 호출부가 한다.
   */
  async createGuestPlayer(input: {
    username: string;
    addedByPlayerId: string;
    sessionId: string;
  }): Promise<Player> {
    const username = input.username.trim();
    if (!isValidUsername(username)) {
      throw new AccountRequestError(400, USERNAME_FORMAT_MESSAGE);
    }
    // 동시 요청은 createStoredPlayer가 lower(username) 유니크 위반을 409로 바꿔 걸러낸다.
    if (await db.players.findByUsernameIgnoringCase(username)) {
      throw new AccountRequestError(409, DUPLICATE_USERNAME_MESSAGE);
    }

    const created = await this.createStoredPlayer({
      ...createPlayer({ username, gender: null, isGuest: true }),
      guestAddedByPlayerId: input.addedByPlayerId,
      guestAddedSessionId: input.sessionId,
    });
    return toPublicPlayer(hydratePlayer(created));
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
          this.ratingService.getCorrectionWeight(
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
    // 게스트가 낀 경기(ratingExcluded)는 정회원 승급 뒤 재계산에서도 평점에 넣지 않는다.
    const replayMatches = completedMatches
      .filter(
        (match) =>
          match.status === "completed" &&
          match.completedAt &&
          !match.ratingExcluded,
      )
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
      const category = getMatchTopLevelType(match.type);
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
      const replayResult = this.ratingService.replayMatch(
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
      (matchType) => getMatchTopLevelType(matchType) === category,
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
    loadCompletedMatches: CompletedMatchesLoader,
  ): Promise<{
    player: Player;
    log: OfficialDuprAdjustmentLog;
    ratingChangeLogs: PlayerRatingChangeLog[];
  }> {
    return await this.withRatingWriteLock(async () =>
      this.applyOfficialDuprAdjustmentLocked(
        input,
        await loadCompletedMatches(),
      ),
    );
  }

  private async applyOfficialDuprAdjustmentLocked(
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

  /** 완료 경기 전체로 평점을 처음부터 다시 계산한다. 입력은 평점 쓰기 잠금 안에서 읽는다 */
  async recalculateDuprRatings(
    loadCompletedMatches: CompletedMatchesLoader,
    options: RecalculateDuprRatingsOptions = {},
  ): Promise<DuprRecalculationSummary> {
    return await this.withRatingWriteLock(async () =>
      this.recalculateDuprRatingsLocked(await loadCompletedMatches(), options),
    );
  }

  private async recalculateDuprRatingsLocked(
    completedMatches: Match[],
    options: RecalculateDuprRatingsOptions,
  ): Promise<DuprRecalculationSummary> {
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

  /** 완료 경기 하나를 지금 평점에 증분 반영한다. 이미 반영된 경기면 기존 로그를 돌려준다 */
  async applyMatchResultToRatings(match: Match): Promise<MatchRatingApplyResult> {
    return await this.withRatingWriteLock(() =>
      this.applyMatchResultToRatingsLocked(match),
    );
  }

  /**
   * 잠금 안에서 경기를 다시 읽어 반영한다. 잠금을 기다리는 사이 경기가 지워졌거나
   * 완료가 아니게 됐으면 평점 효과를 남기지 않고, 고쳐졌으면 고친 내용으로 반영한다.
   */
  private async applyMatchResultToRatingsLocked(
    requested: Match,
    options: { refreshProjection?: boolean } = {},
  ): Promise<MatchRatingApplyResult> {
    const match = await db.matches.findById(requested.id);
    if (!match || match.status !== "completed" || match.ratingExcluded) {
      return { ratingChangeLogs: [], changedPlayerCount: 0 };
    }
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

    const category = getMatchTopLevelType(match.type);
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
  async applyMatchResultsToRatings(
    matches: Match[],
  ): Promise<MatchRatingApplyResult> {
    return await this.withRatingWriteLock(() =>
      this.applyMatchResultsToRatingsLocked(matches),
    );
  }

  private async applyMatchResultsToRatingsLocked(
    matches: Match[],
  ): Promise<MatchRatingApplyResult> {
    const ratingResults = [];
    for (const match of [...matches].sort(
      (left, right) =>
        left.completedAt!.getTime() - right.completedAt!.getTime(),
    )) {
      ratingResults.push(
        await this.applyMatchResultToRatingsLocked(match, {
          refreshProjection: false,
        }),
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

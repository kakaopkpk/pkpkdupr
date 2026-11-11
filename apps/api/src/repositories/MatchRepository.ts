import type {
  Match,
  MatchFeedItem,
  MatchMode,
  MatchScore,
  MatchSessionSummary,
  ManagedMatchSession,
  Session,
} from "@pkpkdupr/shared/match";
import { DEFAULT_MATCH_MODE } from "@pkpkdupr/shared/match";
import { generateEntityId, isEntityId } from "@pkpkdupr/shared/entityId";
import { kstDateKeyToDate } from "@pkpkdupr/shared/session";
import type {
  PlayerRatingChangeLog,
  PlayerRatingHistory,
} from "@pkpkdupr/shared/player";
import {
  CompletedMatchResultEditError,
  MatchRecordUpdateConflictError,
  SessionHasMatchesError,
  type CreateMatchInput,
  type UpdateMatchMetadataInput,
  type UpdateRecordedMatchInput,
} from "@pkpkdupr/db";
import { db } from "../db";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 저장소 호출 실패를 공개 API가 응답할 HTTP 상태와 함께 전달한다.
 * status는 라우트가 404·409 등을 구분해 응답하는 데 쓴다.
 */
export class MatchRepositoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MatchRepositoryError";
  }
}

const isUniqueViolation = (error: unknown) => {
  const message = (error as Error).message ?? "";
  return message.includes("UNIQUE") || message.includes("unique");
};

const toRepositoryError = (error: unknown, status: number) =>
  error instanceof MatchRepositoryError
    ? error
    : new MatchRepositoryError((error as Error).message, status);

/** 키 존재 여부로 갱신 필드를 판단하는 저장소에 값이 없는 키를 넘기지 않는다. */
const omitUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;

type NewMatchInput = Omit<Match, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

const toCreateMatchInput = (match: NewMatchInput): CreateMatchInput =>
  ({
    ...match,
    id: match.id ?? generateEntityId("match"),
    resultSubmittedByPlayerId: match.resultSubmittedByPlayerId ?? null,
    resultSubmittedAt: match.resultSubmittedAt ?? null,
  }) as CreateMatchInput;

export interface TimestampUnitAudit {
  legacyMatchStartsAtCount: number;
  affectedPlayers: Array<{
    playerId: string;
    username: string;
    completedMatchCount: number;
    latestLegacyMatchStartsAt: number;
  }>;
}

export interface PlayerRatingChartProjection {
  history: PlayerRatingHistory;
  generatedAt: Date;
}

const toDateOrNull = (value: string | Date | null | undefined) =>
  value == null ? null : new Date(value);

const hydrateSession = (record: any): Session | undefined => {
  if (!record.session?.date) {
    return undefined;
  }

  return {
    id: record.session.id,
    name:
      typeof record.session.name === "string" && record.session.name.trim()
        ? record.session.name.trim()
        : undefined,
    date: new Date(record.session.date),
    location:
      typeof record.session.location === "string" && record.session.location.trim()
        ? record.session.location.trim()
        : "Court TBD",
  };
};

const hydrateStandaloneSession = (record: any): Session => ({
  id: record.id,
  name: record.name,
  date: new Date(record.date),
  location: record.location,
});

const hydrateManagedSession = (record: any): ManagedMatchSession => ({
  id: record.id,
  name: record.name,
  date: new Date(record.date),
  location: record.location,
  participantIds: record.participantIds ?? [],
  matchCount: Number(record.matchCount ?? 0),
  kind: record.kind === "regular" ? "regular" : "custom",
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

const hydrateRatingChangeLog = (record: any): PlayerRatingChangeLog => ({
  id: record.id,
  playerId: record.playerId,
  source: record.source,
  sourceLogId: record.sourceLogId,
  previousRating: record.previousRating,
  nextRating: record.nextRating,
  delta: record.delta,
  createdAt: new Date(record.createdAt),
});

const hydrateRatingHistory = (record: any): PlayerRatingHistory => ({
  singles: (record?.singles ?? []).flatMap((point: any) => {
    const createdAt = new Date(point.createdAt);
    return Number.isFinite(point.rating) && !Number.isNaN(createdAt.getTime())
      ? [{ rating: point.rating, source: point.source, createdAt }]
      : [];
  }),
  doubles: (record?.doubles ?? []).flatMap((point: any) => {
    const createdAt = new Date(point.createdAt);
    return Number.isFinite(point.rating) && !Number.isNaN(createdAt.getTime())
      ? [{ rating: point.rating, source: point.source, createdAt }]
      : [];
  }),
});

export const hydrateMatch = (record: any): Match => ({
  ...record,
  mode: (record.mode as MatchMode | undefined) ?? DEFAULT_MATCH_MODE,
  source: record.source ?? "player_created",
  name:
    typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : undefined,
  courtName:
    typeof record.courtName === "string" && record.courtName.trim()
      ? record.courtName.trim()
      : undefined,
  session: hydrateSession(record),
  teams: [
    {
      ...record.teams[0],
      players: record.teams[0].players.map((player: any) => ({
        ...player,
        createdAt: new Date(player.createdAt),
        updatedAt: new Date(player.updatedAt),
      })),
    },
    {
      ...record.teams[1],
      players: record.teams[1].players.map((player: any) => ({
        ...player,
        createdAt: new Date(player.createdAt),
        updatedAt: new Date(player.updatedAt),
      })),
    },
  ],
  scores: record.scores?.map(({ scoreA, scoreB }: MatchScore) => ({
    scoreA,
    scoreB,
  })),
  resultSubmittedByPlayerId: record.resultSubmittedByPlayerId ?? null,
  resultSubmittedAt: toDateOrNull(record.resultSubmittedAt),
  matchStartsAt: new Date(record.matchStartsAt),
  completedAt: toDateOrNull(record.completedAt),
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

const hydrateSessionSummary = (record: any): MatchSessionSummary => ({
  id: record.id,
  name: record.name,
  date: new Date(record.date),
  location:
    typeof record.location === "string" && record.location.trim()
      ? record.location.trim()
      : "Court TBD",
  status: record.status === "completed" ? "completed" : "created",
  matchCount: record.matchCount,
  participants: (record.participants ?? []).map((participant: any) => ({
    id: participant.id,
    username: participant.username,
    avatarUrl: participant.avatarUrl ?? undefined,
  })),
  latestCreatedAt: new Date(record.latestCreatedAt),
});

const hydrateMatchFeedItem = (record: any): MatchFeedItem =>
  record.kind === "session"
    ? { kind: "session", session: hydrateSessionSummary(record.session) }
    : { kind: "match", match: hydrateMatch(record.match) };

/**
 * MatchRepository - API 서버에서 `@pkpkdupr/db`의 match 저장소를 호출하고,
 * 저장소 예외를 공개 API 상태 코드(MatchRepositoryError.status)로 변환합니다.
 */
export class MatchRepository {
  /**
   * 저장소 호출을 실행하고 실패를 status가 담긴 MatchRepositoryError로 바꾼다.
   * resolveStatus가 없으면 fallbackStatus를 쓴다.
   */
  private async run<T>(
    operation: () => Promise<T>,
    fallbackStatus: number,
    resolveStatus?: (error: unknown) => number | undefined,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toRepositoryError(
        error,
        resolveStatus?.(error) ?? fallbackStatus,
      );
    }
  }

  private async findStoredMatch(matchId: string): Promise<Match | undefined> {
    try {
      return await this.run(() => db.matches.findById(matchId), 500);
    } catch (error) {
      if ((error as Error).message.includes("찾을 수 없습니다")) {
        return undefined;
      }
      throw error;
    }
  }

  /** ID로 단일 경기 조회 */
  async findById(matchId: string): Promise<Match | undefined> {
    const match = await this.findStoredMatch(matchId);
    return match ? hydrateMatch(match) : undefined;
  }

  /** ID로 단일 경기 조회 + 이 경기에 의한 DUPR 변동 로그 함께 반환 */
  async findByIdWithRatingChanges(
    matchId: string,
  ): Promise<
    { match: Match; ratingChanges: PlayerRatingChangeLog[] } | undefined
  > {
    const [match, ratingChangeRecords] = await Promise.all([
      this.findStoredMatch(matchId),
      this.run(() => db.playerRatingChangeLogs.findByMatchId(matchId), 500),
    ]);
    if (!match) {
      return undefined;
    }

    return {
      match: hydrateMatch(match),
      ratingChanges: (ratingChangeRecords ?? []).map(hydrateRatingChangeLog),
    };
  }

  /** 신규 경기 추가 */
  async create(match: NewMatchInput): Promise<Match> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const created = await this.run(
          () => db.matches.create(toCreateMatchInput(match)),
          500,
          (error) => (isUniqueViolation(error) ? 409 : undefined),
        );
        return hydrateMatch(created);
      } catch (error) {
        if (
          match.id ||
          attempt === 7 ||
          !(error instanceof MatchRepositoryError) ||
          error.status !== 409
        ) {
          throw error;
        }
      }
    }

    throw new Error("매치 ID 생성에 실패했습니다.");
  }

  private async createBatch(
    matches: NewMatchInput[],
    allowCompleted: boolean,
  ): Promise<Match[]> {
    const inputs = matches.map(toCreateMatchInput);
    if (inputs.length === 0) {
      throw new MatchRepositoryError(
        "한 개 이상의 예정 경기가 필요합니다.",
        400,
      );
    }
    const created = await this.run(
      () => db.matches.createScheduledBatch(inputs, { allowCompleted }),
      400,
      (error) => (isUniqueViolation(error) ? 409 : undefined),
    );
    return created.map(hydrateMatch);
  }

  async createScheduledBatch(matches: NewMatchInput[]): Promise<Match[]> {
    return await this.createBatch(matches, false);
  }

  /** 세션이 지정된 완료 경기를 저장소의 단일 transaction으로 생성한다. */
  async createCompletedBatch(matches: NewMatchInput[]): Promise<Match[]> {
    return await this.createBatch(matches, true);
  }

  async createSession(
    session: Omit<Session, "id"> & { id?: string },
  ): Promise<Session> {
    const created = await this.run(
      () =>
        db.matches.createSession({
          ...session,
          id: session.id ?? generateEntityId("session"),
          date: new Date(session.date),
        }),
      400,
    );
    return hydrateStandaloneSession(created);
  }

  async findSessions(): Promise<ManagedMatchSession[]> {
    const records = await this.run(() => db.matches.findSessions(), 500);
    return records.map(hydrateManagedSession);
  }

  async findSessionById(
    sessionId: string,
  ): Promise<ManagedMatchSession | undefined> {
    const record = await this.run(
      () => db.matches.findSessionById(sessionId),
      500,
    );
    return record ? hydrateManagedSession(record) : undefined;
  }

  /** 그 KST 날짜의 정기 세션을 찾거나 만든다. 같은 날짜에 하나만 존재한다 */
  async findOrCreateRegularSession(
    dateKey: string,
  ): Promise<ManagedMatchSession> {
    const record = await this.run(
      () => db.matches.findOrCreateRegularSession(dateKey),
      500,
    );
    return hydrateManagedSession(record);
  }

  /** 참여자를 추가한다. 이미 있으면 무시한다(동시 호출에도 덮어쓰지 않음) */
  async addSessionParticipants(
    sessionId: string,
    playerIds: string[],
  ): Promise<void> {
    await this.run(
      () => db.matches.addSessionParticipants(sessionId, playerIds),
      500,
    );
  }

  /** 참여자 한 명을 뺀다. 참여 중이 아니어도 성공한다(멱등) */
  async removeSessionParticipant(
    sessionId: string,
    playerId: string,
  ): Promise<void> {
    await this.run(
      () => db.matches.removeSessionParticipant(sessionId, playerId),
      500,
    );
  }

  /** 그 KST 날짜의 세션을 시각 오름차순으로 돌려준다 */
  async findSessionsByDateKey(
    dateKey: string,
  ): Promise<ManagedMatchSession[]> {
    const from = kstDateKeyToDate(dateKey);
    const to = new Date(from.getTime() + DAY_MS);
    const records = await this.run(
      () => db.matches.findSessionsInRange(from, to),
      500,
    );
    return records.map(hydrateManagedSession);
  }

  /**
   * 조회 시점 정리. 경기 없는 세션을 만료 시각이 지나면 삭제한다.
   * best-effort라 실패는 로그만 남기고 호출부 조회를 막지 않는다.
   */
  async cleanupExpired(now: Date = new Date()): Promise<void> {
    try {
      await db.matches.deleteExpiredEmptySessions(now);
    } catch (error) {
      console.error("[MATCH] 빈 세션 정리 실패", error);
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!isEntityId(sessionId, "session")) {
      throw new MatchRepositoryError("유효한 세션 ID가 필요합니다.", 400);
    }
    const deleted = await this.run(
      () => db.matches.deleteSession(sessionId),
      400,
      (error) => (error instanceof SessionHasMatchesError ? 409 : undefined),
    );
    if (!deleted) {
      throw new MatchRepositoryError("세션을 찾을 수 없습니다.", 404);
    }
  }

  async replaceSessionParticipants(
    sessionId: string,
    playerIds: string[],
  ): Promise<ManagedMatchSession> {
    const validPlayerIds = Array.isArray(playerIds)
      ? playerIds.filter(
          (playerId: unknown): playerId is string =>
            typeof playerId === "string",
        )
      : [];
    const updated = await this.run(
      () => db.matches.replaceSessionParticipants(sessionId, validPlayerIds),
      400,
    );
    if (!updated) {
      throw new MatchRepositoryError("세션을 찾을 수 없습니다.", 404);
    }
    return hydrateManagedSession(updated);
  }

  async recordAdminResult(
    matchId: string,
    submittedByPlayerId: string,
    scores: MatchScore[],
  ): Promise<Match> {
    const updated = await this.run(
      () =>
        db.matches.recordAdminResult(
          matchId,
          submittedByPlayerId,
          scores,
          new Date(),
        ),
      400,
      (error) =>
        error instanceof CompletedMatchResultEditError ? 409 : undefined,
    );

    return hydrateMatch(updated);
  }

  /** 참가자의 경기 기록 수정. cancelled 등 수정할 수 없는 상태로 바뀌었으면 409로 응답한다. */
  async updateRecordedMatch(
    matchId: string,
    input: UpdateRecordedMatchInput,
  ): Promise<Match> {
    const updated = await this.run(
      () => db.matches.updateRecordedMatch(matchId, input),
      400,
      (error) =>
        error instanceof MatchRecordUpdateConflictError ? 409 : undefined,
    );

    return hydrateMatch(updated);
  }

  async delete(matchId: string): Promise<void> {
    try {
      await db.matches.delete(matchId);
    } catch (error) {
      if ((error as Error).message === "MATCH_NOT_FOUND") {
        throw new MatchRepositoryError("매치를 찾을 수 없습니다.", 404);
      }
      throw toRepositoryError(error, 400);
    }
  }

  /** 특정 플레이어의 rating 변동 로그 조회 */
  async getPlayerRatingChangeLogs(
    playerId: string,
  ): Promise<PlayerRatingChangeLog[]> {
    const records = await this.run(
      () => db.playerRatingChangeLogs.findByPlayerId(playerId),
      500,
    );
    return (records ?? []).map(hydrateRatingChangeLog);
  }

  async getPlayerRatingChartProjection(
    playerId: string,
  ): Promise<PlayerRatingChartProjection | null> {
    const record = await this.run(
      () => db.playerRatingChartProjections.findByPlayerId(playerId),
      500,
    );
    if (!record) {
      return null;
    }
    const generatedAt = new Date(record.generatedAt);
    if (Number.isNaN(generatedAt.getTime())) {
      throw new Error("평점 차트 projection 생성 시각이 유효하지 않습니다.");
    }
    return {
      history: hydrateRatingHistory(record.history),
      generatedAt,
    };
  }

  async replacePlayerRatingChartProjection(
    playerId: string,
    projection: PlayerRatingChartProjection,
  ): Promise<PlayerRatingChartProjection> {
    if (
      !projection.history ||
      !Array.isArray(projection.history.singles) ||
      !Array.isArray(projection.history.doubles)
    ) {
      throw new MatchRepositoryError(
        "평점 차트 projection 이력이 필요합니다.",
        400,
      );
    }
    const generatedAt = projection.generatedAt
      ? new Date(projection.generatedAt)
      : new Date();
    if (Number.isNaN(generatedAt.getTime())) {
      throw new MatchRepositoryError(
        "유효한 projection 생성 시각이 필요합니다.",
        400,
      );
    }

    const record = await this.run(
      () =>
        db.playerRatingChartProjections.replace(
          playerId,
          projection.history,
          generatedAt,
        ),
      500,
    );
    return {
      history: hydrateRatingHistory(record.history),
      generatedAt: new Date(record.generatedAt),
    };
  }

  /** 특정 플레이어의 경기 이력 조회 */
  async findByPlayerId(
    playerId: string,
    page: number = 0,
    limit: number = 20,
  ): Promise<{ matches: Match[]; total: number }> {
    return await this.findAll(page, limit, playerId);
  }

  async getLastPlayedAtByPlayerId(): Promise<Record<string, Date>> {
    const records = await this.run(
      () => db.matches.findLastPlayedAtByPlayerId(),
      500,
    );

    return Object.fromEntries(
      Object.entries(records).map(([playerId, lastPlayedAt]) => [
        playerId,
        new Date(lastPlayedAt),
      ]),
    );
  }

  async getTimestampUnitAudit(): Promise<TimestampUnitAudit> {
    return await this.run(() => db.matches.getTimestampUnitAudit(), 500);
  }

  /** 모든 경기 목록 */
  async findAll(
    page: number = 0,
    limit: number = 20,
    playerId?: string,
  ): Promise<{ matches: Match[]; total: number }> {
    const result = await this.run(
      () => db.matches.findAll(page, limit, playerId || undefined),
      500,
    );

    return {
      matches: result.matches.map(hydrateMatch),
      total: result.total,
    };
  }

  async findFeed(
    page: number = 0,
    limit: number = 20,
    playerId?: string,
  ): Promise<{ items: MatchFeedItem[]; total: number }> {
    const result = await this.run(
      () => db.matches.findFeed(page, limit, playerId || undefined),
      500,
    );
    return {
      items: result.items.map(hydrateMatchFeedItem),
      total: result.total,
    };
  }

  async findBySession(sessionId: string): Promise<Match[]> {
    if (!isEntityId(sessionId, "session")) {
      throw new MatchRepositoryError("유효한 세션 ID가 필요합니다.", 400);
    }
    const records = await this.run(
      () => db.matches.findBySession(sessionId),
      500,
    );
    return records.map(hydrateMatch);
  }

  async updateMetadata(
    matchId: string,
    input: {
      name?: string | null;
      sessionId?: string | null;
      location?: string;
      courtName?: string | null;
      matchStartsAt?: string;
    },
  ): Promise<Match> {
    const updated = await this.run(
      () =>
        db.matches.updateMetadata(
          matchId,
          omitUndefined(input) as UpdateMatchMetadataInput,
        ),
      400,
    );
    if (!updated) {
      throw new MatchRepositoryError("매치를 찾을 수 없습니다.", 404);
    }

    return hydrateMatch(updated);
  }
}

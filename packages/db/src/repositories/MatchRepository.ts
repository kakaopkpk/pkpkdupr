import type {
  MatchMode,
  Match,
  MatchFeedItem,
  MatchScore,
  MatchSessionSummary,
  MatchStatus,
  ManagedMatchSession,
  Session,
  MatchSource,
  MatchType,
  Team,
} from "@pkpkdupr/shared/match";
import {
  DEFAULT_MATCH_MODE,
  getMatchSessionStatus,
  getMaxScoreCountForMatchMode,
  validateMatchScoresForMode,
} from "@pkpkdupr/shared/match";
import {
  normalizeNullablePlayerDupr,
  type Player,
  type PublicPlayerDupr,
} from "@pkpkdupr/shared/player";
import { and, desc, eq, isNotNull, max } from "drizzle-orm";
import {
  matchParticipants,
  matches,
  matchScores,
  matchSessionParticipants,
  matchSessions,
  players,
} from "../db/schema";
import { generateEntityId, isEntityId } from "@pkpkdupr/shared/entityId";
import {
  REGULAR_SESSION_LOCATION,
  REGULAR_SESSION_NAME,
  REGULAR_SESSION_START_HOUR,
  getEmptySessionExpiresAt,
  kstDateKeyToDate,
} from "@pkpkdupr/shared/session";
import { firstRow, placeholders, type RawQueryResult } from "../db/client";

type StoredMatch = typeof matches.$inferSelect;
type StoredMatchParticipant = typeof matchParticipants.$inferSelect;
type StoredMatchScore = typeof matchScores.$inferSelect;
type StoredMatchSession = typeof matchSessions.$inferSelect;
type StoredPlayer = typeof players.$inferSelect;

export const COMPLETED_MATCH_RESULT_EDIT_ERROR_MESSAGE =
  "이미 완료된 매치 결과는 수정할 수 없습니다.";

export class CompletedMatchResultEditError extends Error {
  constructor() {
    super(COMPLETED_MATCH_RESULT_EDIT_ERROR_MESSAGE);
    this.name = "CompletedMatchResultEditError";
  }
}

export class MatchRecordUpdateConflictError extends Error {
  constructor() {
    super("기록을 수정할 수 없는 매치 상태입니다.");
    this.name = "MatchRecordUpdateConflictError";
  }
}

export class SessionHasMatchesError extends Error {
  constructor() {
    super("연결된 경기가 있는 세션은 삭제할 수 없습니다.");
    this.name = "SessionHasMatchesError";
  }
}

export interface CreateMatchInput {
  id: string;
  type: MatchType;
  mode: MatchMode;
  source?: MatchSource;
  creatorPlayerId: string;
  name?: string;
  session?: Session;
  status: Match["status"];
  teams: [Team, Team];
  scores?: MatchScore[];
  location: string;
  courtName?: string;
  matchStartsAt: Date;
  completedAt: Date | null;
  resultSubmittedByPlayerId?: string | null;
  resultSubmittedAt?: Date | null;
}

/** 참가자의 경기 기록 수정 입력. 시작 시각·세션·코트·생성자는 바꾸지 않는다. */
export interface UpdateRecordedMatchInput {
  type: MatchType;
  mode: MatchMode;
  name?: string;
  location: string;
  teams: [Team, Team];
  scores: MatchScore[];
  resultSubmittedByPlayerId: string;
  resultSubmittedAt: Date;
}

export interface UpdateMatchMetadataInput {
  name?: string | null;
  sessionId?: string | null;
  location?: string;
  courtName?: string | null;
  matchStartsAt?: Date | string;
}

export interface MatchParticipantDuprSnapshot {
  matchId: string;
  playerId: string;
  duprRating: PublicPlayerDupr | null;
}

export interface TimestampUnitAudit {
  legacyMatchStartsAtCount: number;
  affectedPlayers: Array<{
    playerId: string;
    username: string;
    completedMatchCount: number;
    latestLegacyMatchStartsAt: number;
  }>;
}

const toDateOrNull = (value: Date | string | number | null | undefined) =>
  value == null ? null : new Date(value);

const toDate = (value: Date | string | number) => new Date(value);

// schema의 unixTimestamp 컬럼은 Unix 초로 저장한다. raw SQL은 그 변환을
// 거치지 않으므로 경기 변경 타임스탬프를 여기서 직접 초로 바꾼다.
const toUnixTimestampSeconds = (value: Date) =>
  Math.floor(value.getTime() / 1000);

const toPublicPlayer = (record: StoredPlayer): Player => ({
  id: record.id,
  username: record.username,
  duprRating: normalizeNullablePlayerDupr(record.duprRating),
  gender: record.gender as Player["gender"],
  status: record.status as Player["status"],
  avatarUrl: record.avatarUrl ?? undefined,
  createdAt: toDate(record.createdAt),
  updatedAt: toDate(record.updatedAt),
});

const toMatchScore = (score: StoredMatchScore): MatchScore => ({
  scoreA: score.scoreA,
  scoreB: score.scoreB,
});

const parseParticipantDuprSnapshot = (
  value: string | null,
): PublicPlayerDupr | null | undefined => {
  if (value == null) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed == null) {
      return null;
    }
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const { singles, doubles } = parsed as Record<string, unknown>;
    const isPublicRating = (rating: unknown): rating is number | null =>
      rating == null || (typeof rating === "number" && Number.isFinite(rating));

    return isPublicRating(singles) && isPublicRating(doubles)
      ? { singles, doubles }
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * MatchRepository - `packages/db`의 경기 저장소.
 *
 * matches, match_scores, match_participants를 조립해
 * shared Match 계약 형태로 반환합니다.
 */
const REGULAR_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class MatchRepository {
  constructor(
    private db: any,
    private client: any,
  ) {}

  async createSession(session: Session): Promise<Session> {
    const sessionId = await this.ensureSession(session);
    const stored = await this.db
      .select()
      .from(matchSessions)
      .where(eq(matchSessions.id, sessionId))
      .limit(1)
      .then(firstRow);

    if (!stored) {
      throw new Error("세션 생성에 실패했습니다.");
    }

    return {
      id: stored.id,
      name: stored.name,
      date: toDate(stored.date),
      location: stored.location,
    };
  }

  private async toManagedSession(
    stored: StoredMatchSession,
  ): Promise<ManagedMatchSession> {
    const [participantRecords, sessionMatches] = await Promise.all([
      this.db
        .select()
        .from(matchSessionParticipants)
        .where(eq(matchSessionParticipants.sessionId, stored.id))
        .orderBy(matchSessionParticipants.id),
      this.db
        .select()
        .from(matches)
        .where(eq(matches.sessionId, stored.id)),
    ]);

    return {
      id: stored.id,
      name: stored.name,
      date: toDate(stored.date),
      location: stored.location,
      participantIds: participantRecords.map(
        (participant: typeof matchSessionParticipants.$inferSelect) =>
          participant.playerId,
      ),
      matchCount: sessionMatches.length,
      kind: stored.regularDateKey ? "regular" : "custom",
      createdAt: toDate(stored.createdAt),
      updatedAt: toDate(stored.updatedAt),
    };
  }

  async findSessions(): Promise<ManagedMatchSession[]> {
    const storedSessions = await this.db
      .select()
      .from(matchSessions)
      .orderBy(desc(matchSessions.date));
    return await Promise.all(
      storedSessions.map((session: StoredMatchSession) =>
        this.toManagedSession(session),
      ),
    );
  }

  async findSessionById(
    sessionId: string,
  ): Promise<ManagedMatchSession | undefined> {
    if (!isEntityId(sessionId, "session")) {
      return undefined;
    }
    const stored = await this.db
      .select()
      .from(matchSessions)
      .where(eq(matchSessions.id, sessionId))
      .limit(1)
      .then(firstRow);
    return stored ? await this.toManagedSession(stored) : undefined;
  }

  async replaceSessionParticipants(
    sessionId: string,
    playerIds: string[],
  ): Promise<ManagedMatchSession | undefined> {
    const session = await this.findSessionById(sessionId);
    if (!session) {
      return undefined;
    }

    const uniquePlayerIds = [...new Set(playerIds)];
    const playerRecords = await Promise.all(
      uniquePlayerIds.map((playerId) =>
        this.db
          .select()
          .from(players)
          .where(eq(players.id, playerId))
          .limit(1)
          .then(firstRow),
      ),
    );
    if (
      playerRecords.some(
        (player: StoredPlayer | undefined) =>
          !player || player.status !== "active",
      )
    ) {
      throw new Error("유효한 활성 참여자만 등록할 수 있습니다.");
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    const now = new Date();
    try {
      await transaction.execute({
        sql: "DELETE FROM match_session_participants WHERE session_id = $1",
        args: [sessionId],
      });
      for (const playerId of uniquePlayerIds) {
        await transaction.execute({
          sql: `
            INSERT INTO match_session_participants (
              id,
              session_id,
              player_id,
              created_at
            )
            VALUES ($1, $2, $3, $4)
          `,
          args: [
            `${sessionId}-${playerId}`,
            sessionId,
            playerId,
            toUnixTimestampSeconds(now),
          ],
        });
      }
      await transaction.execute({
        sql: "UPDATE match_sessions SET updated_at = $1 WHERE id = $2",
        args: [toUnixTimestampSeconds(now), sessionId],
      });
      await transaction.commit();
      committed = true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }

    return await this.findSessionById(sessionId);
  }

  /**
   * 그 KST 날짜의 정기 세션을 찾거나 만든다.
   * 날짜당 하나는 regular_date_key 유니크 제약이 보장하므로, 동시 호출은 ON CONFLICT DO NOTHING 후 재조회로 같은 행을 받는다.
   */
  async findOrCreateRegularSession(
    dateKey: string,
  ): Promise<ManagedMatchSession> {
    if (!REGULAR_DATE_KEY_PATTERN.test(dateKey)) {
      throw new Error("유효한 정기 세션 날짜가 필요합니다.");
    }

    const findStored = (): Promise<StoredMatchSession | undefined> =>
      this.db
        .select()
        .from(matchSessions)
        .where(eq(matchSessions.regularDateKey, dateKey))
        .limit(1)
        .then(firstRow);

    const existing = await findStored();
    if (existing) {
      return await this.toManagedSession(existing);
    }

    const sessionDate = kstDateKeyToDate(dateKey, REGULAR_SESSION_START_HOUR);
    // 새 id가 기존 세션 id와 겹치면 행이 들어가지 않으므로 다른 id로 다시 시도한다.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const now = new Date();
      await this.db
        .insert(matchSessions)
        .values({
          id: generateEntityId("session"),
          name: REGULAR_SESSION_NAME,
          date: sessionDate,
          location: REGULAR_SESSION_LOCATION,
          regularDateKey: dateKey,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();

      const stored = await findStored();
      if (stored) {
        return await this.toManagedSession(stored);
      }
    }

    throw new Error("정기 세션을 만들지 못했습니다.");
  }

  /** 세션 참여자를 추가한다. 이미 있는 참여자는 그대로 둔다. */
  async addSessionParticipants(
    sessionId: string,
    playerIds: string[],
  ): Promise<void> {
    if (!isEntityId(sessionId, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }
    const uniquePlayerIds = [...new Set(playerIds)];
    if (uniquePlayerIds.length === 0) {
      return;
    }

    const now = toUnixTimestampSeconds(new Date());
    const values = uniquePlayerIds
      .map((_, index) => `(${placeholders(4, index * 4 + 1)})`)
      .join(", ");
    const inserted = await this.client.execute({
      sql: `
        INSERT INTO match_session_participants (
          id,
          session_id,
          player_id,
          created_at
        )
        VALUES ${values}
        ON CONFLICT DO NOTHING
      `,
      args: uniquePlayerIds.flatMap((playerId) => [
        `${sessionId}-${playerId}`,
        sessionId,
        playerId,
        now,
      ]),
    });
    if (inserted.rowsAffected > 0) {
      await this.client.execute({
        sql: "UPDATE match_sessions SET updated_at = $1 WHERE id = $2",
        args: [now, sessionId],
      });
    }
  }

  /**
   * 경기가 하나도 없고 getEmptySessionExpiresAt이 지난 세션을 참여자 행과 함께 삭제한다.
   * 삭제한 세션 수를 돌려준다.
   */
  async deleteExpiredEmptySessions(now: Date): Promise<number> {
    const candidates: RawQueryResult = await this.client.execute(`
      SELECT s.id, s."date", s.regular_date_key
      FROM match_sessions s
      WHERE NOT EXISTS (SELECT 1 FROM matches m WHERE m.session_id = s.id)
    `);
    const expiredIds = candidates.rows
      .filter((row) => {
        const kind = row.regular_date_key ? "regular" : "custom";
        const sessionDate = new Date(Number(row.date) * 1000);
        return (
          getEmptySessionExpiresAt(kind, sessionDate).getTime() <=
          now.getTime()
        );
      })
      .map((row) => String(row.id));
    if (expiredIds.length === 0) {
      return 0;
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    try {
      // 후보 조회 뒤 경기가 들어온 세션은 지우지 않도록 삭제 시점에 다시 확인한다.
      const deleted: RawQueryResult = await transaction.execute({
        sql: `
          DELETE FROM match_sessions s
          WHERE s.id IN (${placeholders(expiredIds.length)})
            AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.session_id = s.id)
          RETURNING s.id
        `,
        args: expiredIds,
      });
      const deletedIds = deleted.rows.map((row) => String(row.id));
      if (deletedIds.length > 0) {
        await transaction.execute({
          sql: `
            DELETE FROM match_session_participants
            WHERE session_id IN (${placeholders(deletedIds.length)})
          `,
          args: deletedIds,
        });
      }
      await transaction.commit();
      committed = true;
      return deletedIds.length;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }

  async findById(id: string): Promise<Match | undefined> {
    const match = await this.db
      .select()
      .from(matches)
      .where(eq(matches.id, id))
      .limit(1)
      .then(firstRow);

    if (!match) {
      return undefined;
    }

    return await this.hydrateMatch(match);
  }

  async findAll(
    page: number = 0,
    limit: number = 20,
    playerId?: string,
  ): Promise<{ matches: Match[]; total: number }> {
    // 플레이어별 조회는 이전에는 모든 경기를 hydrate한 뒤 메모리에서
    // 필터링했다. 평점 반영과 차트 projection은 이 경로를 자주 사용하므로
    // 참가자 인덱스를 통해 DB에서 먼저 대상을 줄인다.
    const allMatches = playerId
      ? (await this.db
          .select({ match: matches })
          .from(matches)
          .innerJoin(
            matchParticipants,
            eq(matchParticipants.matchId, matches.id),
          )
          .where(eq(matchParticipants.playerId, playerId))
          .orderBy(
            desc(matches.matchStartsAt),
            desc(matches.createdAt),
            desc(matches.id),
          )).map((row: { match: StoredMatch }) => row.match)
      : await this.db
          .select()
          .from(matches)
          .orderBy(
            desc(matches.matchStartsAt),
            desc(matches.createdAt),
            desc(matches.id),
          );
    const hydratedMatches: Match[] = await Promise.all(
      allMatches.map((match: StoredMatch) => this.hydrateMatch(match)),
    );
    const filteredMatches = hydratedMatches;
    const start = page * limit;

    return {
      matches: filteredMatches.slice(start, start + limit),
      total: filteredMatches.length,
    };
  }

  async findPreviousCompletedAt(
    playerId: string,
    matchTypes: MatchType[],
    before: Date,
  ): Promise<Date | null> {
    if (!playerId || !matchTypes.length || Number.isNaN(before.getTime())) {
      return null;
    }

    const typePlaceholders = placeholders(matchTypes.length, 3);
    const result = await this.client.execute({
      sql: `
        SELECT MAX(matches.completed_at) AS completed_at
        FROM match_participants
        INNER JOIN matches ON matches.id = match_participants.match_id
        WHERE match_participants.player_id = $1
          AND matches.status = 'completed'
          AND matches.completed_at IS NOT NULL
          AND matches.completed_at < $2
          AND matches.type IN (${typePlaceholders})
      `,
      args: [
        playerId,
        toUnixTimestampSeconds(before),
        ...matchTypes,
      ],
    });
    const value = (result.rows[0] as { completed_at?: unknown } | undefined)
      ?.completed_at;
    // 이전 완료 경기가 없으면 MAX가 NULL이라 Number(null) === 0(1970-01-01)이 되므로 먼저 걸러낸다.
    if (value == null) {
      return null;
    }
    const completedAt = Number(value);
    return Number.isFinite(completedAt) ? new Date(completedAt * 1000) : null;
  }

  async findLastPlayedAtByPlayerId(): Promise<Record<string, Date>> {
    const rows = await this.db
      .select({
        playerId: matchParticipants.playerId,
        lastPlayedAt: max(matches.matchStartsAt),
      })
      .from(matchParticipants)
      .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
      .where(
        and(
          eq(matches.status, "completed"),
          isNotNull(matches.completedAt),
        ),
      )
      .groupBy(matchParticipants.playerId);

    return Object.fromEntries(
      rows.flatMap(({ playerId, lastPlayedAt }: {
        playerId: string;
        lastPlayedAt: Date | string | number | null;
      }) =>
        lastPlayedAt == null ? [] : [[playerId, toDate(lastPlayedAt)]],
      ),
    );
  }

  /**
   * Drizzle timestamp columns store Unix seconds. This audit deliberately uses
   * the raw SQL client so an already-corrupted millisecond value can be
   * inspected before Drizzle hydrates it into a far-future Date.
   */
  async getTimestampUnitAudit(): Promise<TimestampUnitAudit> {
    const legacyMatchStartsAtThreshold = 100_000_000_000;
    const countResult = await this.client.execute({
      sql: `
        SELECT COUNT(*) AS legacy_match_starts_at_count
        FROM matches
        WHERE match_starts_at >= $1
      `,
      args: [legacyMatchStartsAtThreshold],
    });
    const affectedPlayersResult = await this.client.execute({
      sql: `
        SELECT
          players.id AS player_id,
          players.username AS username,
          COUNT(DISTINCT matches.id) AS completed_match_count,
          MAX(matches.match_starts_at) AS latest_legacy_match_starts_at
        FROM matches
        INNER JOIN match_participants
          ON match_participants.match_id = matches.id
        INNER JOIN players
          ON players.id = match_participants.player_id
        WHERE matches.status = 'completed'
          AND matches.completed_at IS NOT NULL
          AND matches.match_starts_at >= $1
        GROUP BY players.id, players.username
        ORDER BY latest_legacy_match_starts_at DESC, players.username ASC
      `,
      args: [legacyMatchStartsAtThreshold],
    });

    const countRow = countResult.rows[0] as
      | { legacy_match_starts_at_count?: unknown }
      | undefined;

    return {
      legacyMatchStartsAtCount: Number(
        countRow?.legacy_match_starts_at_count ?? 0,
      ),
      affectedPlayers: affectedPlayersResult.rows.map((row: any) => ({
        playerId: String(row.player_id),
        username: String(row.username),
        completedMatchCount: Number(row.completed_match_count),
        latestLegacyMatchStartsAt: Number(row.latest_legacy_match_starts_at),
      })),
    };
  }

  async findFeed(
    page: number = 0,
    limit: number = 20,
    playerId?: string,
  ): Promise<{ items: MatchFeedItem[]; total: number }> {
    const allMatches = await this.loadAllMatches();
    const sessionSummaries = this.buildSessionSummaries(allMatches);
    const registeredParticipants = await this.db
      .select()
      .from(matchSessionParticipants)
      .orderBy(matchSessionParticipants.id);
    const registeredPlayerRecords = await this.db.select().from(players);
    const registeredPlayerById = new Map<string, Player>(
      registeredPlayerRecords.map((player: StoredPlayer) => [
        player.id,
        toPublicPlayer(player),
      ]),
    );
    const sessionParticipantIds = new Map<string, Set<string>>();
    for (const match of allMatches) {
      const sessionKey = this.getSessionKey(match);
      if (!sessionKey) continue;

      const participantIds = sessionParticipantIds.get(sessionKey) ?? new Set();
      for (const team of match.teams) {
        for (const participant of team.players) {
          participantIds.add(participant.id);
        }
      }
      sessionParticipantIds.set(sessionKey, participantIds);
    }
    for (const registration of registeredParticipants) {
      const participantIds =
        sessionParticipantIds.get(registration.sessionId) ?? new Set<string>();
      participantIds.add(registration.playerId);
      sessionParticipantIds.set(registration.sessionId, participantIds);

      const summary = sessionSummaries.get(registration.sessionId);
      const player = registeredPlayerById.get(registration.playerId);
      if (
        summary &&
        player &&
        !summary.participants.some(
          (participant) => participant.id === registration.playerId,
        )
      ) {
        summary.participants.push({
          id: player.id,
          username: player.username,
          avatarUrl: player.avatarUrl,
        });
      }
    }
    for (const summary of sessionSummaries.values()) {
      summary.participants.sort(
        (left, right) =>
          Number(Boolean(right.avatarUrl)) - Number(Boolean(left.avatarUrl)),
      );
    }
    const seenSessionKeys = new Set<string>();
    const feedItems: MatchFeedItem[] = [];

    for (const match of allMatches) {
      const sessionKey = this.getSessionKey(match);
      if (!sessionKey) {
        if (!playerId || this.isPlayerInMatch(match, playerId)) {
          feedItems.push({ kind: "match", match });
        }
        continue;
      }

      if (seenSessionKeys.has(sessionKey)) {
        continue;
      }
      seenSessionKeys.add(sessionKey);

      const summary = sessionSummaries.get(sessionKey);
      if (
        summary &&
        (!playerId ||
          sessionParticipantIds.get(sessionKey)?.has(playerId))
      ) {
        feedItems.push({ kind: "session", session: summary });
      }
    }

    const start = page * limit;
    return {
      items: feedItems.slice(start, start + limit),
      total: feedItems.length,
    };
  }

  async findBySession(sessionId: string): Promise<Match[]> {
    if (!isEntityId(sessionId, "session")) {
      return [];
    }

    const allMatches = await this.loadAllMatches();
    return allMatches.filter((match) => match.session?.id === sessionId);
  }

  async create(data: CreateMatchInput): Promise<Match> {
    const now = new Date();

    if (!isEntityId(data.id, "match")) {
      throw new Error("유효한 매치 ID가 필요합니다.");
    }

    if ((data.scores?.length ?? 0) > 0) {
      validateMatchScoresForMode(data.mode, data.scores ?? []);
    }

    const sessionId = data.session
      ? await this.ensureSession(data.session)
      : null;

    await this.db.insert(matches).values({
      id: data.id,
      type: data.type,
      mode: data.mode,
      source: data.source ?? "player_created",
      creatorPlayerId: data.creatorPlayerId,
      name: data.name?.trim() || null,
      sessionId,
      sessionName: data.session?.name?.trim() || null,
      sessionDate: toDateOrNull(data.session?.date),
      status: data.status,
      location: data.location,
      courtName: data.courtName?.trim() || null,
      matchStartsAt: new Date(data.matchStartsAt),
      completedAt: toDateOrNull(data.completedAt),
      resultSubmittedByPlayerId: data.resultSubmittedByPlayerId ?? null,
      resultSubmittedAt: toDateOrNull(data.resultSubmittedAt),
      createdAt: now,
      updatedAt: now,
    });

    await this.createParticipants(data.id, data.teams);
    await this.replaceScores(data.id, data.scores ?? []);

    const created = await this.findById(data.id);
    if (!created) {
      throw new Error("매치 생성에 실패했습니다.");
    }
    return created;
  }

  async createScheduledBatch(
    data: CreateMatchInput[],
    options: { allowCompleted?: boolean } = {},
  ): Promise<Match[]> {
    if (data.length === 0) {
      return [];
    }

    const matchIds = new Set<string>();
    for (const match of data) {
      if (!isEntityId(match.id, "match")) {
        throw new Error("유효한 매치 ID가 필요합니다.");
      }
      if (matchIds.has(match.id)) {
        throw new Error("중복된 매치 ID가 있습니다.");
      }
      if (!match.session || !isEntityId(match.session.id, "session")) {
        throw new Error("유효한 세션 정보가 필요합니다.");
      }
      if (
        !match.session.name?.trim() ||
        !match.session.location?.trim() ||
        Number.isNaN(new Date(match.session.date).getTime())
      ) {
        throw new Error("유효한 세션 정보가 필요합니다.");
      }
      if (
        !options.allowCompleted &&
        (match.status !== "created" || (match.scores?.length ?? 0) > 0)
      ) {
        throw new Error("예정 경기만 일괄 생성할 수 있습니다.");
      }
      if (
        options.allowCompleted &&
        (match.status !== "completed" || (match.scores?.length ?? 0) === 0)
      ) {
        throw new Error("완료 경기만 일괄 생성할 수 있습니다.");
      }
      if (!options.allowCompleted && !match.courtName?.trim()) {
        throw new Error("코트명이 필요합니다.");
      }
      if (Number.isNaN(new Date(match.matchStartsAt).getTime())) {
        throw new Error("유효한 경기 예정 일시가 필요합니다.");
      }
      matchIds.add(match.id);
    }

    const sessionIds = [...new Set(data.map((match) => match.session!.id))];
    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      const now = new Date();
      const nowSeconds = toUnixTimestampSeconds(now);
      for (const sessionId of sessionIds) {
        const session = await transaction.execute({
          sql: "SELECT id FROM match_sessions WHERE id = $1",
          args: [sessionId],
        });
        if (session.rows.length === 0) {
          const matchSession = data.find(
            (match) => match.session?.id === sessionId,
          )?.session;
          if (!matchSession) {
            throw new Error("세션을 찾을 수 없습니다.");
          }
          await transaction.execute({
            sql: `
              INSERT INTO match_sessions (
                id, name, "date", location, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6)
            `,
            args: [
              sessionId,
              matchSession.name?.trim() || "Session",
              toUnixTimestampSeconds(new Date(matchSession.date)),
              matchSession.location,
              nowSeconds,
              nowSeconds,
            ],
          });
        }
      }

      const scoreColumns = await this.getMatchScoreColumns();
      for (const match of data) {
        const session = match.session!;
        const sessionDate = new Date(session.date);
        const matchStartsAt = new Date(match.matchStartsAt);
        const courtName = match.courtName?.trim();
        if (Number.isNaN(sessionDate.getTime())) {
          throw new Error("유효한 세션 정보가 필요합니다.");
        }
        if (!options.allowCompleted && !courtName) {
          throw new Error("코트명이 필요합니다.");
        }

        await transaction.execute({
          sql: `
            INSERT INTO matches (
              id,
              type,
              mode,
              source,
              creator_player_id,
              name,
              session_id,
              session_name,
              session_date,
              status,
              location,
              court_name,
              match_starts_at,
              completed_at,
              result_submitted_by_player_id,
              result_submitted_at,
              created_at,
              updated_at
            )
            VALUES (${placeholders(18)})
          `,
          args: [
            match.id,
            match.type,
            match.mode,
            match.source ?? "admin_created",
            match.creatorPlayerId,
            match.name?.trim() || null,
            session.id,
            session.name?.trim() || null,
            toUnixTimestampSeconds(sessionDate),
            match.status,
            match.location,
            courtName || null,
            toUnixTimestampSeconds(matchStartsAt),
            match.completedAt
              ? toUnixTimestampSeconds(new Date(match.completedAt))
              : null,
            match.resultSubmittedByPlayerId ?? null,
            match.resultSubmittedAt
              ? toUnixTimestampSeconds(new Date(match.resultSubmittedAt))
              : null,
            nowSeconds,
            nowSeconds,
          ],
        });

        for (const [teamIndex, team] of match.teams.entries()) {
          for (const player of team.players) {
            await transaction.execute({
              sql: `
                INSERT INTO match_participants (
                  id,
                  match_id,
                  team_index,
                  player_id,
                  dupr_rating_json
                )
                VALUES ($1, $2, $3, $4, $5)
              `,
              args: [
                `${match.id}-team-${teamIndex}-${player.id}`,
                match.id,
                teamIndex,
                player.id,
                JSON.stringify(player.duprRating ?? null),
              ],
            });
          }
        }
        for (const [scoreIndex, score] of (match.scores ?? []).entries()) {
          await this.insertScore({
            id: `${match.id}-score-${scoreIndex + 1}`,
            matchId: match.id,
            score,
            columns: scoreColumns,
            executor: transaction,
          });
        }
      }

      await transaction.commit();
      committed = true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }

    const createdMatches = await Promise.all(data.map((match) => this.findById(match.id)));
    if (createdMatches.some((match) => !match)) {
      throw new Error("일괄 경기 생성에 실패했습니다.");
    }
    return createdMatches as Match[];
  }

  async fillMissingParticipantDuprSnapshots(
    snapshots: MatchParticipantDuprSnapshot[],
  ): Promise<{
    updatedParticipantCount: number;
    updatedMatchCount: number;
  }> {
    const updatedMatchIds = new Set<string>();
    let updatedParticipantCount = 0;

    for (const snapshot of snapshots) {
      if (!snapshot.matchId || !snapshot.playerId) {
        continue;
      }

      const result = await this.client.execute({
        sql: `
          UPDATE match_participants
          SET dupr_rating_json = $1
          WHERE match_id = $2
            AND player_id = $3
            AND dupr_rating_json IS NULL
        `,
        args: [
          JSON.stringify(snapshot.duprRating ?? null),
          snapshot.matchId,
          snapshot.playerId,
        ],
      });

      if (result.rowsAffected) {
        updatedParticipantCount += result.rowsAffected;
        updatedMatchIds.add(snapshot.matchId);
      }
    }

    return {
      updatedParticipantCount,
      updatedMatchCount: updatedMatchIds.size,
    };
  }

  async recordAdminResult(
    matchId: string,
    submittedByPlayerId: string,
    scores: MatchScore[],
    completedAt: Date = new Date(),
  ): Promise<Match> {
    const existing = await this.findById(matchId);
    if (!existing) {
      throw new Error("매치를 찾을 수 없습니다.");
    }

    if (existing.status === "completed") {
      throw new CompletedMatchResultEditError();
    }

    if (existing.status !== "created") {
      throw new Error("결과를 입력할 수 없는 매치 상태입니다.");
    }

    validateMatchScoresForMode(existing.mode, scores);

    const scoreColumns = await this.getMatchScoreColumns();
    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      const completedAtSeconds = toUnixTimestampSeconds(completedAt);
      const updateResult = await transaction.execute({
        sql: `
          UPDATE matches
          SET
            status = $1,
            result_submitted_by_player_id = $2,
            result_submitted_at = $3,
            completed_at = $4,
            updated_at = $5
          WHERE id = $6
            AND status = 'created'
        `,
        args: [
          "completed",
          submittedByPlayerId,
          completedAtSeconds,
          completedAtSeconds,
          completedAtSeconds,
          matchId,
        ],
      });
      if (!updateResult.rowsAffected) {
        throw new Error("RESULT_SUBMIT_STATE_CONFLICT");
      }

      await this.replaceScoresWithExecutor(
        matchId,
        scores,
        scoreColumns,
        transaction,
      );

      await transaction.commit();
      committed = true;
    } catch (error) {
      transaction.close();
      const current = await this.findById(matchId);
      if (
        (error as Error).message === "RESULT_SUBMIT_STATE_CONFLICT" &&
        current?.status === "completed"
      ) {
        throw new CompletedMatchResultEditError();
      }
      throw error;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }

    const updated = await this.findById(matchId);
    if (!updated) {
      throw new Error("매치 결과 저장에 실패했습니다.");
    }
    return updated;
  }

  /**
   * created·completed 경기의 기록(종류·모드·이름·장소·참가자·점수)을 한 트랜잭션으로 교체하고
   * completed로 만든다. completed_at은 기존 값을 유지하고 없을 때만 resultSubmittedAt으로 채운다.
   * 남는 참가자는 기존 평점 스냅샷을 유지하고, 새 참가자는 비워 두어 평점 반영 때 채워지게 한다.
   */
  async updateRecordedMatch(
    matchId: string,
    data: UpdateRecordedMatchInput,
  ): Promise<Match> {
    validateMatchScoresForMode(data.mode, data.scores);
    const location = data.location.trim();
    if (!location) {
      throw new Error("매치 장소를 입력해주세요.");
    }

    const scoreColumns = await this.getMatchScoreColumns();
    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      const submittedAtSeconds = toUnixTimestampSeconds(data.resultSubmittedAt);
      const updateResult = await transaction.execute({
        sql: `
          UPDATE matches
          SET
            type = $1,
            mode = $2,
            name = $3,
            location = $4,
            status = 'completed',
            result_submitted_by_player_id = $5,
            result_submitted_at = $6,
            completed_at = COALESCE(completed_at, $6),
            updated_at = $6
          WHERE id = $7
            AND status IN ('created', 'completed')
        `,
        args: [
          data.type,
          data.mode,
          data.name?.trim() || null,
          location,
          data.resultSubmittedByPlayerId,
          submittedAtSeconds,
          matchId,
        ],
      });
      if (!updateResult.rowsAffected) {
        throw new MatchRecordUpdateConflictError();
      }

      const existingParticipants = await transaction.execute({
        sql: `SELECT player_id, dupr_rating_json FROM match_participants WHERE match_id = $1`,
        args: [matchId],
      });
      const snapshotByPlayerId = new Map<string, string | null>(
        existingParticipants.rows.map((row: Record<string, unknown>) => [
          String(row.player_id),
          (row.dupr_rating_json as string | null) ?? null,
        ]),
      );
      await transaction.execute({
        sql: `DELETE FROM match_participants WHERE match_id = $1`,
        args: [matchId],
      });
      for (const [teamIndex, team] of data.teams.entries()) {
        for (const player of team.players) {
          await transaction.execute({
            sql: `
              INSERT INTO match_participants (
                id,
                match_id,
                team_index,
                player_id,
                dupr_rating_json
              )
              VALUES ($1, $2, $3, $4, $5)
            `,
            args: [
              `${matchId}-team-${teamIndex}-${player.id}`,
              matchId,
              teamIndex,
              player.id,
              snapshotByPlayerId.get(player.id) ?? null,
            ],
          });
        }
      }
      await this.replaceScoresWithExecutor(
        matchId,
        data.scores,
        scoreColumns,
        transaction,
      );

      await transaction.commit();
      committed = true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }

    const updated = await this.findById(matchId);
    if (!updated) {
      throw new Error("매치 기록 저장에 실패했습니다.");
    }
    return updated;
  }

  async delete(matchId: string): Promise<void> {
    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      await transaction.execute({
        sql: `DELETE FROM match_scores WHERE match_id = $1`,
        args: [matchId],
      });
      await transaction.execute({
        sql: `DELETE FROM match_participants WHERE match_id = $1`,
        args: [matchId],
      });
      const deleted = await transaction.execute({
        sql: `DELETE FROM matches WHERE id = $1`,
        args: [matchId],
      });
      if (!deleted.rowsAffected) {
        throw new Error("MATCH_NOT_FOUND");
      }

      await transaction.commit();
      committed = true;
    } catch (error) {
      transaction.close();
      throw error;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!isEntityId(sessionId, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    try {
      const session = await transaction.execute({
        sql: "SELECT id FROM match_sessions WHERE id = $1",
        args: [sessionId],
      });
      if (!session.rows.length) {
        await transaction.commit();
        committed = true;
        return false;
      }

      const matchCount = await transaction.execute({
        sql: "SELECT COUNT(*) AS count FROM matches WHERE session_id = $1",
        args: [sessionId],
      });
      if (Number(matchCount.rows[0]?.count ?? 0) > 0) {
        throw new SessionHasMatchesError();
      }

      await transaction.execute({
        sql: "DELETE FROM match_session_participants WHERE session_id = $1",
        args: [sessionId],
      });
      await transaction.execute({
        sql: "DELETE FROM match_sessions WHERE id = $1",
        args: [sessionId],
      });
      await transaction.commit();
      committed = true;
      return true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }

  async updateMetadata(
    id: string,
    data: UpdateMatchMetadataInput,
  ): Promise<Match | undefined> {
    const updatePayload: Partial<typeof matches.$inferInsert> = {
      updatedAt: new Date(),
    };

    if ("name" in data) {
      updatePayload.name = data.name?.trim() || null;
    }

    if ("location" in data) {
      const location =
        typeof data.location === "string" ? data.location.trim() : "";
      if (!location) {
        throw new Error("매치 장소를 입력해주세요.");
      }
      updatePayload.location = location;
    }

    if ("courtName" in data) {
      updatePayload.courtName = data.courtName?.trim() || null;
    }

    if ("matchStartsAt" in data) {
      const matchStartsAt = toDateOrNull(data.matchStartsAt);
      if (!matchStartsAt || Number.isNaN(matchStartsAt.getTime())) {
        throw new Error("유효한 경기 예정 일시가 필요합니다.");
      }
      updatePayload.matchStartsAt = matchStartsAt;
    }

    if ("sessionId" in data) {
      if (data.sessionId === null) {
        updatePayload.sessionId = null;
        updatePayload.sessionName = null;
        updatePayload.sessionDate = null;
      } else {
        if (!isEntityId(data.sessionId, "session")) {
          throw new Error("유효한 세션 ID가 필요합니다.");
        }
        const session = await this.db
          .select()
          .from(matchSessions)
          .where(eq(matchSessions.id, data.sessionId))
          .limit(1)
          .then(firstRow);
        if (!session) {
          throw new Error("세션을 찾을 수 없습니다.");
        }
        updatePayload.sessionId = session.id;
        updatePayload.sessionName = session.name;
        updatePayload.sessionDate = toDate(session.date);
      }
    }

    await this.db.update(matches).set(updatePayload).where(eq(matches.id, id));
    return await this.findById(id);
  }

  private async hydrateMatch(match: StoredMatch): Promise<Match> {
    const [participants, scores, session] = await Promise.all([
      this.db
        .select()
        .from(matchParticipants)
        .where(eq(matchParticipants.matchId, match.id))
        .orderBy(matchParticipants.id),
      this.db
        .select()
        .from(matchScores)
        .where(eq(matchScores.matchId, match.id))
        .orderBy(matchScores.id),
      match.sessionId
        ? this.db
            .select()
            .from(matchSessions)
            .where(eq(matchSessions.id, match.sessionId))
            .limit(1)
            .then(firstRow)
        : Promise.resolve(undefined),
    ]);
    const playerRecords = await Promise.all(
      participants.map((participant: StoredMatchParticipant) =>
        this.db
          .select()
          .from(players)
          .where(eq(players.id, participant.playerId))
          .limit(1)
          .then(firstRow),
      ),
    );
    const playerById = new Map<string, Player>(
      playerRecords
        .filter(Boolean)
        .map((player: StoredPlayer) => [player.id, toPublicPlayer(player)]),
    );
    const teams: [Team, Team] = [0, 1].map((teamIndex) => ({
      id: `${match.id}-team-${teamIndex}`,
      name: `Team ${teamIndex === 0 ? "A" : "B"}`,
      players: participants
        .filter(
          (participant: StoredMatchParticipant) =>
            participant.teamIndex === teamIndex,
        )
        .map((participant: StoredMatchParticipant) => {
          const player = playerById.get(participant.playerId);
          const duprRating = parseParticipantDuprSnapshot(
            participant.duprRatingJson,
          );

          return player && duprRating !== undefined
            ? { ...player, duprRating }
            : player;
        })
        .filter((player: Player | undefined): player is Player =>
          Boolean(player),
        ),
    })) as [Team, Team];

    const hydratedMatch = {
      id: match.id,
      type: match.type as MatchType,
      mode: (match.mode as MatchMode | null) ?? DEFAULT_MATCH_MODE,
      source: (match.source as MatchSource | null) ?? "player_created",
      creatorPlayerId: match.creatorPlayerId,
      name: match.name?.trim() || undefined,
      sessionName: match.sessionName?.trim() || undefined,
      session: session
        ? {
            id: session.id,
            name: session.name,
            date: toDate(session.date),
            location: session.location,
          }
        : undefined,
      status: match.status as Match["status"],
      teams,
      scores: scores
        .map(toMatchScore)
        .slice(
          0,
          getMaxScoreCountForMatchMode(
            (match.mode as MatchMode | null) ?? DEFAULT_MATCH_MODE,
          ),
        ),
      resultSubmittedByPlayerId: match.resultSubmittedByPlayerId ?? null,
      resultSubmittedAt: toDateOrNull(match.resultSubmittedAt),
      location: match.location,
      courtName: match.courtName?.trim() || undefined,
      matchStartsAt: toDate(match.matchStartsAt),
      createdAt: toDate(match.createdAt),
      completedAt: toDateOrNull(match.completedAt),
      updatedAt: toDate(match.updatedAt),
    } as Match & { sessionName?: string };

    return hydratedMatch;
  }

  private async loadAllMatches(): Promise<Match[]> {
    const storedMatches = await this.db
      .select()
      .from(matches)
      .orderBy(
        desc(matches.matchStartsAt),
        desc(matches.createdAt),
        desc(matches.id),
      );
    return await Promise.all(
      storedMatches.map((match: StoredMatch) => this.hydrateMatch(match)),
    );
  }

  private getSessionKey(match: Match): string | null {
    return match.session?.id ?? null;
  }

  private isPlayerInMatch(match: Match, playerId: string) {
    return match.teams.some((team) =>
      team.players.some((player) => player.id === playerId),
    );
  }

  private buildSessionSummaries(matchesToGroup: Match[]) {
    const summaries = new Map<
      string,
      Omit<MatchSessionSummary, "status"> & {
        participantIds: Set<string>;
        matchStatuses: MatchStatus[];
      }
    >();

    for (const match of matchesToGroup) {
      const key = this.getSessionKey(match);
      if (!key || !match.session?.name) {
        continue;
      }

      const existing = summaries.get(key);
      const summary =
        existing ?? {
          id: match.session.id,
          name: match.session.name.trim(),
          date: match.session.date,
          location: match.session.location,
          matchCount: 0,
          participants: [],
          latestCreatedAt: match.createdAt,
          participantIds: new Set<string>(),
          matchStatuses: [],
        };

      summary.matchCount += 1;
      summary.matchStatuses.push(match.status);
      if (match.createdAt > summary.latestCreatedAt) {
        summary.latestCreatedAt = match.createdAt;
      }
      for (const team of match.teams) {
        for (const player of team.players) {
          if (summary.participantIds.has(player.id)) {
            continue;
          }
          summary.participantIds.add(player.id);
          summary.participants.push({
            id: player.id,
            username: player.username,
            avatarUrl: player.avatarUrl,
          });
        }
      }
      summary.participants.sort(
        (left, right) =>
          Number(Boolean(right.avatarUrl)) - Number(Boolean(left.avatarUrl)),
      );
      summaries.set(key, summary);
    }

    return new Map(
      [...summaries.entries()].map(([key, summary]) => {
        const {
          participantIds: _participantIds,
          matchStatuses,
          ...session
        } = summary;
        return [
          key,
          { ...session, status: getMatchSessionStatus(matchStatuses) },
        ];
      }),
    );
  }

  private async createParticipants(matchId: string, teams: [Team, Team]) {
    for (const [teamIndex, team] of teams.entries()) {
      for (const player of team.players) {
        await this.db.insert(matchParticipants).values({
          id: `${matchId}-team-${teamIndex}-${player.id}`,
          matchId,
          teamIndex,
          playerId: player.id,
          duprRatingJson: JSON.stringify(player.duprRating ?? null),
        });
      }
    }
  }

  private async ensureSession(session: Session): Promise<string> {
    if (!isEntityId(session.id, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }
    const name = session.name?.trim();
    const location = session.location?.trim();
    const date = toDate(session.date);
    if (!name || !location || Number.isNaN(date.getTime())) {
      throw new Error("유효한 세션 정보가 필요합니다.");
    }

    const existingById = await this.db
      .select()
      .from(matchSessions)
      .where(eq(matchSessions.id, session.id))
      .limit(1)
      .then(firstRow);
    if (existingById) {
      return existingById.id;
    }

    let candidateId = session.id;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const now = new Date();
        await this.db.insert(matchSessions).values({
          id: candidateId,
          name,
          date,
          location,
          createdAt: now,
          updatedAt: now,
        });
        return candidateId;
      } catch (error) {
        const concurrentSession = await this.db
          .select()
          .from(matchSessions)
          .where(eq(matchSessions.id, candidateId))
          .limit(1)
          .then(firstRow);
        if (concurrentSession) return concurrentSession.id;
        if (attempt === 7) throw error;
        candidateId = generateEntityId("session");
      }
    }

    throw new Error("세션 ID 생성에 실패했습니다.");
  }

  private async replaceScores(matchId: string, scores: MatchScore[]) {
    await this.db.delete(matchScores).where(eq(matchScores.matchId, matchId));
    const scoreColumns = await this.getMatchScoreColumns();

    for (const [index, score] of scores.entries()) {
      await this.insertScore({
        id: `${matchId}-score-${index + 1}`,
        matchId,
        score,
        columns: scoreColumns,
      });
    }
  }

  private async replaceScoresWithExecutor(
    matchId: string,
    scores: MatchScore[],
    columns: Set<string>,
    executor: { execute: (statement: any) => Promise<any> },
  ) {
    await executor.execute({
      sql: `DELETE FROM match_scores WHERE match_id = $1`,
      args: [matchId],
    });

    for (const [index, score] of scores.entries()) {
      await this.insertScore({
        id: `${matchId}-score-${index + 1}`,
        matchId,
        score,
        columns,
        executor,
      });
    }
  }

  private async getMatchScoreColumns(): Promise<Set<string>> {
    return new Set(["score_a", "score_b"]);
  }

  private async insertScore({
    id,
    matchId,
    score,
    columns,
    executor = this.client,
  }: {
    id: string;
    matchId: string;
    score: MatchScore;
    columns: Set<string>;
    executor?: { execute: (statement: any) => Promise<any> };
  }) {
    const insertColumns = ["id", "match_id"];
    const args: Array<string | number> = [id, matchId];

    const addColumn = (column: string, value: number) => {
      if (!columns.has(column)) {
        return;
      }
      insertColumns.push(column);
      args.push(value);
    };

    addColumn("score_a", score.scoreA);
    addColumn("score_b", score.scoreB);
    await executor.execute({
      sql: `INSERT INTO match_scores (${insertColumns.join(", ")}) VALUES (${placeholders(insertColumns.length)})`,
      args,
    });
  }
}

import type {
  MatchMode,
  Match,
  MatchFeedItem,
  MatchResultApproval,
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
  getAutoApprovalDueAt,
  getMatchSessionStatus,
  getMaxScoreCountForMatchMode,
  MATCH_RESULT_MAX_SCORE_COUNT,
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
  matchResultApprovals,
  matches,
  matchScores,
  matchSessionParticipants,
  matchSessions,
  players,
} from "../db/schema";
import { generateEntityId, isEntityId } from "@pkpkdupr/shared/entityId";

type StoredMatch = typeof matches.$inferSelect;
type StoredMatchParticipant = typeof matchParticipants.$inferSelect;
type StoredMatchScore = typeof matchScores.$inferSelect;
type StoredMatchApproval = typeof matchResultApprovals.$inferSelect;
type StoredMatchSession = typeof matchSessions.$inferSelect;
type StoredPlayer = typeof players.$inferSelect;

export const COMPLETED_MATCH_RESULT_EDIT_ERROR_MESSAGE =
  "이미 완료된 매치 결과는 수정할 수 없습니다.";
export const COMPLETED_MATCH_APPROVAL_CANCEL_ERROR_MESSAGE =
  "이미 완료된 매치 합의는 취소할 수 없습니다.";

export class CompletedMatchResultEditError extends Error {
  constructor() {
    super(COMPLETED_MATCH_RESULT_EDIT_ERROR_MESSAGE);
    this.name = "CompletedMatchResultEditError";
  }
}

export class CompletedMatchApprovalCancelError extends Error {
  constructor() {
    super(COMPLETED_MATCH_APPROVAL_CANCEL_ERROR_MESSAGE);
    this.name = "CompletedMatchApprovalCancelError";
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
  approvals?: MatchResultApproval[];
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

// Drizzle's `timestamp` integer mode persists Unix seconds. Raw libSQL queries
// bypass that conversion, so match mutation timestamps must be converted here.
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

const toApproval = (approval: StoredMatchApproval): MatchResultApproval => ({
  playerId: approval.playerId,
  approvedAt: toDate(approval.approvedAt),
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

const areScoresEqual = (
  currentScores: MatchScore[] = [],
  nextScores: MatchScore[],
) =>
  currentScores.length === nextScores.length &&
  currentScores.every(
    (currentScore, index) =>
      currentScore.scoreA === nextScores[index]?.scoreA &&
      currentScore.scoreB === nextScores[index]?.scoreB,
  );

/**
 * MatchRepository - DB 서버의 경기 저장소.
 *
 * matches, match_scores, match_participants, match_result_approvals를 조립해
 * shared Match 계약 형태로 반환합니다.
 */
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
      .get();

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
        .all(),
      this.db
        .select()
        .from(matches)
        .where(eq(matches.sessionId, stored.id))
        .all(),
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
      createdAt: toDate(stored.createdAt),
      updatedAt: toDate(stored.updatedAt),
    };
  }

  async findSessions(): Promise<ManagedMatchSession[]> {
    const storedSessions = await this.db
      .select()
      .from(matchSessions)
      .orderBy(desc(matchSessions.date))
      .all();
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
      .get();
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
          .get(),
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
        sql: "DELETE FROM match_session_participants WHERE session_id = ?",
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
            VALUES (?, ?, ?, ?)
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
        sql: "UPDATE match_sessions SET updated_at = ? WHERE id = ?",
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

  async findById(id: string): Promise<Match | undefined> {
    const match = await this.db
      .select()
      .from(matches)
      .where(eq(matches.id, id))
      .get();

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
          )
          .all()).map((row: { match: StoredMatch }) => row.match)
      : await this.db
          .select()
          .from(matches)
          .orderBy(
            desc(matches.matchStartsAt),
            desc(matches.createdAt),
            desc(matches.id),
          )
          .all();
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

    const typePlaceholders = matchTypes.map(() => "?").join(", ");
    const result = await this.client.execute({
      sql: `
        SELECT MAX(matches.completed_at) AS completed_at
        FROM match_participants
        INNER JOIN matches ON matches.id = match_participants.match_id
        WHERE match_participants.player_id = ?
          AND matches.status = 'completed'
          AND matches.completed_at IS NOT NULL
          AND matches.completed_at < ?
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
      .groupBy(matchParticipants.playerId)
      .all();

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
   * the raw libSQL client so an already-corrupted millisecond value can be
   * inspected before Drizzle hydrates it into a far-future Date.
   */
  async getTimestampUnitAudit(): Promise<TimestampUnitAudit> {
    const legacyMatchStartsAtThreshold = 100_000_000_000;
    const countResult = await this.client.execute({
      sql: `
        SELECT COUNT(*) AS legacy_match_starts_at_count
        FROM matches
        WHERE match_starts_at >= ?
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
          AND matches.match_starts_at >= ?
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
      .all();
    const registeredPlayerRecords = await this.db.select().from(players).all();
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
    await this.createApprovals(data.id, data.approvals ?? []);

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
          sql: "SELECT id FROM match_sessions WHERE id = ?",
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
                id, name, date, location, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?)
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                VALUES (?, ?, ?, ?, ?)
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
          SET dupr_rating_json = ?
          WHERE match_id = ?
            AND player_id = ?
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

  async submitResult(
    matchId: string,
    submittedByPlayerId: string,
    scores: MatchScore[],
    approvalId: string,
    submittedAt: Date = new Date(),
  ): Promise<Match> {
    const existing = await this.findById(matchId);
    if (!existing) {
      throw new Error("매치를 찾을 수 없습니다.");
    }

    if (existing.status === "completed") {
      throw new CompletedMatchResultEditError();
    }

    if (
      existing.status !== "created" &&
      existing.status !== "pending-approval"
    ) {
      throw new Error("결과를 입력할 수 없는 매치 상태입니다.");
    }

    if (existing.creatorPlayerId !== submittedByPlayerId) {
      throw new Error("매치 생성자만 결과를 입력할 수 있습니다.");
    }

    if (scores.length > MATCH_RESULT_MAX_SCORE_COUNT) {
      throw new Error(
        `스코어는 최대 ${MATCH_RESULT_MAX_SCORE_COUNT}개까지 입력할 수 있습니다.`,
      );
    }

    validateMatchScoresForMode(existing.mode, scores);

    const scoreColumns = await this.getMatchScoreColumns();
    const shouldResetApprovals =
      existing.status === "created" || !areScoresEqual(existing.scores, scores);
    const autoApprovalDueAt = shouldResetApprovals || !existing.autoApprovalDueAt
      ? getAutoApprovalDueAt(existing.matchStartsAt, submittedAt)
      : existing.autoApprovalDueAt;
    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      const updateResult = await transaction.execute({
        sql: `
          UPDATE matches
          SET
            status = ?,
            result_submitted_by_player_id = ?,
            result_submitted_at = ?,
            completed_at = NULL,
            auto_approval_due_at = ?,
            auto_approved_at = NULL,
            auto_approval_rating_applied_at = NULL,
            updated_at = ?
          WHERE id = ?
            AND status IN ('created', 'pending-approval')
        `,
        args: [
          "pending-approval",
          submittedByPlayerId,
          toUnixTimestampSeconds(submittedAt),
          toUnixTimestampSeconds(autoApprovalDueAt),
          toUnixTimestampSeconds(submittedAt),
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
      if (shouldResetApprovals) {
        await transaction.execute({
          sql: `DELETE FROM match_result_approvals WHERE match_id = ?`,
          args: [matchId],
        });
      }
      await transaction.execute({
        sql: `
          INSERT IGNORE INTO match_result_approvals (id, match_id, player_id, approved_at)
          VALUES (?, ?, ?, ?)
        `,
        args: [
          approvalId,
          matchId,
          submittedByPlayerId,
          toUnixTimestampSeconds(submittedAt),
        ],
      });
      if (!shouldResetApprovals) {
        await this.completeMatchIfFullyApproved(
          matchId,
          submittedAt,
          transaction,
        );
      }

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

    if (
      existing.status !== "created" &&
      existing.status !== "pending-approval"
    ) {
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
            status = ?,
            result_submitted_by_player_id = ?,
            result_submitted_at = ?,
            completed_at = ?,
            auto_approval_due_at = NULL,
            auto_approved_at = NULL,
            auto_approval_rating_applied_at = NULL,
            updated_at = ?
          WHERE id = ?
            AND status IN ('created', 'pending-approval')
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
      await transaction.execute({
        sql: `DELETE FROM match_result_approvals WHERE match_id = ?`,
        args: [matchId],
      });

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

  async delete(matchId: string): Promise<void> {
    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      await transaction.execute({
        sql: `DELETE FROM match_scores WHERE match_id = ?`,
        args: [matchId],
      });
      await transaction.execute({
        sql: `DELETE FROM match_participants WHERE match_id = ?`,
        args: [matchId],
      });
      await transaction.execute({
        sql: `DELETE FROM match_result_approvals WHERE match_id = ?`,
        args: [matchId],
      });
      const deleted = await transaction.execute({
        sql: `DELETE FROM matches WHERE id = ?`,
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
        sql: "SELECT id FROM match_sessions WHERE id = ?",
        args: [sessionId],
      });
      if (!session.rows.length) {
        await transaction.commit();
        committed = true;
        return false;
      }

      const matchCount = await transaction.execute({
        sql: "SELECT COUNT(*) AS count FROM matches WHERE session_id = ?",
        args: [sessionId],
      });
      if (Number(matchCount.rows[0]?.count ?? 0) > 0) {
        throw new SessionHasMatchesError();
      }

      await transaction.execute({
        sql: "DELETE FROM match_session_participants WHERE session_id = ?",
        args: [sessionId],
      });
      await transaction.execute({
        sql: "DELETE FROM match_sessions WHERE id = ?",
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

  async approveResult(
    matchId: string,
    playerId: string,
    approvalId: string,
    approvedAt: Date = new Date(),
  ): Promise<Match> {
    const existing = await this.findById(matchId);
    if (!existing) {
      throw new Error("매치를 찾을 수 없습니다.");
    }

    if (existing.status !== "pending-approval") {
      throw new Error("승인할 수 없는 매치 상태입니다.");
    }

    const participantIds = existing.teams.flatMap((team) =>
      team.players.map((player) => player.id),
    );
    if (!participantIds.includes(playerId)) {
      throw new Error("매치 참여자만 결과를 승인할 수 있습니다.");
    }

    if (existing.approvals.some((approval) => approval.playerId === playerId)) {
      throw new Error("이미 승인한 매치 결과입니다.");
    }

    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      await transaction.execute({
        sql: `
          INSERT INTO match_result_approvals (id, match_id, player_id, approved_at)
          VALUES (?, ?, ?, ?)
        `,
        args: [
          approvalId,
          matchId,
          playerId,
          toUnixTimestampSeconds(approvedAt),
        ],
      });

      await this.completeMatchIfFullyApproved(matchId, approvedAt, transaction);

      await transaction.commit();
      committed = true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }

    const completed = await this.findById(matchId);
    if (!completed) {
      throw new Error("매치 완료 처리에 실패했습니다.");
    }
    return completed;
  }

  async cancelApproval(matchId: string, playerId: string): Promise<Match> {
    const existing = await this.findById(matchId);
    if (!existing) {
      throw new Error("매치를 찾을 수 없습니다.");
    }

    if (existing.status === "completed") {
      throw new CompletedMatchApprovalCancelError();
    }

    if (existing.status !== "pending-approval") {
      throw new Error("합의를 취소할 수 없는 매치 상태입니다.");
    }

    const participantIds = existing.teams.flatMap((team) =>
      team.players.map((player) => player.id),
    );
    if (!participantIds.includes(playerId)) {
      throw new Error("매치 참여자만 합의를 취소할 수 있습니다.");
    }

    if (
      !existing.approvals.some((approval) => approval.playerId === playerId)
    ) {
      throw new Error("취소할 합의 내역이 없습니다.");
    }

    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      const deleteResult = await transaction.execute({
        sql: `
          DELETE FROM match_result_approvals
          WHERE match_id = ?
            AND player_id = ?
            AND EXISTS (
              SELECT 1
              FROM matches
              WHERE matches.id = match_result_approvals.match_id
                AND matches.status = 'pending-approval'
            )
        `,
        args: [matchId, playerId],
      });

      if (!deleteResult.rowsAffected) {
        throw new Error("APPROVAL_CANCEL_STATE_CONFLICT");
      }

      await transaction.commit();
      committed = true;
    } catch (error) {
      transaction.close();
      const current = await this.findById(matchId);
      if (
        (error as Error).message === "APPROVAL_CANCEL_STATE_CONFLICT" &&
        current?.status === "completed"
      ) {
        throw new CompletedMatchApprovalCancelError();
      }
      throw error;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }

    const updated = await this.findById(matchId);
    if (!updated) {
      throw new Error("합의 취소 처리에 실패했습니다.");
    }
    return updated;
  }

  async rejectResult(matchId: string, playerId: string): Promise<Match> {
    const existing = await this.findById(matchId);
    if (!existing) {
      throw new Error("매치를 찾을 수 없습니다.");
    }

    if (existing.status !== "pending-approval") {
      throw new Error("거부할 수 없는 매치 상태입니다.");
    }

    const participantIds = existing.teams.flatMap((team) =>
      team.players.map((player) => player.id),
    );
    if (!participantIds.includes(playerId)) {
      throw new Error("매치 참여자만 결과를 거부할 수 있습니다.");
    }

    const rejectedAt = new Date();
    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      const updateResult = await transaction.execute({
        sql: `
          UPDATE matches
          SET
            status = ?,
            result_submitted_by_player_id = NULL,
            result_submitted_at = NULL,
            completed_at = NULL,
            auto_approval_due_at = NULL,
            auto_approved_at = NULL,
            auto_approval_rating_applied_at = NULL,
            updated_at = ?
          WHERE id = ?
            AND status = 'pending-approval'
        `,
        args: ["created", toUnixTimestampSeconds(rejectedAt), matchId],
      });

      if (!updateResult.rowsAffected) {
        throw new Error("RESULT_REJECT_STATE_CONFLICT");
      }

      await transaction.execute({
        sql: `DELETE FROM match_scores WHERE match_id = ?`,
        args: [matchId],
      });
      await transaction.execute({
        sql: `DELETE FROM match_result_approvals WHERE match_id = ?`,
        args: [matchId],
      });

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

    const updated = await this.findById(matchId);
    if (!updated) {
      throw new Error("결과 거부 처리에 실패했습니다.");
    }
    return updated;
  }

  async completeExpiredAutoApprovals(now: Date = new Date()): Promise<Match[]> {
    const nowSeconds = toUnixTimestampSeconds(now);
    const transaction = await this.client.transaction("write");
    let committed = false;
    const completedIds: string[] = [];

    try {
      const candidates = await transaction.execute({
        sql: `
          SELECT id
          FROM matches
          WHERE status = 'pending-approval'
            AND auto_approval_due_at IS NOT NULL
            AND auto_approval_due_at <= ?
        `,
        args: [nowSeconds],
      });

      for (const candidate of candidates.rows) {
        const matchId = String(candidate.id);
        const updateResult = await transaction.execute({
          sql: `
            UPDATE matches
            SET
              status = 'completed',
              completed_at = ?,
              auto_approval_due_at = NULL,
              auto_approved_at = ?,
              auto_approval_rating_applied_at = NULL,
              updated_at = ?
            WHERE id = ?
              AND status = 'pending-approval'
              AND auto_approval_due_at IS NOT NULL
              AND auto_approval_due_at <= ?
          `,
          args: [
            nowSeconds,
            nowSeconds,
            nowSeconds,
            matchId,
            nowSeconds,
          ],
        });

        if (updateResult.rowsAffected) {
          completedIds.push(matchId);
        }
      }

      await transaction.commit();
      committed = true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }

    return await Promise.all(
      completedIds.map(async (matchId) => {
        const match = await this.findById(matchId);
        if (!match) {
          throw new Error("자동 합의 처리한 매치를 찾을 수 없습니다.");
        }
        return match;
      }),
    );
  }

  async findAutoApprovedMatchesAwaitingRating(): Promise<Match[]> {
    const result = await this.client.execute(`
      SELECT id
      FROM matches
      WHERE status = 'completed'
        AND auto_approved_at IS NOT NULL
        AND auto_approval_rating_applied_at IS NULL
    `);

    return await Promise.all(
      result.rows.map(async (row: { id: unknown }) => {
        const match = await this.findById(String(row.id));
        if (!match) {
          throw new Error("자동 합의 매치를 찾을 수 없습니다.");
        }
        return match;
      }),
    );
  }

  async markAutoApprovalRatingApplied(
    matchId: string,
    appliedAt: Date = new Date(),
  ): Promise<void> {
    await this.client.execute({
      sql: `
        UPDATE matches
        SET auto_approval_rating_applied_at = ?
        WHERE id = ?
          AND status = 'completed'
          AND auto_approved_at IS NOT NULL
      `,
      args: [toUnixTimestampSeconds(appliedAt), matchId],
    });
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
          .get();
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
    const [participants, scores, approvals, session] = await Promise.all([
      this.db
        .select()
        .from(matchParticipants)
        .where(eq(matchParticipants.matchId, match.id))
        .all(),
      this.db
        .select()
        .from(matchScores)
        .where(eq(matchScores.matchId, match.id))
        .all(),
      this.db
        .select()
        .from(matchResultApprovals)
        .where(eq(matchResultApprovals.matchId, match.id))
        .all(),
      match.sessionId
        ? this.db
            .select()
            .from(matchSessions)
            .where(eq(matchSessions.id, match.sessionId))
            .get()
        : Promise.resolve(undefined),
    ]);
    const playerRecords = await Promise.all(
      participants.map((participant: StoredMatchParticipant) =>
        this.db
          .select()
          .from(players)
          .where(eq(players.id, participant.playerId))
          .get(),
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
      autoApprovalDueAt:
        match.status === "pending-approval"
          ? toDateOrNull(match.autoApprovalDueAt)
          : null,
      approvals: approvals.map(toApproval),
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
      )
      .all();
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
      .get();
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
          .get();
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
      sql: `DELETE FROM match_scores WHERE match_id = ?`,
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

  private async completeMatchIfFullyApproved(
    matchId: string,
    completedAt: Date,
    executor: { execute: (statement: any) => Promise<any> },
  ) {
    await executor.execute({
      sql: `
        UPDATE matches
        SET
          status = 'completed',
          completed_at = ?,
          auto_approval_due_at = NULL,
          updated_at = ?
        WHERE id = ?
          AND status = 'pending-approval'
          AND NOT EXISTS (
            SELECT 1
            FROM match_participants
            WHERE match_participants.match_id = matches.id
              AND NOT EXISTS (
                SELECT 1
                FROM match_result_approvals
                WHERE match_result_approvals.match_id = match_participants.match_id
                  AND match_result_approvals.player_id = match_participants.player_id
              )
          )
      `,
      args: [
        toUnixTimestampSeconds(completedAt),
        toUnixTimestampSeconds(completedAt),
        matchId,
      ],
    });
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
      sql: `INSERT INTO match_scores (${insertColumns.join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`,
      args,
    });
  }

  private async createApprovals(
    matchId: string,
    approvals: MatchResultApproval[],
  ) {
    for (const approval of approvals) {
      await this.insertApprovalIfMissing(
        `${matchId}-approval-${approval.playerId}`,
        matchId,
        approval.playerId,
        approval.approvedAt,
      );
    }
  }

  private async insertApprovalIfMissing(
    id: string,
    matchId: string,
    playerId: string,
    approvedAt: Date,
  ) {
    const existing = await this.db
      .select()
      .from(matchResultApprovals)
      .where(
        and(
          eq(matchResultApprovals.matchId, matchId),
          eq(matchResultApprovals.playerId, playerId),
        ),
      )
      .get();

    if (existing) {
      return;
    }

    await this.db.insert(matchResultApprovals).values({
      id,
      matchId,
      playerId,
      approvedAt,
    });
  }
}

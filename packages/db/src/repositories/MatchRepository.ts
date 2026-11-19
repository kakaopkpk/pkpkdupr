import type {
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
  getMatchEditFields,
  getMatchSessionStatus,
  validateMatchScores,
} from "@pkpkdupr/shared/match";
import {
  normalizeNullablePlayerDupr,
  type Player,
  type PublicPlayerDupr,
} from "@pkpkdupr/shared/player";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  max,
  ne,
} from "drizzle-orm";
import {
  matchParticipants,
  matches,
  matchScores,
  matchSessionParticipants,
  matchSessionPlacements,
  matchSessions,
  players,
  regularSessionSkips,
} from "../db/schema";
import { generateEntityId, isEntityId } from "@pkpkdupr/shared/entityId";
import {
  IN_PROGRESS_MATCH_TIMEOUT_MS,
  REGULAR_SESSION_LOCATION,
  getRegularSessionName,
  REGULAR_SESSION_END_TIME,
  REGULAR_SESSION_START_HOUR,
  REGULAR_SESSION_START_TIME,
  getEmptySessionExpiryCutoff,
  isMatchSessionKind,
  kstDateKeyToDate,
  toKstDateKey,
  type MatchSessionKind,
  type RegularSessionSkipReason,
} from "@pkpkdupr/shared/session";
import { firstRow, placeholders, type RawQueryResult } from "../db/client";
import { buildMatchDeletionLogInsert } from "./MatchDeletionLogRepository";
import { buildMatchEditLogInsert } from "./MatchEditLogRepository";
import {
  PlayerRepository,
  type CreateStoredPlayerInput,
  type StoredPlayerRecord,
} from "./PlayerRepository";

type StoredMatch = typeof matches.$inferSelect;
type StoredMatchParticipant = typeof matchParticipants.$inferSelect;
type StoredMatchScore = typeof matchScores.$inferSelect;
type StoredMatchSession = typeof matchSessions.$inferSelect;
type StoredPlayer = typeof players.$inferSelect;

export class MatchRecordUpdateConflictError extends Error {
  constructor() {
    super("기록을 수정할 수 없는 매치 상태입니다.");
    this.name = "MatchRecordUpdateConflictError";
  }
}

/** 경기가 없거나 이미 지워졌다 */
export class MatchNotFoundError extends Error {
  constructor() {
    super("매치를 찾을 수 없습니다.");
    this.name = "MatchNotFoundError";
  }
}

export const MATCH_STALE_UPDATE_ERROR_MESSAGE = "다른 회원이 먼저 고쳤어요";

/** 요청이 기준으로 삼은 updatedAt(expectedUpdatedAt)과 저장된 updated_at이 다르다 */
export class MatchStaleUpdateError extends Error {
  constructor() {
    super(MATCH_STALE_UPDATE_ERROR_MESSAGE);
    this.name = "MatchStaleUpdateError";
  }
}

export class SessionHasMatchesError extends Error {
  constructor() {
    super("연결된 경기가 있는 세션은 삭제할 수 없습니다.");
    this.name = "SessionHasMatchesError";
  }
}

export class RegularSessionSkipExistsError extends Error {
  constructor() {
    super("이미 쉬는 날로 정해진 날짜입니다.");
    this.name = "RegularSessionSkipExistsError";
  }
}

/** 정기 세션으로 만들거나 바꿀 수 없는 날짜(이미 그날 정기 세션이 있거나 쉬는 날) */
export class RegularSessionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegularSessionConflictError";
  }
}

/** 대회 최종 순위 한 칸의 저장 값. players는 관리자가 고른 순서다 */
export interface StoredSessionPlacement {
  sessionId: string;
  place: number;
  players: { id: string; username: string; avatarUrl?: string }[];
}

/** 대회 승패 계산에 쓰는 라운드 있는 완료 경기 */
export interface StoredRoundMatch {
  sessionId: string;
  status: MatchStatus;
  round: number;
  teams: [{ players: { id: string }[] }, { players: { id: string }[] }];
  scores: MatchScore[];
}

/** 정기가 아닌 세션의 종류 */
export type NonRegularSessionKind = Exclude<MatchSessionKind, "regular">;

/** 세션 수정 값. 키가 없는 필드는 그대로 둔다 */
export interface UpdateSessionInput {
  name?: string;
  location?: string;
  date?: Date;
  startTime?: string | null;
  endTime?: string | null;
}

/** 랭킹·세션 리포트 계산에 필요한 완료 경기 요약 */
export interface CompletedMatchOutcome {
  id: string;
  type: MatchType;
  sessionId: string | null;
  matchStartsAt: Date;
  completedAt: Date;
  /** 팀별 선수 id. [0]=팀 A, [1]=팀 B */
  teamPlayerIds: [string[], string[]];
  scores: MatchScore[];
  /** 게스트가 낀 경기. 랭킹 경기 수·업적·세션 지배자에서 뺀다 */
  ratingExcluded: boolean;
  /** 정기 세션 경기인지(개근상 업적). 테스트 데이터처럼 없으면 정기 세션이 아니다 */
  regularSession?: boolean;
}

export interface SessionWithParticipantIds {
  id: string;
  name: string;
  date: Date;
  location: string;
  kind: ManagedMatchSession["kind"];
  /** 시작·종료 시각("HH:MM", KST). 정기 세션은 18:00~22:00, 시각 없는 회원 세션은 null. 종료 ≤ 시작이면 다음 날 종료 */
  startTime: string | null;
  endTime: string | null;
  participantIds: string[];
}

export interface CreateMatchInput {
  id: string;
  type: MatchType;
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
  /** 완료 경기의 평점 미반영 여부. 생략하면 false */
  ratingExcluded?: boolean;
  /** 대회 대진 라운드(1부터). status가 scheduled면 필수, 생략하면 null */
  round?: number | null;
}

/** 경기 기록 수정 입력. 코트·생성자는 바꾸지 않고, 세션·시작 시각은 주었을 때만 바꾼다. */
export interface UpdateRecordedMatchInput {
  /** 문자열이면 그 세션으로 옮기고(세션 이름·날짜 비정규화 컬럼도 맞춤) null이면 세션에서 뺀다. 생략하면 그대로 */
  sessionId?: string | null;
  /** 주면 시작 시각을 바꾸고, 이미 completed인 경기면 completed_at도 같은 만큼 옮긴다 */
  matchStartsAt?: Date;
  type: MatchType;
  name?: string;
  location: string;
  teams: [Team, Team];
  scores: MatchScore[];
  resultSubmittedByPlayerId: string;
  resultSubmittedAt: Date;
  /** 저장 후 경기의 평점 미반영 여부 */
  ratingExcluded: boolean;
  /** 주면 저장된 updated_at(초 단위)과 같을 때만 고치고, 다르면 MatchStaleUpdateError */
  expectedUpdatedAt?: Date;
  /**
   * 주면 이미 completed였던 경기를 고칠 때 같은 트랜잭션에서 match_edit_logs를 남긴다.
   * 수정한 회원·시각은 resultSubmittedByPlayerId·resultSubmittedAt이다. 바뀐 내용이 없으면 남기지 않는다.
   */
  editLog?: { id: string; editedByAdmin: boolean };
}

export interface DeleteRecordedMatchInput {
  /** 감사 로그 id */
  logId: string;
  deletedByPlayerId: string;
  deletedByAdmin: boolean;
  deletedAt: Date;
  /** 주면 저장된 updated_at(초 단위)과 같을 때만 지우고, 다르면 MatchStaleUpdateError */
  expectedUpdatedAt?: Date;
}

export interface DeletedMatchResult {
  /** 실제로 지운 행의 상태(DELETE … RETURNING). completed였으면 평점에 반영돼 있던 경기다 */
  status: MatchStatus;
  /** 지운 시점의 경기 전체(감사 로그 스냅샷과 같다) */
  match: Match;
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

export interface ExpiredCleanupResult {
  deletedMatchCount: number;
  /** 시작 2시간이 지나도록 점수가 없어 예정(scheduled)으로 되돌린 대진 경기 수 */
  revertedMatchCount: number;
  deletedSessionCount: number;
  /** 이번 정리로 지운 세션 id */
  deletedSessionIds: string[];
}

export const REGULAR_SESSION_EXISTS_MESSAGE = "그 날짜에는 이미 정기 세션이 있어요.";
const REGULAR_SESSION_HOLIDAY_MESSAGE = "공휴일에는 정기 세션을 둘 수 없어요.";
export const AUTO_REGULAR_SESSION_KIND_LOCKED_MESSAGE =
  "자동으로 만든 정기 세션은 종류를 바꿀 수 없어요.";

const toDateOrNull = (value: Date | string | number | null | undefined) =>
  value == null ? null : new Date(value);

const toDate = (value: Date | string | number) => new Date(value);

const toSessionKind = (
  stored: Pick<StoredMatchSession, "kind" | "regularDateKey">,
): MatchSessionKind =>
  isMatchSessionKind(stored.kind)
    ? stored.kind
    : stored.regularDateKey
      ? "regular"
      : "custom";

/** 세션 종류와 시작·종료 시각. 정기 세션 시각은 저장하지 않고 정해진 18:00~22:00으로 채운다 */
const toSessionKindAndTimes = (
  stored: Pick<
    StoredMatchSession,
    "kind" | "regularDateKey" | "startTime" | "endTime"
  >,
): {
  kind: MatchSessionKind;
  startTime: string | null;
  endTime: string | null;
} => {
  const kind = toSessionKind(stored);
  const isRegular = kind === "regular";
  return {
    kind,
    startTime: isRegular
      ? REGULAR_SESSION_START_TIME
      : (stored.startTime ?? null),
    endTime: isRegular ? REGULAR_SESSION_END_TIME : (stored.endTime ?? null),
  };
};

// schema의 unixTimestamp 컬럼은 Unix 초로 저장한다. raw SQL은 그 변환을
// 거치지 않으므로 경기 변경 타임스탬프를 여기서 직접 초로 바꾼다.
const toUnixTimestampSeconds = (value: Date) =>
  Math.floor(value.getTime() / 1000);

/** match_starts_at이 이 값(Unix 초) 이하인 점수 없는 created 경기는 진행 중 만료로 본다. */
const inProgressExpiryCutoff = (now: Date) =>
  toUnixTimestampSeconds(
    new Date(now.getTime() - IN_PROGRESS_MATCH_TIMEOUT_MS),
  );

const toPublicPlayer = (record: StoredPlayer): Player => ({
  id: record.id,
  username: record.username,
  duprRating: normalizeNullablePlayerDupr(record.duprRating),
  gender: (record.gender ?? null) as Player["gender"],
  status: record.status as Player["status"],
  isGuest: record.isGuest === true,
  avatarUrl: record.avatarUrl ?? undefined,
  createdAt: toDate(record.createdAt),
  updatedAt: toDate(record.updatedAt),
});

/** 행을 읽은 순서를 유지한 채 경기 id별로 묶는다 */
const groupByMatchId = <T extends { matchId: string }>(rows: T[]) => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const group = grouped.get(row.matchId);
    if (group) group.push(row);
    else grouped.set(row.matchId, [row]);
  }
  return grouped;
};

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

const REGULAR_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface RegularSessionSkip {
  dateKey: string;
  reason: RegularSessionSkipReason;
}

const toExpectedUpdatedAtSeconds = (expectedUpdatedAt: Date | undefined) =>
  expectedUpdatedAt ? toUnixTimestampSeconds(expectedUpdatedAt) : null;

const matchesExpectedUpdatedAt = (
  row: Record<string, unknown>,
  expectedUpdatedAt: Date | undefined,
) =>
  !expectedUpdatedAt ||
  Number(row.updated_at) === toUnixTimestampSeconds(expectedUpdatedAt);

/** 조건부 쓰기가 아무 행도 바꾸지 못했을 때, 현재 행으로 원인(없음·먼저 고침·상태)을 가른다 */
const toRecordedMatchWriteError = (
  row: Record<string, unknown> | undefined,
  expectedUpdatedAt: Date | undefined,
) => {
  if (!row) {
    return new MatchNotFoundError();
  }
  if (!matchesExpectedUpdatedAt(row, expectedUpdatedAt)) {
    return new MatchStaleUpdateError();
  }
  return new MatchRecordUpdateConflictError();
};

/** 진행 중 경기를 만들거나(createInProgressMatch) 예정 경기를 시작할 때(startScheduledMatch) 함께 쓰는 잠금 */
const START_IN_PROGRESS_MATCH_LOCK_SQL =
  "SELECT pg_advisory_xact_lock(hashtext('pkpkdupr:start-in-progress-match'))";

/**
 * playerIds 중 이미 진행 중 경기(findInProgressPlayerIds와 같은 조건)에 있는 첫 선수 id. 없으면 undefined.
 * START_IN_PROGRESS_MATCH_LOCK_SQL을 잡은 트랜잭션 안에서 부른다.
 */
const findFirstBusyPlayerId = async (
  transaction: {
    execute: (statement: { sql: string; args: unknown[] }) => Promise<RawQueryResult>;
  },
  playerIds: string[],
  now: Date,
): Promise<string | undefined> => {
  if (playerIds.length === 0) {
    return undefined;
  }
  const busy = await transaction.execute({
    sql: `
      SELECT DISTINCT p.player_id
      FROM match_participants p
      INNER JOIN matches m ON m.id = p.match_id
      WHERE m.status = 'created'
        AND m.match_starts_at > $1
        AND m.match_starts_at <= $2
        AND NOT EXISTS (SELECT 1 FROM match_scores s WHERE s.match_id = m.id)
        AND p.player_id IN (${placeholders(playerIds.length, 3)})
    `,
    args: [
      inProgressExpiryCutoff(now),
      toUnixTimestampSeconds(now),
      ...playerIds,
    ],
  });
  const busyPlayerIds = new Set(
    busy.rows.map((row: Record<string, unknown>) => String(row.player_id)),
  );
  return playerIds.find((id) => busyPlayerIds.has(id));
};

/** 회원 세션 종료 시각("HH:MM")이 시작보다 이르거나 같아 다음 날 끝나는 행 */
const OVERNIGHT_SESSION_SQL =
  "(s.start_time IS NOT NULL AND s.end_time IS NOT NULL AND s.end_time <= s.start_time)";
/** 회원 세션 종료 시각("HH:MM")의 0시부터 분 */
const SESSION_END_MINUTES_SQL =
  "(split_part(s.end_time, ':', 1)::int * 60 + split_part(s.end_time, ':', 2)::int)";

/**
 * MatchRepository - `packages/db`의 경기 저장소.
 *
 * matches, match_scores, match_participants를 조립해
 * shared Match 계약 형태로 반환합니다.
 */
export class MatchRepository {
  constructor(
    private db: any,
    private client: any,
  ) {}

  async createSession(
    session: Session,
    kind: NonRegularSessionKind = "custom",
  ): Promise<Session> {
    const sessionId = await this.ensureSession(session, kind);
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
      startTime: stored.startTime ?? null,
      endTime: stored.endTime ?? null,
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
    const kind = toSessionKind(stored);

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
      kind,
      autoCreated: kind === "regular" && stored.autoCreated === true,
      // 정기 세션 시각은 저장하지 않고 정해진 18:00~22:00으로 채운다
      startTime:
        kind === "regular" ? REGULAR_SESSION_START_TIME : stored.startTime,
      endTime: kind === "regular" ? REGULAR_SESSION_END_TIME : stored.endTime,
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

  /**
   * 그 KST 날짜의 정기 세션을 찾거나 만든다.
   * 날짜당 하나는 regular_date_key 유니크 제약이 보장하므로, 동시 호출은 ON CONFLICT DO NOTHING 후 재조회로 같은 행을 받는다.
   * 세션이 없고 그 날짜가 regular_session_skips(공휴일·정기 쉬는 날)에 있으면 만들지 않고 null을 돌려준다.
   * 새로 만든 세션은 자동 정기 세션(auto_created)이다. 그날 직접 만든 정기 세션이 있으면 그 세션을 돌려준다.
   */
  async findOrCreateRegularSession(
    dateKey: string,
  ): Promise<{ session: ManagedMatchSession; created: boolean } | null> {
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
      return { session: await this.toManagedSession(existing), created: false };
    }
    if (await this.isRegularSessionSkipped(dateKey)) {
      return null;
    }

    const sessionDate = kstDateKeyToDate(dateKey, REGULAR_SESSION_START_HOUR);
    // 새 id가 기존 세션 id와 겹치면 행이 들어가지 않으므로 다른 id로 다시 시도한다.
    // 같은 날 18:00 KST에 정기 세션과 이름이 같은 다른 세션이 있으면 (name, date) 유니크 충돌로 끝까지 실패한다.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const now = new Date();
      const candidateId = generateEntityId("session");
      await this.db
        .insert(matchSessions)
        .values({
          id: candidateId,
          name: getRegularSessionName(dateKey),
          date: sessionDate,
          location: REGULAR_SESSION_LOCATION,
          kind: "regular",
          regularDateKey: dateKey,
          autoCreated: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();

      const stored = await findStored();
      if (stored) {
        // 동시 호출이 먼저 만든 행이면 id가 달라 created=false다
        return {
          session: await this.toManagedSession(stored),
          created: stored.id === candidateId,
        };
      }
    }

    throw new Error("정기 세션을 만들지 못했습니다.");
  }

  /** 세션 참여자를 추가한다. 이미 있는 참여자는 그대로 둔다. 새로 들어간 참여자가 있으면 true */
  async addSessionParticipants(
    sessionId: string,
    playerIds: string[],
  ): Promise<boolean> {
    if (!isEntityId(sessionId, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }
    const uniquePlayerIds = [...new Set(playerIds)];
    if (uniquePlayerIds.length === 0) {
      return false;
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
    if (inserted.rowsAffected === 0) {
      return false;
    }
    await this.client.execute({
      sql: "UPDATE match_sessions SET updated_at = $1 WHERE id = $2",
      args: [now, sessionId],
    });
    return true;
  }

  /**
   * 게스트 회원을 만들고 그 세션의 참여자로 넣는다.
   * 한 트랜잭션이라 참여자 추가가 실패하면 게스트 행도 남지 않는다.
   * 아이디가 겹치면 Postgres unique_violation(23505)을 그대로 던진다.
   */
  async createGuestParticipant(
    sessionId: string,
    guest: CreateStoredPlayerInput,
  ): Promise<StoredPlayerRecord> {
    if (!isEntityId(sessionId, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    const now = toUnixTimestampSeconds(new Date());
    try {
      const created = await new PlayerRepository(transaction.db).create(guest);
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
        args: [`${sessionId}-${created.id}`, sessionId, created.id, now],
      });
      await transaction.execute({
        sql: "UPDATE match_sessions SET updated_at = $1 WHERE id = $2",
        args: [now, sessionId],
      });
      await transaction.commit();
      committed = true;
      return created;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }

  /** 세션 참여자 한 명을 뺀다. 참여 중이 아니면 아무것도 하지 않는다. 실제로 뺐으면 true */
  async removeSessionParticipant(
    sessionId: string,
    playerId: string,
  ): Promise<boolean> {
    if (!isEntityId(sessionId, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }
    const deleted = await this.client.execute({
      sql: `
        DELETE FROM match_session_participants
        WHERE session_id = $1 AND player_id = $2
      `,
      args: [sessionId, playerId],
    });
    if (deleted.rowsAffected === 0) {
      return false;
    }
    await this.client.execute({
      sql: "UPDATE match_sessions SET updated_at = $1 WHERE id = $2",
      args: [toUnixTimestampSeconds(new Date()), sessionId],
    });
    return true;
  }

  /** 세션 시각이 [from, to) 범위인 세션을 시각 오름차순으로 돌려준다. */
  async findSessionsInRange(
    from: Date,
    to: Date,
  ): Promise<ManagedMatchSession[]> {
    const storedSessions = await this.db
      .select()
      .from(matchSessions)
      .where(and(gte(matchSessions.date, from), lt(matchSessions.date, to)))
      .orderBy(asc(matchSessions.date));
    return await Promise.all(
      storedSessions.map((session: StoredMatchSession) =>
        this.toManagedSession(session),
      ),
    );
  }

  /** 세션 시각이 from 이상인 세션을 시각 오름차순으로 돌려준다. */
  async findSessionsFrom(from: Date): Promise<ManagedMatchSession[]> {
    const storedSessions = await this.db
      .select()
      .from(matchSessions)
      .where(gte(matchSessions.date, from))
      .orderBy(asc(matchSessions.date));
    return await Promise.all(
      storedSessions.map((session: StoredMatchSession) =>
        this.toManagedSession(session),
      ),
    );
  }

  /**
   * 조회 시점 만료 정리를 단일 SQL 문(data-modifying CTE) 한 번으로 실행한다.
   * - 라운드 없는 점수 없는 created 경기 중 isInProgressMatchExpired인 경기(관리자 예정 경기 포함)를 참가자·점수 행과 함께 삭제한다.
   * - 라운드 있는(대진) 점수 없는 created 경기는 같은 조건이면 지우지 않고 scheduled로 되돌린다. scheduled 경기는 건드리지 않는다.
   * - 경기가 하나도 없고 getEmptySessionExpiresAt이 지난 세션을 참여자 행과 함께 삭제한다.
   *   한 문장 안의 CTE는 같은 스냅샷을 보므로, 같은 문장이 지우는 경기는 빼고 빈 세션을 판정한다.
   *   그래서 만료된 진행 중 경기만 있던 세션도 같은 호출에서 빈 세션으로 지워진다.
   * 명시적 트랜잭션 없이 문장 하나라 DB 왕복은 대상 유무와 관계없이 1회다.
   * 빈 세션 판정은 문장 시작 스냅샷 기준이고 세션 행을 잠그지 않으므로, 그 뒤 같은 세션에 커밋된 경기는 보지 못한다.
   * 정리 대상은 만료 시각이 지난 세션뿐이라 미래 세션은 지우지 않고, 경기 생성은 오늘 세션만 허용하므로 이 경계는 허용한다.
   */
  async deleteExpiredInProgressMatchesAndEmptySessions(
    now: Date,
  ): Promise<ExpiredCleanupResult> {
    const result: RawQueryResult = await this.client.execute({
      // 같은 경기에 점수 입력(updateRecordedMatch)이 동시에 들어오면 FOR UPDATE 행 잠금으로 순서를 정한다.
      // 잠금을 기다린 행은 갱신된 버전으로 WHERE를 다시 평가하므로, 먼저 completed가 된 경기는 지우지 않는다.
      // 세션 만료의 KST 계산은 TS(getEmptySessionExpiryCutoff)에서 하고 epoch 초 기준값만 넘긴다.
      // 자정을 넘기는 회원 세션만 date(그날 00:00 KST) + 하루 + 종료 시각으로 만료를 직접 계산한다.
      sql: `
        WITH expired_matches AS (
          SELECT m.id
          FROM matches m
          WHERE m.status = 'created'
            AND m.round IS NULL
            AND m.match_starts_at <= $1
            AND NOT EXISTS (SELECT 1 FROM match_scores sc WHERE sc.match_id = m.id)
          FOR UPDATE
        ),
        reverted_matches AS (
          -- UPDATE도 행을 잠그고, 먼저 첫 점수로 completed가 된 행은 status 조건을 다시 평가해 건너뛴다.
          UPDATE matches m
          SET status = 'scheduled', updated_at = GREATEST($4, m.updated_at + 1)
          WHERE m.status = 'created'
            AND m.round IS NOT NULL
            AND m.match_starts_at <= $1
            AND NOT EXISTS (SELECT 1 FROM match_scores sc WHERE sc.match_id = m.id)
          RETURNING m.id
        ),
        deleted_matches AS (
          DELETE FROM matches m
          WHERE m.id IN (SELECT id FROM expired_matches)
          RETURNING m.id
        ),
        deleted_match_scores AS (
          DELETE FROM match_scores
          WHERE match_id IN (SELECT id FROM deleted_matches)
        ),
        deleted_match_participants AS (
          DELETE FROM match_participants
          WHERE match_id IN (SELECT id FROM deleted_matches)
        ),
        deleted_sessions AS (
          DELETE FROM match_sessions s
          WHERE (
              (s.regular_date_key IS NOT NULL AND s."date" < $2)
              OR (
                s.regular_date_key IS NULL
                AND NOT ${OVERNIGHT_SESSION_SQL}
                AND s."date" < $3
              )
              OR (
                s.regular_date_key IS NULL
                AND ${OVERNIGHT_SESSION_SQL}
                AND s."date" + 86400 + ${SESSION_END_MINUTES_SQL} * 60 <= $4
              )
            )
            AND NOT EXISTS (
              SELECT 1
              FROM matches m
              WHERE m.session_id = s.id
                AND NOT EXISTS (SELECT 1 FROM deleted_matches d WHERE d.id = m.id)
            )
          RETURNING s.id
        ),
        deleted_session_participants AS (
          DELETE FROM match_session_participants
          WHERE session_id IN (SELECT id FROM deleted_sessions)
        )
        SELECT
          (SELECT count(*) FROM deleted_matches) AS deleted_match_count,
          (SELECT count(*) FROM reverted_matches) AS reverted_match_count,
          (SELECT count(*) FROM deleted_sessions) AS deleted_session_count,
          (SELECT string_agg(id, ',') FROM deleted_sessions) AS deleted_session_ids
      `,
      args: [
        inProgressExpiryCutoff(now),
        toUnixTimestampSeconds(getEmptySessionExpiryCutoff("regular", now)),
        toUnixTimestampSeconds(getEmptySessionExpiryCutoff("custom", now)),
        toUnixTimestampSeconds(now),
      ],
    });
    const row = result.rows[0];
    // 세션 id(엔티티 id)에는 쉼표가 없어 쉼표로 이어 받는다
    const deletedSessionIds =
      typeof row?.deleted_session_ids === "string" && row.deleted_session_ids
        ? row.deleted_session_ids.split(",")
        : [];
    return {
      deletedMatchCount: Number(row?.deleted_match_count ?? 0),
      revertedMatchCount: Number(row?.reverted_match_count ?? 0),
      deletedSessionCount: Number(row?.deleted_session_count ?? 0),
      deletedSessionIds,
    };
  }

  /**
   * 진행 중(점수 없는 created, 이미 시작했고 만료 전) 경기에 들어간 선수 id.
   * 시작 시각이 아직 오지 않은 관리자 예정 경기는 진행 중으로 보지 않는다.
   */
  async findInProgressPlayerIds(now: Date): Promise<string[]> {
    const cutoff = inProgressExpiryCutoff(now);
    const result: RawQueryResult = await this.client.execute({
      sql: `
        SELECT DISTINCT p.player_id
        FROM match_participants p
        INNER JOIN matches m ON m.id = p.match_id
        WHERE m.status = 'created'
          AND m.match_starts_at > $1
          AND m.match_starts_at <= $2
          AND NOT EXISTS (SELECT 1 FROM match_scores s WHERE s.match_id = m.id)
      `,
      args: [cutoff, toUnixTimestampSeconds(now)],
    });
    return result.rows.map((row) => String(row.player_id));
  }

  async findById(id: string): Promise<Match | undefined> {
    return await this.findByIdWith(this.db, id);
  }

  /** `executor`(풀 또는 트랜잭션 커넥션)로 경기를 조회·조립한다. */
  private async findByIdWith(
    executor: any,
    id: string,
  ): Promise<Match | undefined> {
    const match = await executor
      .select()
      .from(matches)
      .where(eq(matches.id, id))
      .limit(1)
      .then(firstRow);

    if (!match) {
      return undefined;
    }

    const [hydrated] = await this.hydrateMatches([match], executor);
    return hydrated;
  }

  /**
   * 경기 목록(시작 시각 최신순). 대진 예정 경기(scheduled)는 includeScheduled일 때만 넣는다.
   */
  async findAll(
    page: number = 0,
    limit: number = 20,
    playerId?: string,
    options: { includeScheduled?: boolean } = {},
  ): Promise<{ matches: Match[]; total: number }> {
    const statusFilter = options.includeScheduled
      ? undefined
      : ne(matches.status, "scheduled");
    // 플레이어별 조회는 참가자 인덱스로 DB에서 먼저 대상을 줄이고,
    // hydrate는 요청한 페이지의 경기만 한다.
    const allMatches = playerId
      ? (await this.db
          .select({ match: matches })
          .from(matches)
          .innerJoin(
            matchParticipants,
            eq(matchParticipants.matchId, matches.id),
          )
          .where(and(eq(matchParticipants.playerId, playerId), statusFilter))
          .orderBy(
            desc(matches.matchStartsAt),
            desc(matches.createdAt),
            desc(matches.id),
          )).map((row: { match: StoredMatch }) => row.match)
      : await this.db
          .select()
          .from(matches)
          .where(statusFilter)
          .orderBy(
            desc(matches.matchStartsAt),
            desc(matches.createdAt),
            desc(matches.id),
          );
    const start = page * limit;

    return {
      matches: await this.hydrateMatches(allMatches.slice(start, start + limit)),
      total: allMatches.length,
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
          AND matches.rating_excluded = false
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
          eq(matches.ratingExcluded, false),
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

  /** 선수별로 참가한 평점 미반영(rating_excluded) 완료 경기 수. 0인 선수는 빠진다 */
  async countRatingExcludedMatchesByPlayerId(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({
        playerId: matchParticipants.playerId,
        matchCount: count(),
      })
      .from(matchParticipants)
      .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
      .where(
        and(
          eq(matches.status, "completed"),
          eq(matches.ratingExcluded, true),
        ),
      )
      .groupBy(matchParticipants.playerId);

    return Object.fromEntries(
      rows.map(({ playerId, matchCount }: {
        playerId: string;
        matchCount: number | string;
      }) => [playerId, Number(matchCount)]),
    );
  }

  /** 선수별로 팀에 든 경기 행 수와 가장 늦은 경기 시각. 상태·평점 미반영 여부를 가리지 않는다. 경기가 없는 선수는 빠진다 */
  async findMatchStatsByPlayerId(): Promise<
    Record<string, { matchCount: number; lastMatchStartsAt: Date | null }>
  > {
    const rows = await this.db
      .select({
        playerId: matchParticipants.playerId,
        matchCount: count(),
        lastMatchStartsAt: max(matches.matchStartsAt),
      })
      .from(matchParticipants)
      .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
      .groupBy(matchParticipants.playerId);

    return Object.fromEntries(
      rows.map(({ playerId, matchCount, lastMatchStartsAt }: {
        playerId: string;
        matchCount: number | string;
        lastMatchStartsAt: Date | string | number | null;
      }) => [
        playerId,
        {
          matchCount: Number(matchCount),
          lastMatchStartsAt:
            lastMatchStartsAt == null ? null : toDate(lastMatchStartsAt),
        },
      ]),
    );
  }

  /**
   * 완료 경기의 분류·세션·팀 구성·점수만 쿼리 3번으로 읽는다.
   * 경기마다 참가자·점수·세션을 따로 읽는 hydrate를 거치지 않아 랭킹처럼 전체 경기를 훑는 조회에 쓴다.
   */
  async findCompletedMatchOutcomes(): Promise<CompletedMatchOutcome[]> {
    const completedFilter = and(
      eq(matches.status, "completed"),
      isNotNull(matches.completedAt),
    );
    const [matchRows, participantRows, scoreRows] = await Promise.all([
      this.db
        .select({
          id: matches.id,
          type: matches.type,
          sessionId: matches.sessionId,
          matchStartsAt: matches.matchStartsAt,
          completedAt: matches.completedAt,
          ratingExcluded: matches.ratingExcluded,
          sessionKind: matchSessions.kind,
          regularDateKey: matchSessions.regularDateKey,
        })
        .from(matches)
        .leftJoin(matchSessions, eq(matches.sessionId, matchSessions.id))
        .where(completedFilter),
      this.db
        .select({
          matchId: matchParticipants.matchId,
          teamIndex: matchParticipants.teamIndex,
          playerId: matchParticipants.playerId,
        })
        .from(matchParticipants)
        .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
        .where(completedFilter)
        .orderBy(asc(matchParticipants.id)),
      this.db
        .select({
          matchId: matchScores.matchId,
          scoreA: matchScores.scoreA,
          scoreB: matchScores.scoreB,
        })
        .from(matchScores)
        .innerJoin(matches, eq(matchScores.matchId, matches.id))
        .where(completedFilter)
        .orderBy(asc(matchScores.id)),
    ]);

    const teamsByMatchId = new Map<string, [string[], string[]]>();
    for (const row of participantRows as Array<{
      matchId: string;
      teamIndex: number;
      playerId: string;
    }>) {
      if (row.teamIndex !== 0 && row.teamIndex !== 1) continue;
      const teams: [string[], string[]] = teamsByMatchId.get(row.matchId) ?? [
        [],
        [],
      ];
      teams[row.teamIndex].push(row.playerId);
      teamsByMatchId.set(row.matchId, teams);
    }
    const scoresByMatchId = new Map<string, MatchScore[]>();
    for (const row of scoreRows as Array<{
      matchId: string;
      scoreA: number;
      scoreB: number;
    }>) {
      const scores = scoresByMatchId.get(row.matchId) ?? [];
      scores.push({ scoreA: row.scoreA, scoreB: row.scoreB });
      scoresByMatchId.set(row.matchId, scores);
    }

    return (
      matchRows as Array<{
        id: string;
        type: string;
        sessionId: string | null;
        matchStartsAt: Date | string | number;
        completedAt: Date | string | number;
        ratingExcluded: boolean | null;
        sessionKind: string | null;
        regularDateKey: string | null;
      }>
    ).map((row): CompletedMatchOutcome => ({
      id: row.id,
      type: row.type as MatchType,
      sessionId: row.sessionId ?? null,
      matchStartsAt: toDate(row.matchStartsAt),
      completedAt: toDate(row.completedAt),
      teamPlayerIds: teamsByMatchId.get(row.id) ?? [[], []],
      scores: scoresByMatchId.get(row.id) ?? [],
      ratingExcluded: row.ratingExcluded === true,
      regularSession:
        row.sessionId != null &&
        row.sessionKind != null &&
        toSessionKind({
          kind: row.sessionKind,
          regularDateKey: row.regularDateKey,
        }) === "regular",
    }));
  }

  /** 모든 세션과 참여자 id를 쿼리 2번으로 읽는다(세션 날짜 내림차순) */
  async findSessionsWithParticipantIds(): Promise<SessionWithParticipantIds[]> {
    const [sessionRows, participantRows] = await Promise.all([
      this.db.select().from(matchSessions).orderBy(desc(matchSessions.date)),
      this.db
        .select({
          sessionId: matchSessionParticipants.sessionId,
          playerId: matchSessionParticipants.playerId,
        })
        .from(matchSessionParticipants)
        .orderBy(asc(matchSessionParticipants.id)),
    ]);

    const participantIdsBySessionId = new Map<string, string[]>();
    for (const row of participantRows as Array<{
      sessionId: string;
      playerId: string;
    }>) {
      const ids = participantIdsBySessionId.get(row.sessionId) ?? [];
      ids.push(row.playerId);
      participantIdsBySessionId.set(row.sessionId, ids);
    }

    return (sessionRows as StoredMatchSession[]).map(
      (session): SessionWithParticipantIds => {
        return {
          id: session.id,
          name: session.name,
          date: toDate(session.date),
          location: session.location,
          ...toSessionKindAndTimes(session),
          participantIds: participantIdsBySessionId.get(session.id) ?? [],
        };
      },
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
    // 대진 예정 경기는 피드에 넣지 않는다(예정 경기만 있는 세션도 피드에 나오지 않는다)
    const allMatches = (await this.loadAllMatches()).filter(
      (match) => match.status !== "scheduled",
    );
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
      validateMatchScores(data.scores ?? []);
    }

    const sessionId = data.session
      ? await this.ensureSession(data.session)
      : null;

    await this.db.insert(matches).values({
      id: data.id,
      type: data.type,
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
      ratingExcluded: data.ratingExcluded ?? false,
      round: data.round ?? null,
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

  /** 세션이 지정된 완료 경기를 단일 transaction으로 일괄 생성한다. */
  async createCompletedBatch(data: CreateMatchInput[]): Promise<Match[]> {
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
      if (match.status !== "completed" || (match.scores?.length ?? 0) === 0) {
        throw new Error("완료 경기만 일괄 생성할 수 있습니다.");
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

        await transaction.execute({
          sql: `
            INSERT INTO matches (
              id,
              type,
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
              rating_excluded,
              created_at,
              updated_at
            )
            VALUES (${placeholders(18)})
          `,
          args: [
            match.id,
            match.type,
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
            match.ratingExcluded ?? false,
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

  /**
   * 점수 없는 진행 중 경기를 만든다. 선수 중 누구든 이미 진행 중 경기(findInProgressPlayerIds와 같은 조건)에 있으면
   * 아무것도 쓰지 않고 겹치는 첫 선수 id를 돌려준다.
   * 확인과 생성(세션 참여자 추가 포함)을 advisory 트랜잭션 잠금 하나로 직렬화해, 같은 선수로 동시에 와도 하나만 생긴다.
   * data.session은 이미 있는 세션이어야 한다.
   */
  async createInProgressMatch(
    data: CreateMatchInput,
    now: Date,
  ): Promise<
    | {
        match: Match;
        /** 이 경기로 세션 참여자가 새로 들어갔으면 true */
        sessionParticipantsAdded: boolean;
        conflictPlayerId?: undefined;
      }
    | { conflictPlayerId: string }
  > {
    if (!isEntityId(data.id, "match")) {
      throw new Error("유효한 매치 ID가 필요합니다.");
    }
    if (data.status !== "created" || (data.scores?.length ?? 0) > 0) {
      throw new Error("점수 없는 진행 중 경기만 만들 수 있습니다.");
    }
    if (data.session && !isEntityId(data.session.id, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }
    const playerIds = [
      ...new Set(data.teams.flatMap((team) => team.players.map((p) => p.id))),
    ];
    if (playerIds.length === 0) {
      throw new Error("경기 선수가 필요합니다.");
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    let sessionParticipantsAdded = false;
    try {
      await transaction.execute(START_IN_PROGRESS_MATCH_LOCK_SQL);

      const conflictPlayerId = await findFirstBusyPlayerId(
        transaction,
        playerIds,
        now,
      );
      if (conflictPlayerId) {
        return { conflictPlayerId };
      }

      const nowSeconds = toUnixTimestampSeconds(now);
      const session = data.session;
      if (session) {
        // 경기 저장 전에 참여자를 넣어, 저장된 세션 경기의 선수는 항상 참여자이게 한다.
        const inserted = await transaction.execute({
          sql: `
            INSERT INTO match_session_participants (
              id, session_id, player_id, created_at
            )
            VALUES ${playerIds
              .map((_, index) => `(${placeholders(4, index * 4 + 1)})`)
              .join(", ")}
            ON CONFLICT DO NOTHING
          `,
          args: playerIds.flatMap((playerId) => [
            `${session.id}-${playerId}`,
            session.id,
            playerId,
            nowSeconds,
          ]),
        });
        if (inserted.rowsAffected > 0) {
          sessionParticipantsAdded = true;
          await transaction.execute({
            sql: "UPDATE match_sessions SET updated_at = $1 WHERE id = $2",
            args: [nowSeconds, session.id],
          });
        }
      }

      await transaction.execute({
        sql: `
          INSERT INTO matches (
            id,
            type,
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
          VALUES (${placeholders(17)})
        `,
        args: [
          data.id,
          data.type,
          data.source ?? "player_created",
          data.creatorPlayerId,
          data.name?.trim() || null,
          session?.id ?? null,
          session?.name?.trim() || null,
          session ? toUnixTimestampSeconds(toDate(session.date)) : null,
          data.status,
          data.location,
          data.courtName?.trim() || null,
          toUnixTimestampSeconds(new Date(data.matchStartsAt)),
          null,
          null,
          null,
          nowSeconds,
          nowSeconds,
        ],
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
              `${data.id}-team-${teamIndex}-${player.id}`,
              data.id,
              teamIndex,
              player.id,
              JSON.stringify(player.duprRating ?? null),
            ],
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

    const created = await this.findById(data.id);
    if (!created) {
      throw new Error("매치 생성에 실패했습니다.");
    }
    return { match: created, sessionParticipantsAdded };
  }

  /**
   * 대진 예정 경기(scheduled)를 진행 중(created, match_starts_at=now)으로 바꾼다.
   * 경기가 없거나 scheduled가 아니면, 또는 선수 중 누구든 이미 진행 중 경기에 있으면 아무것도 바꾸지 않고 그 사유를 돌려준다.
   * createInProgressMatch와 같은 advisory 잠금 안에서 확인·전환해, 같은 선수로 동시에 시작해도 하나만 진행 중이 된다.
   */
  async startScheduledMatch(
    matchId: string,
    now: Date,
  ): Promise<
    | { match: Match; reason?: undefined }
    | { reason: "not_found" | "not_scheduled" }
    | { reason: "player_busy"; conflictPlayerId: string }
  > {
    if (!isEntityId(matchId, "match")) {
      return { reason: "not_found" };
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    try {
      await transaction.execute(START_IN_PROGRESS_MATCH_LOCK_SQL);

      const locked = await transaction.execute({
        sql: `SELECT status FROM matches WHERE id = $1 FOR UPDATE`,
        args: [matchId],
      });
      const status = locked.rows[0]?.status;
      if (status === undefined) {
        return { reason: "not_found" };
      }
      if (status !== "scheduled") {
        return { reason: "not_scheduled" };
      }

      const participants = await transaction.execute({
        sql: `SELECT player_id FROM match_participants WHERE match_id = $1 ORDER BY id`,
        args: [matchId],
      });
      const playerIds = [
        ...new Set<string>(
          participants.rows.map((row: Record<string, unknown>) =>
            String(row.player_id),
          ),
        ),
      ];
      const conflictPlayerId = await findFirstBusyPlayerId(
        transaction,
        playerIds,
        now,
      );
      if (conflictPlayerId) {
        return { reason: "player_busy", conflictPlayerId };
      }

      const nowSeconds = toUnixTimestampSeconds(now);
      await transaction.execute({
        sql: `
          UPDATE matches
          SET status = 'created',
            match_starts_at = $1,
            updated_at = GREATEST($1, updated_at + 1)
          WHERE id = $2
        `,
        args: [nowSeconds, matchId],
      });

      await transaction.commit();
      committed = true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }

    const started = await this.findById(matchId);
    if (!started) {
      throw new Error("경기 시작에 실패했습니다.");
    }
    return { match: started };
  }

  /**
   * 진행 중(점수 없는 created, 이미 시작했고 만료 전) 경기 전부를 시작 시각 최신순으로 돌려준다.
   * 조건은 findInProgressPlayerIds와 같아 시작 시각이 아직 오지 않은 관리자 예정 경기는 빠진다.
   */
  async findInProgressMatches(now: Date): Promise<Match[]> {
    const result: RawQueryResult = await this.client.execute({
      sql: `
        SELECT m.id
        FROM matches m
        WHERE m.status = 'created'
          AND m.match_starts_at > $1
          AND m.match_starts_at <= $2
          AND NOT EXISTS (SELECT 1 FROM match_scores s WHERE s.match_id = m.id)
        ORDER BY m.match_starts_at DESC, m.created_at DESC, m.id DESC
      `,
      args: [inProgressExpiryCutoff(now), toUnixTimestampSeconds(now)],
    });
    const found = await Promise.all(
      result.rows.map((row) => this.findById(String(row.id))),
    );
    return found.filter((match): match is Match => match !== undefined);
  }

  async fillMissingParticipantDuprSnapshots(
    snapshots: MatchParticipantDuprSnapshot[],
  ): Promise<{
    updatedParticipantCount: number;
    updatedMatchCount: number;
  }> {
    // 같은 참가자가 여러 번 오면 앞의 스냅샷이 이긴다(비어 있을 때만 채우므로)
    const uniqueSnapshots = new Map<string, MatchParticipantDuprSnapshot>();
    for (const snapshot of snapshots) {
      if (!snapshot.matchId || !snapshot.playerId) continue;
      const key = `${snapshot.matchId}\u0000${snapshot.playerId}`;
      if (!uniqueSnapshots.has(key)) uniqueSnapshots.set(key, snapshot);
    }

    const updatedMatchIds = new Set<string>();
    let updatedParticipantCount = 0;
    const rows = [...uniqueSnapshots.values()];
    // 전체 재계산은 참가자 행 수만큼 스냅샷이 오므로 묶어서 한 문장씩 보낸다
    const chunkSize = 500;
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const values = chunk
        .map((_, index) => `(${placeholders(3, index * 3 + 1)})`)
        .join(", ");
      const result = await this.client.execute({
        sql: `
          UPDATE match_participants
          SET dupr_rating_json = snapshot.dupr_rating_json
          FROM (VALUES ${values}) AS snapshot(dupr_rating_json, match_id, player_id)
          WHERE match_participants.match_id = snapshot.match_id
            AND match_participants.player_id = snapshot.player_id
            AND match_participants.dupr_rating_json IS NULL
          RETURNING match_participants.match_id
        `,
        args: chunk.flatMap((snapshot) => [
          JSON.stringify(snapshot.duprRating ?? null),
          snapshot.matchId,
          snapshot.playerId,
        ]),
      });

      updatedParticipantCount += result.rowsAffected;
      for (const row of result.rows) {
        updatedMatchIds.add(String(row.match_id));
      }
    }

    return {
      updatedParticipantCount,
      updatedMatchCount: updatedMatchIds.size,
    };
  }

  /**
   * scheduled·created·completed 경기의 기록(종류·이름·장소·참가자·점수)을 한 트랜잭션으로 교체하고
   * completed로 만든다. completed_at은 기존 값을 유지하고 없을 때만 resultSubmittedAt으로 채운다.
   * 세션·시작 시각(관리자 정정)도 주면 같은 UPDATE·같은 updated_at 조건으로 바꾼다.
   * 옮길 세션이 없으면 아무것도 바꾸지 않고 예외를 던진다.
   * 남는 참가자는 기존 평점 스냅샷을 유지하고, 새 참가자는 비워 두어 평점 반영 때 채워지게 한다.
   */
  async updateRecordedMatch(
    matchId: string,
    data: UpdateRecordedMatchInput,
  ): Promise<Match> {
    validateMatchScores(data.scores);
    const location = data.location.trim();
    if (!location) {
      throw new Error("매치 장소를 입력해주세요.");
    }

    const scoreColumns = await this.getMatchScoreColumns();
    const transaction = await this.client.transaction("write");
    let committed = false;
    // 수정 기록용으로 트랜잭션 안에서 읽은 수정 후 경기. 있으면 커밋 뒤 다시 읽지 않고 돌려준다
    let after: Match | undefined;

    try {
      // 수정 기록용 수정 전 스냅샷. 행을 잠그고 읽어 아래 UPDATE와 사이에 다른 수정이 끼지 않게 한다.
      let before: Match | undefined;
      if (data.editLog) {
        const locked = await transaction.execute({
          sql: `SELECT status FROM matches WHERE id = $1 FOR UPDATE`,
          args: [matchId],
        });
        if (locked.rows[0]?.status === "completed") {
          before = await this.findByIdWith(transaction.db, matchId);
        }
      }

      const submittedAtSeconds = toUnixTimestampSeconds(data.resultSubmittedAt);
      const args: unknown[] = [
        data.type,
        data.name?.trim() || null,
        location,
        data.resultSubmittedByPlayerId,
        submittedAtSeconds,
        matchId,
        toExpectedUpdatedAtSeconds(data.expectedUpdatedAt),
        data.ratingExcluded,
      ];
      const addArg = (value: unknown) => {
        args.push(value);
        return `$${args.length}`;
      };
      const optionalAssignments: string[] = [];
      let completedAtExpression = "COALESCE(completed_at, $5)";

      if (data.sessionId === null) {
        optionalAssignments.push(
          "session_id = NULL",
          "session_name = NULL",
          "session_date = NULL",
        );
      } else if (data.sessionId !== undefined) {
        // 세션 비정규화 컬럼은 updateMetadata의 세션 연결과 같이 세션 행에서 복사한다
        const session = isEntityId(data.sessionId, "session")
          ? (
              await transaction.execute({
                sql: `SELECT id, name, "date" FROM match_sessions WHERE id = $1`,
                args: [data.sessionId],
              })
            ).rows[0]
          : undefined;
        if (!session) {
          throw new Error("세션을 찾을 수 없어요.");
        }
        optionalAssignments.push(
          `session_id = ${addArg(String(session.id))}`,
          `session_name = ${addArg(String(session.name))}`,
          `session_date = ${addArg(Number(session.date))}`,
        );
      }

      if (data.matchStartsAt !== undefined) {
        const matchStartsAtParam = addArg(
          toUnixTimestampSeconds(data.matchStartsAt),
        );
        optionalAssignments.push(`match_starts_at = ${matchStartsAtParam}`);
        // SET의 식은 고치기 전 행 값을 읽으므로, 이미 완료된 경기는 completed_at을 시작 시각이 옮겨 간 만큼 옮긴다.
        // 평점 재계산이 completed_at 순서로 경기를 다시 돌리기 때문이다.
        completedAtExpression = `
          CASE
            WHEN status = 'completed' AND completed_at IS NOT NULL
              THEN completed_at + (${matchStartsAtParam}::bigint - match_starts_at)
            ELSE COALESCE(completed_at, $5)
          END`;
      }

      const updateResult = await transaction.execute({
        sql: `
          UPDATE matches
          SET
            type = $1,
            name = $2,
            location = $3,
            status = 'completed',
            result_submitted_by_player_id = $4,
            result_submitted_at = $5,
            completed_at = ${completedAtExpression},
            updated_at = GREATEST($5, updated_at + 1),
            rating_excluded = $8${optionalAssignments
              .map((assignment) => `,\n            ${assignment}`)
              .join("")}
          WHERE id = $6
            AND status IN ('scheduled', 'created', 'completed')
            AND ($7::bigint IS NULL OR updated_at = $7)
        `,
        args,
      });
      if (!updateResult.rowsAffected) {
        const current = await transaction.execute({
          sql: `SELECT status, updated_at FROM matches WHERE id = $1`,
          args: [matchId],
        });
        throw toRecordedMatchWriteError(
          current.rows[0],
          data.expectedUpdatedAt,
        );
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

      if (data.editLog && before) {
        after = await this.findByIdWith(transaction.db, matchId);
        if (after && getMatchEditFields(before, after).length > 0) {
          await transaction.execute(
            buildMatchEditLogInsert({
              id: data.editLog.id,
              matchId,
              editedByPlayerId: data.resultSubmittedByPlayerId,
              editedByAdmin: data.editLog.editedByAdmin,
              before,
              after,
              editedAt: data.resultSubmittedAt,
            }),
          );
        }
      }

      await transaction.commit();
      committed = true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }

    const updated = after ?? (await this.findById(matchId));
    if (!updated) {
      throw new Error("매치 기록 저장에 실패했습니다.");
    }
    return updated;
  }

  /**
   * 경기를 지우고 같은 트랜잭션에서 감사 로그(match_deletion_logs)를 남긴다.
   * 행을 FOR UPDATE로 잠근 뒤 스냅샷을 읽으므로, 같은 경기에 점수 입력(updateRecordedMatch)이 겹치면
   * 둘 중 하나가 먼저 끝난 상태를 기준으로 처리된다. 지운 행의 상태는 DELETE … RETURNING으로 돌려준다.
   * 세션은 건드리지 않는다. 경기가 없어진 세션은 빈 세션 정리 규칙(만료 시각 이후 정리)을 따른다.
   */
  async deleteRecordedMatch(
    matchId: string,
    input: DeleteRecordedMatchInput,
  ): Promise<DeletedMatchResult> {
    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      const locked = await transaction.execute({
        sql: `SELECT status, updated_at FROM matches WHERE id = $1 FOR UPDATE`,
        args: [matchId],
      });
      const lockedRow = locked.rows[0];
      if (
        !lockedRow ||
        !matchesExpectedUpdatedAt(lockedRow, input.expectedUpdatedAt)
      ) {
        throw toRecordedMatchWriteError(lockedRow, input.expectedUpdatedAt);
      }

      // 풀의 다른 커넥션을 기다리면 동시 삭제가 풀을 다 점유했을 때 교착하므로 트랜잭션 커넥션으로 읽는다.
      const snapshot = await this.findByIdWith(transaction.db, matchId);
      if (!snapshot) {
        throw new MatchNotFoundError();
      }

      await transaction.execute({
        sql: `DELETE FROM match_scores WHERE match_id = $1`,
        args: [matchId],
      });
      await transaction.execute({
        sql: `DELETE FROM match_participants WHERE match_id = $1`,
        args: [matchId],
      });
      const deleted = await transaction.execute({
        sql: `DELETE FROM matches WHERE id = $1 RETURNING status`,
        args: [matchId],
      });
      const deletedRow = deleted.rows[0];
      if (!deletedRow) {
        throw new MatchNotFoundError();
      }
      await transaction.execute(
        buildMatchDeletionLogInsert({
          id: input.logId,
          matchId,
          deletedByPlayerId: input.deletedByPlayerId,
          deletedByAdmin: input.deletedByAdmin,
          matchSnapshot: snapshot,
          deletedAt: input.deletedAt,
        }),
      );

      await transaction.commit();
      committed = true;
      return {
        status: String(deletedRow.status) as MatchStatus,
        match: snapshot,
      };
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }

  /**
   * 경기가 없는 세션을 참여자와 함께 지운다. 없으면 false.
   * cancelRegularFromDateKey를 주면 그 날짜 이후(포함)의 자동 정기 세션을 지울 때 그 날짜를 정기 쉬는 날(canceled)로 남겨 다시 만들지 않는다.
   * 직접 만든 정기 세션은 지워도 쉬는 날을 남기지 않는다.
   */
  async deleteSession(
    sessionId: string,
    options: { cancelRegularFromDateKey?: string } = {},
  ): Promise<boolean> {
    if (!isEntityId(sessionId, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    try {
      const session = await transaction.execute({
        sql: "SELECT id, regular_date_key, auto_created FROM match_sessions WHERE id = $1",
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
      const regularDateKey = session.rows[0]?.regular_date_key;
      // YYYY-MM-DD 날짜 키는 문자열 비교가 날짜 순서와 같다. 이미 공휴일로 있으면 그대로 둔다
      if (
        typeof regularDateKey === "string" &&
        session.rows[0]?.auto_created === true &&
        options.cancelRegularFromDateKey &&
        regularDateKey >= options.cancelRegularFromDateKey
      ) {
        await transaction.execute({
          sql: `
            INSERT INTO regular_session_skips (date_key, reason, created_at)
            VALUES ($1, 'canceled', $2)
            ON CONFLICT (date_key) DO NOTHING
          `,
          args: [regularDateKey, toUnixTimestampSeconds(new Date())],
        });
      }
      await transaction.commit();
      committed = true;
      return true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }

  private async isRegularSessionSkipped(dateKey: string): Promise<boolean> {
    const row = await this.db
      .select({ dateKey: regularSessionSkips.dateKey })
      .from(regularSessionSkips)
      .where(eq(regularSessionSkips.dateKey, dateKey))
      .limit(1)
      .then(firstRow);
    return row !== undefined;
  }

  private async isRegularSessionHoliday(dateKey: string): Promise<boolean> {
    const row = await this.db
      .select({ dateKey: regularSessionSkips.dateKey })
      .from(regularSessionSkips)
      .where(
        and(
          eq(regularSessionSkips.dateKey, dateKey),
          eq(regularSessionSkips.reason, "holiday"),
        ),
      )
      .limit(1)
      .then(firstRow);
    return row !== undefined;
  }

  /** from 이상 to 미만 날짜 키의 정기 회차 제외 날짜(날짜 오름차순) */
  async findRegularSessionSkips(
    fromDateKey: string,
    toDateKey: string,
  ): Promise<RegularSessionSkip[]> {
    const rows: Array<{ dateKey: string; reason: string }> = await this.db
      .select({
        dateKey: regularSessionSkips.dateKey,
        reason: regularSessionSkips.reason,
      })
      .from(regularSessionSkips)
      .where(
        and(
          gte(regularSessionSkips.dateKey, fromDateKey),
          lt(regularSessionSkips.dateKey, toDateKey),
        ),
      )
      .orderBy(asc(regularSessionSkips.dateKey));
    return rows.map((row) => ({
      dateKey: row.dateKey,
      reason: row.reason as RegularSessionSkipReason,
    }));
  }

  /** 공휴일 날짜를 남긴다. 이미 있는 날짜(취소 포함)는 그대로 둔다 */
  async addRegularSessionHolidays(dateKeys: string[]): Promise<void> {
    const uniqueDateKeys = [...new Set(dateKeys)];
    if (uniqueDateKeys.some((dateKey) => !REGULAR_DATE_KEY_PATTERN.test(dateKey))) {
      throw new Error("유효한 공휴일 날짜가 필요합니다.");
    }
    if (uniqueDateKeys.length === 0) {
      return;
    }
    const createdAt = new Date();
    await this.db
      .insert(regularSessionSkips)
      .values(
        uniqueDateKeys.map((dateKey) => ({
          dateKey,
          reason: "holiday",
          createdAt,
        })),
      )
      .onConflictDoNothing();
  }

  /**
   * 그 날짜들의 정기 세션 중 참여자와 경기가 모두 없는 세션을 지운다(문장 하나).
   * 지운 세션의 id와 날짜 키를 돌려준다.
   */
  async deleteEmptyRegularSessions(
    dateKeys: string[],
  ): Promise<Array<{ id: string; dateKey: string }>> {
    const uniqueDateKeys = [...new Set(dateKeys)];
    if (uniqueDateKeys.length === 0) {
      return [];
    }
    const result: RawQueryResult = await this.client.execute({
      sql: `
        DELETE FROM match_sessions s
        WHERE s.regular_date_key IN (${placeholders(uniqueDateKeys.length)})
          AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.session_id = s.id)
          AND NOT EXISTS (
            SELECT 1 FROM match_session_participants p WHERE p.session_id = s.id
          )
        RETURNING s.id, s.regular_date_key
      `,
      args: uniqueDateKeys,
    });
    return result.rows
      .map((row) => ({
        id: String(row.id),
        dateKey: String(row.regular_date_key),
      }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }

  /** 세션 행의 이름·장소·시각·시작/종료 시각을 고친다. 없으면 undefined. (name, date) 유니크 위반은 그대로 던진다 */
  async updateSession(
    sessionId: string,
    data: UpdateSessionInput,
  ): Promise<ManagedMatchSession | undefined> {
    if (!isEntityId(sessionId, "session")) {
      return undefined;
    }
    const payload = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    await this.db
      .update(matchSessions)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(matchSessions.id, sessionId));
    return await this.findSessionById(sessionId);
  }

  /**
   * 관리자가 고른 이름·장소로 그 KST 날짜의 직접 만든 정기 세션을 만든다(시각은 18:00~22:00 고정).
   * 정기 쉬는 날에도 만들고 쉬는 날 기록은 남긴다(지워도 자동 생성이 다시 만들지 않게).
   * 이미 그날 정기 세션이 있거나 공휴일이면 RegularSessionConflictError. (name, date) 유니크 위반은 그대로 던진다
   */
  async createRegularSession(
    dateKey: string,
    input: { name: string; location: string },
  ): Promise<ManagedMatchSession> {
    if (!REGULAR_DATE_KEY_PATTERN.test(dateKey)) {
      throw new Error("유효한 정기 세션 날짜가 필요합니다.");
    }
    if (await this.isRegularSessionHoliday(dateKey)) {
      throw new RegularSessionConflictError(REGULAR_SESSION_HOLIDAY_MESSAGE);
    }
    const existing = await this.db
      .select({ id: matchSessions.id })
      .from(matchSessions)
      .where(eq(matchSessions.regularDateKey, dateKey))
      .limit(1)
      .then(firstRow);
    if (existing) {
      throw new RegularSessionConflictError(REGULAR_SESSION_EXISTS_MESSAGE);
    }

    const now = new Date();
    const id = generateEntityId("session");
    await this.db.insert(matchSessions).values({
      id,
      name: input.name,
      date: kstDateKeyToDate(dateKey, REGULAR_SESSION_START_HOUR),
      location: input.location,
      kind: "regular",
      regularDateKey: dateKey,
      autoCreated: false,
      createdAt: now,
      updatedAt: now,
    });
    const created = await this.findSessionById(id);
    if (!created) {
      throw new Error("정기 세션을 만들지 못했습니다.");
    }
    return created;
  }

  /**
   * 세션 종류를 바꾸고 data의 필드도 같이 고친다(트랜잭션 하나). 없으면 false.
   * - 정기로 바꾸면 그 날짜의 직접 만든 정기 세션(18:00 KST, 시각은 정기 시각)이 된다. 이미 그날 정기 세션이 있거나 공휴일이면 RegularSessionConflictError
   * - 직접 만든 정기에서 바꾸면 그날 00:00 KST·18:00~22:00 세션이 되고 정기 쉬는 날은 남기지 않는다
   * - 자동 정기 세션은 다른 종류로 바꿀 수 없다(RegularSessionConflictError)
   * - data는 종류를 바꾼 뒤 적용한다
   * (name, date) 유니크 위반은 그대로 던진다
   */
  async changeSessionKind(
    sessionId: string,
    kind: MatchSessionKind,
    data: UpdateSessionInput = {},
  ): Promise<boolean> {
    if (!isEntityId(sessionId, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    try {
      const session = await transaction.execute({
        sql: `SELECT kind, regular_date_key, auto_created, "date" FROM match_sessions WHERE id = $1 FOR UPDATE`,
        args: [sessionId],
      });
      const row = session.rows[0];
      if (!row) {
        await transaction.commit();
        committed = true;
        return false;
      }

      const currentKind = toSessionKind({
        kind: String(row.kind),
        regularDateKey: (row.regular_date_key as string | null) ?? null,
      });
      const dateKey =
        typeof row.regular_date_key === "string"
          ? row.regular_date_key
          : toKstDateKey(new Date(Number(row.date) * 1000));
      const updatedAt = toUnixTimestampSeconds(new Date());

      if (currentKind === kind) {
        // 종류는 그대로 두고 data만 적용한다
      } else if (currentKind === "regular" && row.auto_created === true) {
        throw new RegularSessionConflictError(
          AUTO_REGULAR_SESSION_KIND_LOCKED_MESSAGE,
        );
      } else if (kind === "regular") {
        const holiday = await transaction.execute({
          sql: "SELECT 1 FROM regular_session_skips WHERE date_key = $1 AND reason = 'holiday'",
          args: [dateKey],
        });
        if (holiday.rows.length) {
          throw new RegularSessionConflictError(REGULAR_SESSION_HOLIDAY_MESSAGE);
        }
        const existing = await transaction.execute({
          sql: "SELECT 1 FROM match_sessions WHERE regular_date_key = $1",
          args: [dateKey],
        });
        if (existing.rows.length) {
          throw new RegularSessionConflictError(REGULAR_SESSION_EXISTS_MESSAGE);
        }
        await transaction.execute({
          sql: `
            UPDATE match_sessions
            SET kind = 'regular', regular_date_key = $2, auto_created = false,
                "date" = $3, start_time = NULL, end_time = NULL, updated_at = $4
            WHERE id = $1
          `,
          args: [
            sessionId,
            dateKey,
            toUnixTimestampSeconds(
              kstDateKeyToDate(dateKey, REGULAR_SESSION_START_HOUR),
            ),
            updatedAt,
          ],
        });
      } else if (currentKind === "regular") {
        // 정기 시각을 저장해 바꾼 뒤에도 같은 시간대 세션으로 남긴다
        await transaction.execute({
          sql: `
            UPDATE match_sessions
            SET kind = $2, regular_date_key = NULL, "date" = $3,
                start_time = $4, end_time = $5, updated_at = $6
            WHERE id = $1
          `,
          args: [
            sessionId,
            kind,
            toUnixTimestampSeconds(kstDateKeyToDate(dateKey)),
            REGULAR_SESSION_START_TIME,
            REGULAR_SESSION_END_TIME,
            updatedAt,
          ],
        });
      } else {
        await transaction.execute({
          sql: "UPDATE match_sessions SET kind = $2, updated_at = $3 WHERE id = $1",
          args: [sessionId, kind, updatedAt],
        });
      }

      const values: Array<[string, unknown]> = [
        ["name", data.name],
        ["location", data.location],
        [
          '"date"',
          data.date === undefined
            ? undefined
            : toUnixTimestampSeconds(data.date),
        ],
        ["start_time", data.startTime],
        ["end_time", data.endTime],
      ];
      const columns = values.filter(([, value]) => value !== undefined);
      if (columns.length) {
        await transaction.execute({
          sql: `
            UPDATE match_sessions
            SET ${columns.map(([column], index) => `${column} = $${index + 2}`).join(", ")},
                updated_at = $${columns.length + 2}
            WHERE id = $1
          `,
          args: [sessionId, ...columns.map(([, value]) => value), updatedAt],
        });
      }
      await transaction.commit();
      committed = true;
      return true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }

  /** 세션들의 대회 최종 순위(세션·순위 오름차순, 순위 안은 고른 순서) */
  async findSessionPlacements(
    sessionIds: string[],
  ): Promise<StoredSessionPlacement[]> {
    if (!sessionIds.length) return [];
    const rows: Array<{
      sessionId: string;
      place: number;
      playerId: string;
      username: string;
      avatarUrl: string | null;
    }> = await this.db
      .select({
        sessionId: matchSessionPlacements.sessionId,
        place: matchSessionPlacements.place,
        playerId: players.id,
        username: players.username,
        avatarUrl: players.avatarUrl,
      })
      .from(matchSessionPlacements)
      .innerJoin(players, eq(players.id, matchSessionPlacements.playerId))
      .where(inArray(matchSessionPlacements.sessionId, sessionIds))
      .orderBy(
        asc(matchSessionPlacements.sessionId),
        asc(matchSessionPlacements.place),
        asc(matchSessionPlacements.position),
      );

    const placements: StoredSessionPlacement[] = [];
    for (const row of rows) {
      let last = placements.at(-1);
      if (!last || last.sessionId !== row.sessionId || last.place !== row.place) {
        last = { sessionId: row.sessionId, place: Number(row.place), players: [] };
        placements.push(last);
      }
      last.players.push({
        id: row.playerId,
        username: row.username,
        avatarUrl: row.avatarUrl ?? undefined,
      });
    }
    return placements;
  }

  /** 세션들의 라운드 있는 완료 경기(팀 선수 id·점수만) */
  async findCompletedRoundMatches(
    sessionIds: string[],
  ): Promise<StoredRoundMatch[]> {
    if (!sessionIds.length) return [];
    const matchRows: Array<{ id: string; sessionId: string; round: number }> =
      await this.db
        .select({
          id: matches.id,
          sessionId: matches.sessionId,
          round: matches.round,
        })
        .from(matches)
        .where(
          and(
            inArray(matches.sessionId, sessionIds),
            eq(matches.status, "completed"),
            isNotNull(matches.round),
          ),
        );
    if (!matchRows.length) return [];

    const matchIds = matchRows.map((row) => row.id);
    const [participantRows, scoreRows]: [
      Array<{ matchId: string; teamIndex: number; playerId: string }>,
      Array<{ matchId: string; scoreA: number; scoreB: number }>,
    ] = await Promise.all([
      this.db
        .select({
          matchId: matchParticipants.matchId,
          teamIndex: matchParticipants.teamIndex,
          playerId: matchParticipants.playerId,
        })
        .from(matchParticipants)
        .where(inArray(matchParticipants.matchId, matchIds)),
      this.db
        .select({
          matchId: matchScores.matchId,
          scoreA: matchScores.scoreA,
          scoreB: matchScores.scoreB,
        })
        .from(matchScores)
        .where(inArray(matchScores.matchId, matchIds))
        .orderBy(asc(matchScores.id)),
    ]);
    const participantsByMatch = groupByMatchId(participantRows);
    const scoresByMatch = groupByMatchId(scoreRows);

    return matchRows.map((row) => {
      const teams: StoredRoundMatch["teams"] = [
        { players: [] },
        { players: [] },
      ];
      for (const participant of participantsByMatch.get(row.id) ?? []) {
        if (participant.teamIndex !== 0 && participant.teamIndex !== 1) continue;
        teams[participant.teamIndex].players.push({
          id: participant.playerId,
        });
      }
      return {
        sessionId: row.sessionId,
        status: "completed",
        round: Number(row.round),
        teams,
        scores: (scoresByMatch.get(row.id) ?? []).map(({ scoreA, scoreB }) => ({
          scoreA: Number(scoreA),
          scoreB: Number(scoreB),
        })),
      };
    });
  }

  /**
   * 세션의 대회 최종 순위를 통째로 바꾼다(한 트랜잭션). 세션이 없으면 false.
   * 검증(대회 세션·참여자·중복)은 호출부가 한다
   */
  async replaceSessionPlacements(
    sessionId: string,
    placements: { place: number; playerIds: string[] }[],
  ): Promise<boolean> {
    if (!isEntityId(sessionId, "session")) {
      throw new Error("유효한 세션 ID가 필요합니다.");
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    try {
      const session = await transaction.execute({
        sql: "SELECT id FROM match_sessions WHERE id = $1 FOR UPDATE",
        args: [sessionId],
      });
      if (!session.rows.length) {
        await transaction.commit();
        committed = true;
        return false;
      }

      await transaction.execute({
        sql: "DELETE FROM match_session_placements WHERE session_id = $1",
        args: [sessionId],
      });
      const rows = placements.flatMap(({ place, playerIds }) =>
        playerIds.map((playerId, position) => [
          sessionId,
          playerId,
          place,
          position,
        ]),
      );
      if (rows.length) {
        await transaction.execute({
          sql: `
            INSERT INTO match_session_placements (session_id, player_id, place, position)
            VALUES ${rows.map((_, index) => `(${placeholders(4, index * 4 + 1)})`).join(", ")}
          `,
          args: rows.flat(),
        });
      }
      await transaction.commit();
      committed = true;
      return true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }

  /** 모든 정기 회차 제외 날짜(날짜 내림차순) */
  async findAllRegularSessionSkips(): Promise<RegularSessionSkip[]> {
    const rows: Array<{ dateKey: string; reason: string }> = await this.db
      .select({
        dateKey: regularSessionSkips.dateKey,
        reason: regularSessionSkips.reason,
      })
      .from(regularSessionSkips)
      .orderBy(desc(regularSessionSkips.dateKey));
    return rows.map((row) => ({
      dateKey: row.dateKey,
      reason: row.reason as RegularSessionSkipReason,
    }));
  }

  /**
   * 그 날짜를 정기 쉬는 날(canceled)로 남기고, 그날 자동 정기 세션이 있으면 참여자와 함께 지운다(트랜잭션 하나).
   * 직접 만든 정기 세션은 그대로 둔다.
   * 이미 쉬는 날이면 RegularSessionSkipExistsError, 자동 정기 세션에 경기가 있으면 SessionHasMatchesError를 던지고 아무것도 남기지 않는다.
   * 지운 정기 세션 id를 돌려준다(없었으면 null).
   */
  async addRegularSessionCancellation(
    dateKey: string,
  ): Promise<{ deletedSessionId: string | null }> {
    if (!REGULAR_DATE_KEY_PATTERN.test(dateKey)) {
      throw new Error("유효한 날짜가 필요합니다.");
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    try {
      const inserted = await transaction.execute({
        sql: `
          INSERT INTO regular_session_skips (date_key, reason, created_at)
          VALUES ($1, 'canceled', $2)
          ON CONFLICT (date_key) DO NOTHING
          RETURNING date_key
        `,
        args: [dateKey, toUnixTimestampSeconds(new Date())],
      });
      if (!inserted.rows.length) {
        throw new RegularSessionSkipExistsError();
      }

      const session = await transaction.execute({
        sql: "SELECT id FROM match_sessions WHERE regular_date_key = $1 AND auto_created",
        args: [dateKey],
      });
      const sessionId = session.rows[0]?.id;
      if (sessionId != null) {
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
      }
      await transaction.commit();
      committed = true;
      return { deletedSessionId: sessionId == null ? null : String(sessionId) };
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }

  /** 정기 쉬는 날(canceled)을 지운다. 공휴일은 지우지 않는다. 지웠으면 true */
  async deleteRegularSessionCancellation(dateKey: string): Promise<boolean> {
    const result: RawQueryResult = await this.client.execute({
      sql: `
        DELETE FROM regular_session_skips
        WHERE date_key = $1 AND reason = 'canceled'
        RETURNING date_key
      `,
      args: [dateKey],
    });
    return result.rows.length > 0;
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

  /**
   * 경기들을 공개 계약 형태로 조립한다. 참가자·점수·세션·선수를 경기 수와 상관없이
   * 테이블마다 쿼리 하나로 읽는다(Edge Function CPU 한도 안에서 전체 재계산을 끝내기 위함).
   */
  private async hydrateMatches(
    storedMatches: StoredMatch[],
    executor: any = this.db,
  ): Promise<Match[]> {
    if (storedMatches.length === 0) return [];

    const matchIds = [...new Set(storedMatches.map((match) => match.id))];
    const sessionIds = [
      ...new Set(
        storedMatches
          .map((match) => match.sessionId)
          .filter((sessionId): sessionId is string => Boolean(sessionId)),
      ),
    ];
    const [participantRows, scoreRows, sessionRows] = await Promise.all([
      executor
        .select()
        .from(matchParticipants)
        .where(inArray(matchParticipants.matchId, matchIds))
        .orderBy(matchParticipants.id) as Promise<StoredMatchParticipant[]>,
      executor
        .select()
        .from(matchScores)
        .where(inArray(matchScores.matchId, matchIds))
        .orderBy(matchScores.id) as Promise<StoredMatchScore[]>,
      sessionIds.length > 0
        ? (executor
            .select()
            .from(matchSessions)
            .where(inArray(matchSessions.id, sessionIds)) as Promise<
            StoredMatchSession[]
          >)
        : Promise.resolve([] as StoredMatchSession[]),
    ]);
    const playerIds = [
      ...new Set(participantRows.map((participant) => participant.playerId)),
    ];
    const playerRows: StoredPlayer[] =
      playerIds.length > 0
        ? await executor
            .select()
            .from(players)
            .where(inArray(players.id, playerIds))
        : [];

    const playerById = new Map<string, Player>(
      playerRows.map((player) => [player.id, toPublicPlayer(player)]),
    );
    const sessionById = new Map(
      sessionRows.map((session) => [session.id, session]),
    );
    // id 순으로 읽었으므로 경기별로 묶어도 경기 안의 순서는 id 순이다
    const participantsByMatchId = groupByMatchId(participantRows);
    const scoresByMatchId = groupByMatchId(scoreRows);

    return storedMatches.map((match) => {
      const participants = participantsByMatchId.get(match.id) ?? [];
      const scores = scoresByMatchId.get(match.id) ?? [];
      const session = match.sessionId
        ? sessionById.get(match.sessionId)
        : undefined;
      const teams: [Team, Team] = [0, 1].map((teamIndex) => ({
        id: `${match.id}-team-${teamIndex}`,
        name: `Team ${teamIndex === 0 ? "A" : "B"}`,
        players: participants
          .filter((participant) => participant.teamIndex === teamIndex)
          .map((participant) => {
            const player = playerById.get(participant.playerId);
            const duprRating = parseParticipantDuprSnapshot(
              participant.duprRatingJson,
            );

            return player && duprRating !== undefined
              ? { ...player, duprRating }
              : player;
          })
          .filter((player): player is Player => Boolean(player)),
      })) as [Team, Team];

      return {
        id: match.id,
        type: match.type as MatchType,
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
              ...toSessionKindAndTimes(session),
            }
          : undefined,
        status: match.status as Match["status"],
        teams,
        scores: scores.map(toMatchScore),
        resultSubmittedByPlayerId: match.resultSubmittedByPlayerId ?? null,
        resultSubmittedAt: toDateOrNull(match.resultSubmittedAt),
        location: match.location,
        courtName: match.courtName?.trim() || undefined,
        matchStartsAt: toDate(match.matchStartsAt),
        createdAt: toDate(match.createdAt),
        completedAt: toDateOrNull(match.completedAt),
        updatedAt: toDate(match.updatedAt),
        ratingExcluded: match.ratingExcluded === true,
        round: match.round ?? null,
      } as Match & { sessionName?: string };
    });
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
    return await this.hydrateMatches(storedMatches);
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

  private async ensureSession(
    session: Session,
    kind: NonRegularSessionKind = "custom",
  ): Promise<string> {
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
          kind,
          startTime: session.startTime ?? null,
          endTime: session.endTime ?? null,
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

import type {
  AdminMatchDeletionLog,
  AdminMatchEditLog,
  Match,
  MatchFeedItem,
  MatchScore,
  MatchStatus,
  MatchSessionSummary,
  ManagedMatchSession,
  Session,
} from "@pkpkdupr/shared/match";
import { randomUUID } from "crypto";
import { generateEntityId, isEntityId } from "@pkpkdupr/shared/entityId";
import {
  isMatchSessionKind,
  kstDateKeyToDate,
  toKstDateKey,
  type MatchSessionKind,
} from "@pkpkdupr/shared/session";
import {
  countTournamentUnitRecord,
  type TournamentPlace,
  type TournamentPlacement,
} from "@pkpkdupr/shared/tournament";
import type {
  PlayerRatingChangeLog,
  PlayerRatingHistory,
} from "@pkpkdupr/shared/player";
import {
  MatchNotFoundError,
  MatchRecordUpdateConflictError,
  MatchStaleUpdateError,
  REGULAR_SESSION_EXISTS_MESSAGE,
  RegularSessionConflictError,
  RegularSessionSkipExistsError,
  SessionHasMatchesError,
  type CompletedMatchOutcome,
  type NonRegularSessionKind,
  type CreateMatchInput,
  type RegularSessionSkip,
  type SessionWithParticipantIds,
  type UpdateMatchMetadataInput,
  type UpdateRecordedMatchInput,
  type UpdateSessionInput,
} from "@pkpkdupr/db";
import { db } from "../db";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MATCH_ALREADY_STARTED_MESSAGE = "이미 시작한 경기예요.";
const SESSION_CONFLICT_MESSAGE = "같은 이름의 세션이 이미 있습니다.";

/** 세션 유니크 위반을 409로 바꾼다. 정기 날짜 키 위반(동시에 만든 그날 정기 세션)은 그 안내로 */
const toSessionConflictError = (error: unknown) =>
  new MatchRepositoryError(
    ((error as Error).message ?? "").includes("regular_date_key")
      ? REGULAR_SESSION_EXISTS_MESSAGE
      : SESSION_CONFLICT_MESSAGE,
    409,
  );

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
    // kind가 없는 옛 수정·삭제 기록 스냅샷은 회원 세션으로 본다
    kind: isMatchSessionKind(record.session.kind) ? record.session.kind : "custom",
    startTime: record.session.startTime ?? null,
    endTime: record.session.endTime ?? null,
  };
};

const hydrateStandaloneSession = (record: any): Session => ({
  id: record.id,
  name: record.name,
  date: new Date(record.date),
  location: record.location,
  startTime: record.startTime ?? null,
  endTime: record.endTime ?? null,
});

const hydrateManagedSession = (record: any): ManagedMatchSession => ({
  id: record.id,
  name: record.name,
  date: new Date(record.date),
  location: record.location,
  participantIds: record.participantIds ?? [],
  matchCount: Number(record.matchCount ?? 0),
  kind: isMatchSessionKind(record.kind) ? record.kind : "custom",
  autoCreated: record.autoCreated === true,
  startTime: record.startTime ?? null,
  endTime: record.endTime ?? null,
  completedAt: record.completedAt ? new Date(record.completedAt) : null,
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
  ratingExcluded: record.ratingExcluded === true,
  round: typeof record.round === "number" ? record.round : null,
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

export interface MatchRepositoryOptions {
  /**
   * 세션이 새로 생겼거나 참여자가 바뀌었거나 지워졌을 때 그 세션 id로 부른다(구글 캘린더 반영용).
   * 저장 뒤에 부르며, 여기서 난 예외는 저장소 호출 결과에 영향을 주지 않는다.
   */
  onSessionsChanged?: (sessionIds: string[]) => void;
}

/**
 * MatchRepository - API 서버에서 `@pkpkdupr/db`의 match 저장소를 호출하고,
 * 저장소 예외를 공개 API 상태 코드(MatchRepositoryError.status)로 변환합니다.
 */
export class MatchRepository {
  constructor(private readonly options: MatchRepositoryOptions = {}) {}

  /**
   * onSessionsChanged를 부른다. 이 저장소를 거치지 않고 세션 참여자를 바꾼 쓰기
   * (AuthService.createGuestPlayer의 게스트 생성·참여자 추가)도 저장 뒤 여기로 알린다.
   */
  notifySessionsChanged(sessionIds: Array<string | undefined>) {
    const ids = [
      ...new Set(sessionIds.filter((id): id is string => Boolean(id))),
    ];
    if (ids.length === 0 || !this.options.onSessionsChanged) {
      return;
    }
    try {
      this.options.onSessionsChanged(ids);
    } catch (error) {
      console.error("[MATCH] 세션 변경 알림 실패", ids, error);
    }
  }

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

  /** ID 목록의 경기를 같은 순서로 조회한다. 없는 경기는 빠진다 */
  async findByIds(matchIds: string[]): Promise<Match[]> {
    const found = await Promise.all(
      matchIds.map((matchId) => this.findById(matchId)),
    );
    return found.filter((match): match is Match => Boolean(match));
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
        const created = hydrateMatch(
          await this.run(
            () => db.matches.create(toCreateMatchInput(match)),
            500,
            (error) => (isUniqueViolation(error) ? 409 : undefined),
          ),
        );
        // 세션 정보로 저장하면 그 세션이 새로 만들어질 수 있다(관리자 일괄 등록 등)
        this.notifySessionsChanged([created.session?.id]);
        return created;
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

  /** 세션이 지정된 완료 경기를 저장소의 단일 transaction으로 생성한다. */
  async createCompletedBatch(matches: NewMatchInput[]): Promise<Match[]> {
    const inputs = matches.map(toCreateMatchInput);
    if (inputs.length === 0) {
      throw new MatchRepositoryError("한 개 이상의 경기가 필요합니다.", 400);
    }
    const created = await this.run(
      () => db.matches.createCompletedBatch(inputs),
      400,
      (error) => (isUniqueViolation(error) ? 409 : undefined),
    );
    const hydrated = created.map(hydrateMatch);
    this.notifySessionsChanged(hydrated.map((match) => match.session?.id));
    return hydrated;
  }

  /**
   * 세션을 만든다. `conflictOnDuplicate`면 `(name, date)` 유니크 위반을 DB 원문 대신
   * 안내 메시지의 409로 바꾼다. 회원 세션은 시작 시각과 상관없이 `date`가 그날 00:00 KST라 같은 날 같은 이름이 대상이다.
   */
  async createSession(
    session: Omit<Session, "id"> & { id?: string },
    options: { conflictOnDuplicate?: boolean; kind?: NonRegularSessionKind } = {},
  ): Promise<Session> {
    let created;
    try {
      created = await this.run(
        () =>
          db.matches.createSession(
            {
              ...session,
              id: session.id ?? generateEntityId("session"),
              date: new Date(session.date),
            },
            options.kind,
          ),
        400,
      );
    } catch (error) {
      if (options.conflictOnDuplicate && isUniqueViolation(error)) {
        throw new MatchRepositoryError(SESSION_CONFLICT_MESSAGE, 409);
      }
      throw error;
    }
    const stored = hydrateStandaloneSession(created);
    this.notifySessionsChanged([stored.id]);
    return stored;
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

  /**
   * 그 KST 날짜의 정기 세션을 찾거나 만든다. 같은 날짜에 하나만 존재한다.
   * 세션이 없고 그 날짜가 공휴일·정기 쉬는 날이면 만들지 않고 undefined를 돌려준다. 새로 만든 세션은 자동 정기 세션이다.
   * 이 호출이 새로 만들었을 때만 세션 변경을 알린다(이미 있던 세션 조회는 알리지 않음).
   */
  async findOrCreateRegularSession(
    dateKey: string,
  ): Promise<ManagedMatchSession | undefined> {
    return (await this.ensureRegularSession(dateKey))?.session;
  }

  /**
   * 정기 세션을 완료한다. 완료할 수 없는 세션(정기 세션이 아니거나 종료 전·자동 완료 뒤)이면 409,
   * 이미 완료된 세션이면 그대로 돌려준다(동시에 눌러도 처음 완료 시각이 남는다). 없으면 404
   */
  async completeRegularSession(
    sessionId: string,
    now: Date,
  ): Promise<ManagedMatchSession> {
    const result = await this.run(
      () => db.matches.completeRegularSession(sessionId, now),
      500,
    );
    if (!result) {
      throw new MatchRepositoryError("세션을 찾을 수 없습니다.", 404);
    }
    const session = hydrateManagedSession(result.session);
    if (!result.updated && !session.completedAt) {
      throw new MatchRepositoryError("지금은 세션을 완료할 수 없어요.", 409);
    }
    return session;
  }

  /** findOrCreateRegularSession과 같고, 이 호출이 새로 만들었는지(created)도 돌려준다 */
  async ensureRegularSession(
    dateKey: string,
  ): Promise<{ session: ManagedMatchSession; created: boolean } | undefined> {
    const result = await this.run(
      () => db.matches.findOrCreateRegularSession(dateKey),
      500,
    );
    if (!result) {
      return undefined;
    }
    const session = hydrateManagedSession(result.session);
    if (result.created) {
      this.notifySessionsChanged([session.id]);
    }
    return { session, created: result.created };
  }

  /** from 이상 to 미만 KST 날짜 키의 정기 회차 제외 날짜(공휴일·정기 쉬는 날) */
  async findRegularSessionSkips(
    fromDateKey: string,
    toDateKey: string,
  ): Promise<RegularSessionSkip[]> {
    return await this.run(
      () => db.matches.findRegularSessionSkips(fromDateKey, toDateKey),
      500,
    );
  }

  /** 공휴일 날짜를 남긴다. 이미 있는 날짜는 그대로 둔다 */
  async addRegularSessionHolidays(dateKeys: string[]): Promise<void> {
    await this.run(() => db.matches.addRegularSessionHolidays(dateKeys), 500);
  }

  /** 그 날짜들의 빈 정기 세션(참여자·경기 없음)을 지우고 지운 날짜 키를 돌려준다 */
  async deleteEmptyRegularSessions(dateKeys: string[]): Promise<string[]> {
    const deleted = await this.run(
      () => db.matches.deleteEmptyRegularSessions(dateKeys),
      500,
    );
    this.notifySessionsChanged(deleted.map((session) => session.id));
    return deleted.map((session) => session.dateKey);
  }

  /** 세션을 고친다. 없으면 404, 같은 날 같은 이름이 있으면 409 */
  async updateSession(
    sessionId: string,
    input: UpdateSessionInput,
  ): Promise<ManagedMatchSession> {
    let updated;
    try {
      updated = await this.run(
        () => db.matches.updateSession(sessionId, input),
        400,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new MatchRepositoryError(SESSION_CONFLICT_MESSAGE, 409);
      }
      throw error;
    }
    if (!updated) {
      throw new MatchRepositoryError("세션을 찾을 수 없습니다.", 404);
    }
    this.notifySessionsChanged([sessionId]);
    return hydrateManagedSession(updated);
  }

  /**
   * 관리자가 고른 이름·장소로 그 날짜의 직접 만든 정기 세션을 만든다(정기 쉬는 날이어도 만들고 쉬는 날은 남긴다).
   * 이미 그날 정기 세션이 있거나 공휴일, 같은 날 같은 이름이 있으면 409
   */
  async createRegularSession(
    dateKey: string,
    input: { name: string; location: string },
  ): Promise<ManagedMatchSession> {
    let created;
    try {
      created = await this.run(
        () => db.matches.createRegularSession(dateKey, input),
        500,
        (error) =>
          error instanceof RegularSessionConflictError ? 409 : undefined,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw toSessionConflictError(error);
      }
      throw error;
    }
    const session = hydrateManagedSession(created);
    this.notifySessionsChanged([session.id]);
    return session;
  }

  /**
   * 세션 종류를 바꾸고 input 필드도 같이 고친다. 없으면 404.
   * 정기로 바꿀 수 없는 날짜(그날 정기 세션이 있거나 공휴일), 자동 정기 세션의 종류 변경, 같은 날 같은 이름이면 409.
   * 직접 만든 정기에서 바꿔도 정기 쉬는 날은 남지 않는다
   */
  async changeSessionKind(
    sessionId: string,
    kind: MatchSessionKind,
    input: UpdateSessionInput,
  ): Promise<ManagedMatchSession> {
    let changed;
    try {
      changed = await this.run(
        () => db.matches.changeSessionKind(sessionId, kind, input),
        500,
        (error) =>
          error instanceof RegularSessionConflictError ? 409 : undefined,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw toSessionConflictError(error);
      }
      throw error;
    }
    const updated = changed ? await this.findSessionById(sessionId) : undefined;
    if (!updated) {
      throw new MatchRepositoryError("세션을 찾을 수 없습니다.", 404);
    }
    this.notifySessionsChanged([sessionId]);
    return updated;
  }

  /**
   * 세션별 대회 최종 순위(순위 오름차순). 순위 없는 세션은 결과에 없다.
   * record는 그 세션의 라운드 있는 완료 경기로 센 참가 단위 승패다
   */
  async findTournamentPlacements(
    sessionIds: string[],
  ): Promise<Map<string, TournamentPlacement[]>> {
    const result = new Map<string, TournamentPlacement[]>();
    if (!sessionIds.length) return result;
    const placements = await this.run(
      () => db.matches.findSessionPlacements(sessionIds),
      500,
    );
    if (!placements.length) return result;

    const placedSessionIds = [
      ...new Set(placements.map((placement) => placement.sessionId)),
    ];
    const roundMatches = await this.run(
      () => db.matches.findCompletedRoundMatches(placedSessionIds),
      500,
    );
    const matchesBySession = new Map<string, typeof roundMatches>();
    for (const match of roundMatches) {
      const list = matchesBySession.get(match.sessionId) ?? [];
      list.push(match);
      matchesBySession.set(match.sessionId, list);
    }
    for (const placement of placements) {
      const sessionMatches = matchesBySession.get(placement.sessionId) ?? [];
      const list = result.get(placement.sessionId) ?? [];
      list.push({
        place: placement.place as TournamentPlace,
        players: placement.players,
        record: countTournamentUnitRecord(
          placement.players.map((player) => player.id),
          sessionMatches,
        ),
      });
      result.set(placement.sessionId, list);
    }
    return result;
  }

  /** 세션의 대회 최종 순위를 통째로 바꾼다. 세션이 없으면 404 */
  async replaceSessionPlacements(
    sessionId: string,
    placements: { place: TournamentPlace; playerIds: string[] }[],
  ): Promise<void> {
    const replaced = await this.run(
      () => db.matches.replaceSessionPlacements(sessionId, placements),
      500,
    );
    if (!replaced) {
      throw new MatchRepositoryError("세션을 찾을 수 없습니다.", 404);
    }
  }

  /** 모든 정기 회차 제외 날짜(날짜 내림차순) */
  async findAllRegularSessionSkips(): Promise<RegularSessionSkip[]> {
    return await this.run(() => db.matches.findAllRegularSessionSkips(), 500);
  }

  /**
   * 그 날짜를 정기 쉬는 날로 남기고 그날 자동 정기 세션을 참여자와 함께 지운다(직접 만든 정기 세션은 그대로).
   * 이미 쉬는 날이거나 자동 정기 세션에 경기가 있으면 409
   */
  async addRegularSessionCancellation(dateKey: string): Promise<void> {
    const { deletedSessionId } = await this.run(
      () => db.matches.addRegularSessionCancellation(dateKey),
      500,
      (error) =>
        error instanceof RegularSessionSkipExistsError ||
        error instanceof SessionHasMatchesError
          ? 409
          : undefined,
    );
    this.notifySessionsChanged([deletedSessionId ?? undefined]);
  }

  /** 정기 쉬는 날을 지운다(공휴일은 지우지 않음). 지웠으면 true */
  async deleteRegularSessionCancellation(dateKey: string): Promise<boolean> {
    return await this.run(
      () => db.matches.deleteRegularSessionCancellation(dateKey),
      500,
    );
  }

  /** 참여자를 추가한다. 이미 있으면 무시한다(동시 호출에도 덮어쓰지 않음) */
  async addSessionParticipants(
    sessionId: string,
    playerIds: string[],
  ): Promise<void> {
    const added = await this.run(
      () => db.matches.addSessionParticipants(sessionId, playerIds),
      500,
    );
    if (added) {
      this.notifySessionsChanged([sessionId]);
    }
  }

  /** 참여자 한 명을 뺀다. 참여 중이 아니어도 성공한다(멱등) */
  async removeSessionParticipant(
    sessionId: string,
    playerId: string,
  ): Promise<void> {
    const removed = await this.run(
      () => db.matches.removeSessionParticipant(sessionId, playerId),
      500,
    );
    if (removed) {
      this.notifySessionsChanged([sessionId]);
    }
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

  /** 날짜 키가 [fromDateKey, toDateKey)인 세션을 시각 오름차순으로 돌려준다 */
  async findSessionsInDateKeyRange(
    fromDateKey: string,
    toDateKey: string,
  ): Promise<ManagedMatchSession[]> {
    const records = await this.run(
      () =>
        db.matches.findSessionsInRange(
          kstDateKeyToDate(fromDateKey),
          kstDateKeyToDate(toDateKey),
        ),
      500,
    );
    return records.map(hydrateManagedSession);
  }

  /** 그 KST 날짜 0시 이후의 세션을 시각 오름차순으로 돌려준다 */
  async findSessionsFromDateKey(
    dateKey: string,
  ): Promise<ManagedMatchSession[]> {
    const from = kstDateKeyToDate(dateKey);
    const records = await this.run(
      () => db.matches.findSessionsFrom(from),
      500,
    );
    return records.map(hydrateManagedSession);
  }

  /**
   * 조회 시점 정리. 시작 후 2시간이 지나도록 점수 없는 진행 중 경기를 먼저 삭제하고,
   * 그 결과 경기가 없어진 세션까지 포함해 만료된 빈 세션을 삭제한다(단일 SQL 문, DB 왕복 1회).
   * best-effort라 실패는 로그만 남기고 호출부 조회를 막지 않는다.
   */
  async cleanupExpired(now: Date = new Date()): Promise<void> {
    try {
      const { deletedSessionIds } =
        await db.matches.deleteExpiredInProgressMatchesAndEmptySessions(now);
      this.notifySessionsChanged(deletedSessionIds);
    } catch (error) {
      console.error("[MATCH] 만료된 진행 중 경기·빈 세션 정리 실패", error);
    }
  }

  /** 만료되지 않은 진행 중(점수 없는 created) 경기의 선수 id */
  async findInProgressPlayerIds(now: Date = new Date()): Promise<string[]> {
    return await this.run(
      () => db.matches.findInProgressPlayerIds(now),
      500,
    );
  }

  /**
   * 점수 없는 진행 중 경기를 만든다(세션 참여자 추가 포함).
   * 선수 중 누구든 이미 진행 중 경기에 있으면 아무것도 만들지 않고 겹치는 첫 선수 id를 돌려준다.
   */
  async createInProgress(
    match: NewMatchInput,
    now: Date,
  ): Promise<{ match: Match } | { conflictPlayerId: string }> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const result = await this.run(
          () =>
            db.matches.createInProgressMatch(toCreateMatchInput(match), now),
          500,
          (error) => (isUniqueViolation(error) ? 409 : undefined),
        );
        if (result.conflictPlayerId !== undefined) {
          return { conflictPlayerId: result.conflictPlayerId };
        }
        const created = hydrateMatch(result.match);
        if (result.sessionParticipantsAdded) {
          this.notifySessionsChanged([created.session?.id]);
        }
        return { match: created };
      } catch (error) {
        // 생성한 경기 id가 겹친 경우만 새 id로 다시 시도한다.
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

    throw new MatchRepositoryError("매치 ID 생성에 실패했습니다.", 500);
  }

  /**
   * 대진 예정 경기를 진행 중(created, matchStartsAt=now)으로 바꾼다. 진행 중 경기 시작과 같은 잠금 안에서 확인한다.
   * 경기 없음 404, 예정 경기가 아니면 409. 선수가 이미 진행 중 경기에 있으면 바꾸지 않고 그 선수 id를 돌려준다.
   */
  async startScheduled(
    matchId: string,
    now: Date,
  ): Promise<{ match: Match } | { conflictPlayerId: string }> {
    const result = await this.run(
      () => db.matches.startScheduledMatch(matchId, now),
      500,
    );
    if ("match" in result) {
      return { match: hydrateMatch(result.match) };
    }
    if (result.reason === "player_busy") {
      return { conflictPlayerId: result.conflictPlayerId };
    }
    throw result.reason === "not_found"
      ? new MatchRepositoryError("매치를 찾을 수 없습니다.", 404)
      : new MatchRepositoryError(MATCH_ALREADY_STARTED_MESSAGE, 409);
  }

  /** 세션과 상관없이 지금 진행 중인(만료 전, 시작한, 점수 없는) 경기 */
  async findInProgress(now: Date = new Date()): Promise<Match[]> {
    const records = await this.run(
      () => db.matches.findInProgressMatches(now),
      500,
    );
    return records.map(hydrateMatch);
  }

  /** 경기가 없는 세션을 지운다. 오늘(now, KST)·미래 자동 정기 세션이면 그 날짜를 정기 쉬는 날로 남겨 다시 만들지 않는다 */
  async deleteSession(
    sessionId: string,
    now: Date = new Date(),
  ): Promise<void> {
    if (!isEntityId(sessionId, "session")) {
      throw new MatchRepositoryError("유효한 세션 ID가 필요합니다.", 400);
    }
    const deleted = await this.run(
      () =>
        db.matches.deleteSession(sessionId, {
          cancelRegularFromDateKey: toKstDateKey(now),
        }),
      400,
      (error) => (error instanceof SessionHasMatchesError ? 409 : undefined),
    );
    if (!deleted) {
      throw new MatchRepositoryError("세션을 찾을 수 없습니다.", 404);
    }
    this.notifySessionsChanged([sessionId]);
  }

  /**
   * 경기 기록 수정(관리자의 세션·시작 시각 정정 포함). 그사이 지워졌으면 404, expectedUpdatedAt이 저장된 값과 다르거나
   * cancelled 등 수정할 수 없는 상태로 바뀌었으면 409, 옮길 세션이 없으면 400으로 응답한다.
   */
  async updateRecordedMatch(
    matchId: string,
    input: UpdateRecordedMatchInput,
  ): Promise<Match> {
    const updated = await this.run(
      () => db.matches.updateRecordedMatch(matchId, input),
      400,
      (error) =>
        error instanceof MatchNotFoundError
          ? 404
          : error instanceof MatchRecordUpdateConflictError ||
              error instanceof MatchStaleUpdateError
            ? 409
            : undefined,
    );

    return hydrateMatch(updated);
  }

  /** 경기 삭제 감사 로그. 지운 시각 내림차순이고 match는 지운 시점의 경기 스냅샷이다 */
  async findDeletionLogs(): Promise<
    Array<Omit<AdminMatchDeletionLog, "deletedByUsername">>
  > {
    const logs = await this.run(() => db.matchDeletionLogs.findAll(), 500);
    return logs.map((log) => ({
      id: log.id,
      matchId: log.matchId,
      deletedAt: new Date(log.deletedAt),
      deletedByPlayerId: log.deletedByPlayerId,
      deletedByAdmin: log.deletedByAdmin,
      match: hydrateMatch(log.matchSnapshot),
    }));
  }

  /** 완료 경기 수정 감사 로그. 고친 시각 내림차순이고 before·after는 고치기 전·후 경기 스냅샷이다 */
  async findEditLogs(): Promise<
    Array<Omit<AdminMatchEditLog, "editedByUsername">>
  > {
    const logs = await this.run(() => db.matchEditLogs.findAll(), 500);
    return logs.map((log) => ({
      id: log.id,
      matchId: log.matchId,
      editedAt: new Date(log.editedAt),
      editedByPlayerId: log.editedByPlayerId,
      editedByAdmin: log.editedByAdmin,
      before: hydrateMatch(log.beforeSnapshot),
      after: hydrateMatch(log.afterSnapshot),
    }));
  }

  /**
   * 경기를 지우고 감사 로그를 남긴다. 이미 지워졌으면 404(notFoundMessage),
   * expectedUpdatedAt이 저장된 값과 다르면 409로 응답한다.
   * 반환하는 status는 실제로 지운 행의 상태라 평점 재계산 여부는 이 값으로 정한다.
   */
  async deleteRecorded(
    matchId: string,
    input: {
      deletedByPlayerId: string;
      deletedByAdmin: boolean;
      expectedUpdatedAt?: Date;
      notFoundMessage?: string;
    },
  ): Promise<{ status: MatchStatus; match: Match }> {
    const { notFoundMessage, ...deleteInput } = input;
    try {
      const deleted = await db.matches.deleteRecordedMatch(matchId, {
        ...deleteInput,
        logId: `match-deletion-${randomUUID()}`,
        deletedAt: new Date(),
      });
      return { status: deleted.status, match: hydrateMatch(deleted.match) };
    } catch (error) {
      if (error instanceof MatchNotFoundError) {
        throw new MatchRepositoryError(
          notFoundMessage ?? error.message,
          404,
        );
      }
      if (error instanceof MatchStaleUpdateError) {
        throw new MatchRepositoryError(error.message, 409);
      }
      throw toRepositoryError(error, 500);
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

  /** 전체 rating 변동 로그(최신순) */
  async getAllRatingChangeLogs(): Promise<PlayerRatingChangeLog[]> {
    const records = await this.run(
      () => db.playerRatingChangeLogs.findAll(),
      500,
    );
    return (records ?? []).map(hydrateRatingChangeLog);
  }

  /** 랭킹·세션 리포트 계산용 완료 경기 요약 */
  async findCompletedMatchOutcomes(): Promise<CompletedMatchOutcome[]> {
    return await this.run(() => db.matches.findCompletedMatchOutcomes(), 500);
  }

  /** 모든 세션과 참여자 id(세션 날짜 내림차순) */
  async findSessionsWithParticipantIds(): Promise<SessionWithParticipantIds[]> {
    return await this.run(
      () => db.matches.findSessionsWithParticipantIds(),
      500,
    );
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

  /** 모든 경기 목록. 대진 예정 경기(scheduled)는 includeScheduled일 때만(관리자 경기 목록) 넣는다 */
  async findAll(
    page: number = 0,
    limit: number = 20,
    playerId?: string,
    options: { includeScheduled?: boolean } = {},
  ): Promise<{ matches: Match[]; total: number }> {
    const result = await this.run(
      () => db.matches.findAll(page, limit, playerId || undefined, options),
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

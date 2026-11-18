import { createHash } from "node:crypto";
import { isEntityId } from "@pkpkdupr/shared/entityId";
import {
  getKstWeekday,
  getRegularSessionName,
  isRegularSessionTime,
  kstDateKeyToDate,
  REGULAR_SESSION_LOCATION,
  REGULAR_SESSION_START_HOUR,
  REGULAR_SESSION_WEEKDAYS,
  toKstDateKey,
} from "@pkpkdupr/shared/session";
import type { DumpRow, DumpTables, DumpValue } from "./parseDump";

/**
 * v0.12.7 MySQL 덤프 행을 지금 Supabase 스키마의 행으로 바꾼다. DB에 쓰지 않는 순수 함수다.
 * 시각은 덤프와 같은 epoch 초, id는 덤프 값을 그대로 쓴다.
 */

export type TargetRow = Record<string, DumpValue | boolean>;

/** 대상 테이블과 넣는 순서. 외래 키가 있는 player_admins는 players 뒤에 넣는다 */
export const TARGET_TABLES = [
  "players",
  "player_creation_logs",
  "player_status_change_logs",
  "official_dupr_adjustment_logs",
  "player_rating_change_logs",
  "match_sessions",
  "match_session_participants",
  "matches",
  "match_scores",
  "match_participants",
  "player_admins",
] as const;
export type TargetTable = (typeof TARGET_TABLES)[number];

/** 덤프에 있지만 옮기지 않는 테이블과 이유 */
export const SKIPPED_DUMP_TABLES: Record<string, string> = {
  __pkpkdupr_migrations: "MySQL 마이그레이션 기록. 스키마는 supabase/migrations가 기준이다",
  match_result_approvals: "결과 합의 단계가 없어져 지금 스키마에 테이블이 없다",
  player_rating_chart_points: "차트 캐시. 조회 때 다시 만든다",
  player_rating_chart_projections: "차트 캐시. 조회 때 다시 만든다",
};

/** 덤프 평점 로그 중 그대로 옮기는 source. 나머지는 재계산이 다시 만든다 */
const COPIED_RATING_LOG_SOURCES = new Set(["official_adjustment_recalculation"]);

/** 옛 서비스에서 날짜별로 만든 정기운동 세션 이름. 예 "9/14 정기운동" */
const LEGACY_REGULAR_SESSION_NAME = /^\d{1,2}\/\d{1,2} 정기운동$/;

export interface ImportOptions {
  /** 비운 뒤 player_admins에 넣을 회원 아이디(대소문자 무시) */
  adminUsernames: string[];
  /** player_admins.created_at(epoch 초) */
  nowSeconds: number;
}

export interface RegularSessionPlan {
  dateKey: string;
  sessionId: string;
  name: string;
  /** 덤프 세션을 바꾼 것이면 원래 이름, 경기만으로 새로 만든 것이면 null */
  legacySessionName: string | null;
  matchCount: number;
  participantCount: number;
}

export interface ImportPlan {
  rows: Record<TargetTable, TargetRow[]>;
  report: {
    dumpCounts: Record<string, number>;
    bootstrapUsernames: string[];
    regularSessions: RegularSessionPlan[];
    customSessionNames: string[];
    /** 세션 경기 선수라서 새로 넣은 세션 참여자 수 */
    addedSessionParticipantCount: number;
    skippedRatingLogCounts: Record<string, number>;
    /** 게임마다 단판 경기로 쪼갠 옛 2선승 경기 수 */
    splitMatchCount: number;
    adminPlayerIds: string[];
  };
}

const str = (row: DumpRow, column: string): string => {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`${column}: 문자열이 필요합니다 (${JSON.stringify(value)})`);
  }
  return value;
};

const num = (row: DumpRow, column: string): number => {
  const value = row[column];
  if (typeof value !== "number") {
    throw new Error(`${column}: 숫자가 필요합니다 (${JSON.stringify(value)})`);
  }
  return value;
};

const pick = (row: DumpRow, columns: string[]): TargetRow =>
  Object.fromEntries(
    columns.map((column) => {
      if (!(column in row)) {
        throw new Error(`덤프 행에 ${column} 컬럼이 없습니다.`);
      }
      return [column, row[column]];
    }),
  );

const toSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

/** 정기 세션 18:00 KST의 epoch 초. 지금 api가 만드는 정기 세션의 date와 같다 */
const regularSessionDateSeconds = (dateKey: string) =>
  toSeconds(kstDateKeyToDate(dateKey, REGULAR_SESSION_START_HOUR));

/**
 * 경기만으로 만드는 정기 세션 id. 날짜에서 정해 다시 돌려도 같은 id가 나온다.
 * 형식은 isEntityId(…, "session")(S + 소문자·숫자 7자)이고, 16진수는 그 문자 집합에 들어간다.
 */
export const buildRegularSessionId = (dateKey: string) =>
  `S${createHash("sha256").update(`regular-session:${dateKey}`).digest("hex").slice(0, 7)}`;

/** epoch 초 시각에 초를 더한다. 레거시 밀리초 값(>= 100,000,000,000)이면 같은 간격을 밀리초로 더한다 */
const addSeconds = (value: DumpValue | boolean, seconds: number): DumpValue | boolean =>
  typeof value === "number" ? value + seconds * (value >= 100_000_000_000 ? 1000 : 1) : value;

/** 점수 행 id 자연 정렬(길이 → 문자열) */
const compareScoreIds = (a: string, b: string) =>
  a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/** 쪼갠 옛 2선승 경기의 k번째 게임(k >= 2) id. 마이그레이션의 'M' || md5('<id>:game:<k>') 7자와 같다 */
export const buildSplitMatchId = (matchId: string, gameNo: number) =>
  `M${createHash("md5").update(`${matchId}:game:${gameNo}`).digest("hex").slice(0, 7)}`;

const groupByMatchId = (rows: TargetRow[]) => {
  const grouped = new Map<string, TargetRow[]>();
  for (const row of rows) {
    const matchId = String(row.match_id);
    const group = grouped.get(matchId);
    if (group) group.push(row);
    else grouped.set(matchId, [row]);
  }
  return grouped;
};

/**
 * 점수가 여러 개인 옛 2선승 경기를 게임마다 단판 경기 하나로 쪼갠다.
 * 규칙은 마이그레이션 20261117120000_split_multi_score_matches.sql과 같다(같은 덤프면 같은 id·시각이 나온다).
 */
export const splitMultiScoreMatches = (
  matches: TargetRow[],
  participants: TargetRow[],
  scores: TargetRow[],
): {
  matches: TargetRow[];
  participants: TargetRow[];
  scores: TargetRow[];
  splitMatchCount: number;
} => {
  const scoresByMatchId = groupByMatchId(scores);
  const participantsByMatchId = groupByMatchId(participants);
  const existingIds = new Set(matches.map((match) => String(match.id)));

  const nextMatches: TargetRow[] = [...matches];
  const nextParticipants: TargetRow[] = [...participants];
  const movedScores = new Map<TargetRow, TargetRow>();
  let splitMatchCount = 0;
  for (const match of matches) {
    const matchId = String(match.id);
    const games = scoresByMatchId.get(matchId) ?? [];
    if (games.length <= 1) continue;
    games.sort((a, b) => compareScoreIds(String(a.id), String(b.id)));
    splitMatchCount += 1;
    games.slice(1).forEach((score, index) => {
      const offset = index + 1;
      const newMatchId = buildSplitMatchId(matchId, offset + 1);
      if (!isEntityId(newMatchId, "match") || existingIds.has(newMatchId)) {
        throw new Error(`${matchId}: 쪼갠 경기의 새 id ${newMatchId}가 경기 id 형식이 아니거나 다른 경기와 겹칩니다.`);
      }
      existingIds.add(newMatchId);
      nextMatches.push({
        ...match,
        id: newMatchId,
        match_starts_at: addSeconds(match.match_starts_at, offset * 600),
        completed_at: addSeconds(match.completed_at, offset),
        result_submitted_at: addSeconds(match.result_submitted_at, offset),
      });
      for (const participant of participantsByMatchId.get(matchId) ?? []) {
        nextParticipants.push({
          ...participant,
          id: `${newMatchId}-team-${String(participant.team_index)}-${String(participant.player_id)}`,
          match_id: newMatchId,
          dupr_rating_json: null,
        });
      }
      movedScores.set(score, { ...score, id: `${newMatchId}-score-1`, match_id: newMatchId });
    });
  }

  return {
    matches: nextMatches,
    participants: nextParticipants,
    scores: scores.map((score) => movedScores.get(score) ?? score),
    splitMatchCount,
  };
};

const requireTable = (tables: DumpTables, table: string): DumpRow[] => {
  const rows = tables[table];
  if (!rows) {
    throw new Error(`덤프에 ${table} 테이블이 없습니다.`);
  }
  return rows;
};

export const buildImportPlan = (
  tables: DumpTables,
  options: ImportOptions,
): ImportPlan => {
  const knownTables = new Set<string>([
    ...TARGET_TABLES,
    ...Object.keys(SKIPPED_DUMP_TABLES),
  ]);
  const unknownTables = Object.keys(tables).filter(
    (table) => !knownTables.has(table),
  );
  if (unknownTables.length > 0) {
    throw new Error(`처리 방법을 정하지 않은 덤프 테이블: ${unknownTables.join(", ")}`);
  }

  const dumpPlayers = requireTable(tables, "players");
  const dumpCreationLogs = requireTable(tables, "player_creation_logs");
  const dumpMatches = requireTable(tables, "matches");
  const dumpSessions = requireTable(tables, "match_sessions");
  const dumpParticipants = requireTable(tables, "match_participants");

  // 부트스트랩 관리자 계정은 경기 생성자·로그 작성자로 참조되므로 지우지 않고 inactive로 옮긴다
  const bootstrapPlayerIds = new Set(
    dumpCreationLogs
      .filter((log) => log.creation_source === "bootstrap")
      .map((log) => str(log, "player_id")),
  );

  const players = dumpPlayers.map((row): TargetRow => ({
    ...pick(row, [
      "id",
      "username",
      "dupr_rating",
      "gender",
      "status",
      "affiliations_json",
      "status_message",
      "status_message_background_color",
      "created_at",
      "updated_at",
    ]),
    status: bootstrapPlayerIds.has(str(row, "id")) ? "inactive" : str(row, "status"),
    // 아바타 파일은 옮기지 않는다. 회원이 새로 올린다
    avatar_url: null,
    // 계정 발급 단계가 연결하고 is_first_login을 켠다
    auth_user_id: null,
    is_first_login: false,
    is_guest: false,
    guest_added_by_player_id: null,
    guest_added_session_id: null,
  }));
  const playerIds = new Set(players.map((player) => String(player.id)));

  const adminPlayerIds = options.adminUsernames.map((username) => {
    const found = dumpPlayers.find(
      (row) => str(row, "username").toLowerCase() === username.toLowerCase(),
    );
    if (!found) {
      throw new Error(`관리자로 넣을 회원 ${username}이 덤프에 없습니다.`);
    }
    if (bootstrapPlayerIds.has(str(found, "id")) || found.status !== "active") {
      throw new Error(`관리자로 넣을 회원 ${username}이 active가 아닙니다.`);
    }
    return str(found, "id");
  });

  // 정기 세션: 옛 "M/D 정기운동" 세션을 바꾸고, 세션 없는 월·목 18~22시 경기를 그날 정기 세션으로 묶는다
  const regularByDateKey = new Map<
    string,
    { sessionId: string; legacySessionName: string | null; createdAt: number; updatedAt: number }
  >();
  for (const session of dumpSessions) {
    const name = str(session, "name");
    if (!LEGACY_REGULAR_SESSION_NAME.test(name)) continue;
    const dateKey = toKstDateKey(new Date(num(session, "date") * 1000));
    if (!REGULAR_SESSION_WEEKDAYS.includes(getKstWeekday(dateKey))) {
      throw new Error(`${name}(${dateKey})은 정기 요일이 아니라 정기 세션으로 바꿀 수 없습니다.`);
    }
    if (regularByDateKey.has(dateKey)) {
      throw new Error(`${dateKey}에 정기운동 세션이 둘 이상입니다.`);
    }
    regularByDateKey.set(dateKey, {
      sessionId: str(session, "id"),
      legacySessionName: name,
      createdAt: num(session, "created_at"),
      updatedAt: num(session, "updated_at"),
    });
  }
  const legacyRegularSessionIds = new Set(
    [...regularByDateKey.values()].map((session) => session.sessionId),
  );

  const dumpSessionIds = new Set(dumpSessions.map((session) => str(session, "id")));
  const backfillDateKeyByMatchId = new Map<string, string>();
  for (const match of dumpMatches) {
    if (match.session_id !== null) continue;
    const startsAt = new Date(num(match, "match_starts_at") * 1000);
    if (!isRegularSessionTime(startsAt)) continue;
    const dateKey = toKstDateKey(startsAt);
    backfillDateKeyByMatchId.set(str(match, "id"), dateKey);
    const createdAt = num(match, "created_at");
    const existing = regularByDateKey.get(dateKey);
    if (!existing) {
      const sessionId = buildRegularSessionId(dateKey);
      if (dumpSessionIds.has(sessionId) || !isEntityId(sessionId, "session")) {
        throw new Error(`${dateKey} 정기 세션 id ${sessionId}를 쓸 수 없습니다.`);
      }
      regularByDateKey.set(dateKey, {
        sessionId,
        legacySessionName: null,
        createdAt,
        updatedAt: createdAt,
      });
    } else if (existing.legacySessionName === null && createdAt < existing.createdAt) {
      existing.createdAt = createdAt;
      existing.updatedAt = createdAt;
    }
  }
  const sortedRegular = [...regularByDateKey].sort(([a], [b]) => a.localeCompare(b));

  const matchSessions: TargetRow[] = [
    ...dumpSessions
      .filter((session) => !legacyRegularSessionIds.has(str(session, "id")))
      .map((session) => ({
        ...pick(session, ["id", "name", "date", "location", "created_at", "updated_at"]),
        kind: "custom",
        regular_date_key: null,
        start_time: null,
        end_time: null,
      })),
    ...sortedRegular.map(([dateKey, session]) => ({
      id: session.sessionId,
      name: getRegularSessionName(dateKey),
      date: regularSessionDateSeconds(dateKey),
      location: REGULAR_SESSION_LOCATION,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      kind: "regular",
      regular_date_key: dateKey,
      start_time: null,
      end_time: null,
    })),
  ];
  const sessionById = new Map(matchSessions.map((session) => [String(session.id), session]));

  const dumpMatchRows = dumpMatches.map((row): TargetRow => {
    const id = str(row, "id");
    if (row.status !== "completed") {
      // 덤프의 경기는 모두 completed다. 다른 상태가 오면 처리 규칙을 정하고 다시 돌린다
      throw new Error(`${id}: completed가 아닌 경기(${String(row.status)})는 옮기지 않습니다.`);
    }
    const backfillDateKey = backfillDateKeyByMatchId.get(id);
    const sessionId = backfillDateKey
      ? regularByDateKey.get(backfillDateKey)!.sessionId
      : (row.session_id as string | null);
    const session = sessionId === null ? null : sessionById.get(sessionId);
    if (session === undefined) {
      throw new Error(`${id}: 없는 세션 ${sessionId}를 참조합니다.`);
    }
    return {
      ...pick(row, [
        "id",
        "type",
        "source",
        "creator_player_id",
        "name",
        "status",
        "location",
        "court_name",
        "match_starts_at",
        "completed_at",
        "result_submitted_by_player_id",
        "result_submitted_at",
        "created_at",
        "updated_at",
      ]),
      session_id: sessionId,
      session_name: session?.name ?? null,
      session_date: session?.date ?? null,
      // 덤프에는 게스트가 없다
      rating_excluded: false,
    };
  });
  const dumpMatchIds = new Set(dumpMatchRows.map((match) => String(match.id)));

  const dumpMatchParticipants = dumpParticipants.map((row): TargetRow => {
    if (!playerIds.has(str(row, "player_id"))) {
      throw new Error(`${str(row, "id")}: 없는 회원 ${str(row, "player_id")}를 참조합니다.`);
    }
    if (!dumpMatchIds.has(str(row, "match_id"))) {
      throw new Error(`${str(row, "id")}: 없는 경기를 참조합니다.`);
    }
    return {
      ...pick(row, ["id", "match_id", "team_index", "player_id"]),
      // 경기 전 평점 스냅샷은 재계산이 지금 산식으로 다시 채운다
      dupr_rating_json: null,
    };
  });

  // 지금은 단판만 있으므로 옛 2선승 경기는 게임마다 경기 하나로 쪼개 넣는다
  const {
    matches,
    participants: matchParticipants,
    scores: matchScores,
    splitMatchCount,
  } = splitMultiScoreMatches(
    dumpMatchRows,
    dumpMatchParticipants,
    requireTable(tables, "match_scores"),
  );
  const matchById = new Map(matches.map((match) => [String(match.id), match]));

  // 세션 참여자: 덤프 참여자 + 세션 경기의 모든 선수(지금 api는 세션 경기 선수를 항상 참여자로 넣는다)
  const sessionParticipants = new Map<string, TargetRow>(
    requireTable(tables, "match_session_participants").map((row) => [
      `${str(row, "session_id")}:${str(row, "player_id")}`,
      row,
    ]),
  );
  const dumpParticipantCount = sessionParticipants.size;
  const matchCountBySessionId = new Map<string, number>();
  for (const match of matches) {
    if (match.session_id === null) continue;
    const sessionId = String(match.session_id);
    matchCountBySessionId.set(sessionId, (matchCountBySessionId.get(sessionId) ?? 0) + 1);
  }
  const participantsByMatchCreatedAt = [...matchParticipants].sort(
    (a, b) =>
      Number(matchById.get(String(a.match_id))!.created_at) -
      Number(matchById.get(String(b.match_id))!.created_at),
  );
  for (const participant of participantsByMatchCreatedAt) {
    const match = matchById.get(String(participant.match_id))!;
    if (match.session_id === null) continue;
    const sessionId = String(match.session_id);
    const playerId = String(participant.player_id);
    const key = `${sessionId}:${playerId}`;
    if (sessionParticipants.has(key)) continue;
    sessionParticipants.set(key, {
      id: `${sessionId}-${playerId}`,
      session_id: sessionId,
      player_id: playerId,
      created_at: Number(match.created_at),
    });
  }
  const participantCountBySessionId = new Map<string, number>();
  for (const participant of sessionParticipants.values()) {
    const sessionId = String(participant.session_id);
    participantCountBySessionId.set(sessionId, (participantCountBySessionId.get(sessionId) ?? 0) + 1);
  }

  const copiedRatingLogs: TargetRow[] = [];
  const skippedRatingLogCounts: Record<string, number> = {};
  for (const log of requireTable(tables, "player_rating_change_logs")) {
    const source = str(log, "source");
    if (COPIED_RATING_LOG_SOURCES.has(source)) {
      copiedRatingLogs.push(log);
    } else {
      skippedRatingLogCounts[source] = (skippedRatingLogCounts[source] ?? 0) + 1;
    }
  }

  return {
    rows: {
      players,
      // 컬럼이 지금 스키마와 같은 테이블은 덤프 행을 그대로 넣는다
      player_creation_logs: dumpCreationLogs,
      player_status_change_logs: requireTable(tables, "player_status_change_logs"),
      official_dupr_adjustment_logs: requireTable(tables, "official_dupr_adjustment_logs"),
      player_rating_change_logs: copiedRatingLogs,
      match_sessions: matchSessions,
      match_session_participants: [...sessionParticipants.values()],
      matches,
      match_scores: matchScores,
      match_participants: matchParticipants,
      player_admins: adminPlayerIds.map((playerId) => ({
        player_id: playerId,
        created_at: options.nowSeconds,
      })),
    },
    report: {
      dumpCounts: Object.fromEntries(
        Object.entries(tables).map(([table, rows]) => [table, rows.length]),
      ),
      bootstrapUsernames: dumpPlayers
        .filter((row) => bootstrapPlayerIds.has(str(row, "id")))
        .map((row) => str(row, "username")),
      regularSessions: sortedRegular.map(([dateKey, session]) => ({
        dateKey,
        sessionId: session.sessionId,
        name: String(sessionById.get(session.sessionId)!.name),
        legacySessionName: session.legacySessionName,
        matchCount: matchCountBySessionId.get(session.sessionId) ?? 0,
        participantCount: participantCountBySessionId.get(session.sessionId) ?? 0,
      })),
      customSessionNames: dumpSessions
        .filter((session) => !legacyRegularSessionIds.has(str(session, "id")))
        .map((session) => str(session, "name")),
      addedSessionParticipantCount: sessionParticipants.size - dumpParticipantCount,
      skippedRatingLogCounts,
      splitMatchCount,
      adminPlayerIds,
    },
  };
};

/**
 * v0.12.7 MySQL 덤프로 Supabase DB를 비우고 다시 채운다. 절차와 주의 사항은 docs/data-migration.md.
 *
 *   pnpm db:import-mysql --dump <덤프.sql> --admin <아이디>                 # dry-run(쓰기 없음)
 *   pnpm db:import-mysql --dump <덤프.sql> --admin <아이디> [--keep-upcoming-regular-sessions] --execute --confirm-target <프로젝트 ref 또는 DB 호스트>
 *   pnpm db:import-mysql --dump <덤프.sql> --issue-accounts --confirm-target <프로젝트 ref 또는 DB 호스트>  # 계정 발급만 다시
 *   pnpm db:import-mysql --dump <덤프.sql> --verify                         # 검증만(쓰기 없음)
 *
 * env: DATABASE_URL(대상 DB), SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY(계정 단계),
 *      IMPORT_INITIAL_PASSWORD(공통 초기 비밀번호, 계정 단계),
 *      GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON·GOOGLE_CALENDAR_ID(있으면 지운 세션의 캘린더 일정 정리)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { getDbClient } from "@pkpkdupr/db";
import { isValidUsername, toInternalEmail } from "@pkpkdupr/shared/auth";
import { toKstDateKey } from "@pkpkdupr/shared/session";
import {
  isValidInitialPassword,
  SupabaseAuthAdmin,
} from "../../src/services/supabaseAuthAdmin";
import { parseMysqlDump, type DumpTables } from "./parseDump";
import {
  buildImportPlan,
  TARGET_TABLES,
  type ImportPlan,
  type TargetRow,
} from "./transform";

type DbClient = ReturnType<typeof getDbClient>;

/** 지금 스키마의 public 테이블 전체. 다르면 스크립트를 스키마에 맞게 고친 뒤 실행한다 */
const EXPECTED_PUBLIC_TABLES = [
  "match_deletion_logs",
  "match_edit_logs",
  "match_participants",
  "match_scores",
  "match_session_participants",
  "match_sessions",
  "matches",
  "official_dupr_adjustment_logs",
  "player_admins",
  "player_creation_logs",
  "player_rating_change_logs",
  "player_rating_chart_points",
  "player_rating_chart_projections",
  "player_seen_achievements",
  "player_status_change_logs",
  "players",
  "regular_session_skips",
];

/** 활성 회원의 덤프 평점과 재계산 평점이 이 값 이상 다르면 차이로 본다 */
const RATING_DIFF_THRESHOLD = 0.01;
const INSERT_BATCH_SIZE = 200;

const log = (message = "") => console.log(message);

const fail = (message: string): never => {
  throw new Error(message);
};

const { values: args } = parseArgs({
  options: {
    dump: { type: "string" },
    admin: { type: "string", multiple: true, default: [] },
    execute: { type: "boolean", default: false },
    "issue-accounts": { type: "boolean", default: false },
    verify: { type: "boolean", default: false },
    "confirm-target": { type: "string" },
    "out-dir": { type: "string" },
    "keep-upcoming-regular-sessions": { type: "boolean", default: false },
  },
});

/**
 * 쓰기 전에 다시 적게 하는 대상 식별자. Supabase 주소면 프로젝트 ref, 아니면 호스트다.
 * 풀러 호스트(aws-0-<region>.pooler.supabase.com)는 여러 프로젝트가 같이 쓰므로 사용자명 postgres.<ref>에서 ref를 꺼낸다.
 */
const getDatabaseTarget = (): string | null => {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // 원래 오류 객체에는 비밀번호가 든 접속 문자열이 들어 있으므로 고정 문구로 바꾼다
    return fail("DATABASE_URL 형식이 올바르지 않습니다. 비밀번호의 특수문자는 URL 인코딩합니다.");
  }
  const directRef = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1];
  const poolerRef = /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(url.username))?.[1];
  return directRef ?? poolerRef ?? url.hostname;
};

const requireConfirmedTarget = () => {
  const target = getDatabaseTarget() ?? fail("DATABASE_URL이 필요합니다.");
  if (args["confirm-target"] !== target) {
    fail(`쓰기 모드는 --confirm-target ${target}로 대상 DB를 다시 적어야 합니다.`);
  }
};

// 루트 `pnpm db:import-mysql`는 apps/api에서 실행되므로 상대 경로는 명령을 친 위치(INIT_CWD) 기준으로 푼다
const invocationDir = process.env.INIT_CWD ?? process.cwd();

const outDir = resolve(
  invocationDir,
  args["out-dir"] ?? join(tmpdir(), `pkpkdupr-import-${new Date().toISOString().replace(/[:.]/g, "-")}`),
);

/** 비밀번호·해시가 없는 보고 파일만 쓴다 */
const writeOutput = (name: string, content: string) => {
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const path = join(outDir, name);
  writeFileSync(path, content, { mode: 0o600 });
  log(`  → ${path}`);
};

const loadDump = (): DumpTables => {
  const path = args.dump ?? fail("--dump <덤프.sql>이 필요합니다.");
  return parseMysqlDump(readFileSync(resolve(invocationDir, path), "utf8"));
};

// ───────────────────────── DB 조회 ─────────────────────────

const listPublicTables = async (client: DbClient): Promise<string[]> => {
  const { rows } = await client.execute(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  return rows.map((row) => String(row.tablename));
};

const countRows = async (client: DbClient, tables: string[]) => {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { rows } = await client.execute(`SELECT count(*)::int AS count FROM "${table}"`);
    counts[table] = Number(rows[0].count);
  }
  return counts;
};

const assertExpectedSchema = async (client: DbClient) => {
  const tables = await listPublicTables(client);
  const unexpected = tables.filter((table) => !EXPECTED_PUBLIC_TABLES.includes(table));
  const missing = EXPECTED_PUBLIC_TABLES.filter((table) => !tables.includes(table));
  if (unexpected.length || missing.length) {
    fail(
      `public 테이블이 스크립트가 아는 스키마와 다릅니다. 새 테이블: [${unexpected.join(", ")}], 없는 테이블: [${missing.join(", ")}]`,
    );
  }
};

// ───────────────────────── 비우기·이관 ─────────────────────────

const insertRows = async (
  execute: (sql: string, args: unknown[]) => Promise<unknown>,
  table: string,
  rows: TargetRow[],
) => {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const batch = rows.slice(start, start + INSERT_BATCH_SIZE);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const keys = Object.keys(row);
      if (keys.length !== columns.length || keys.some((key, i) => key !== columns[i])) {
        fail(`${table}: 행마다 컬럼이 다릅니다.`);
      }
      const placeholders = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await execute(
      `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES ${tuples.join(", ")}`,
      values,
    );
  }
};

/**
 * 대상 DB의 오늘(KST) 이후 정기 세션 중 덤프에 같은 날짜가 없는 것. `--keep-upcoming-regular-sessions`면
 * 같은 id의 빈 정기 세션으로 다시 넣어, 세션 id로 묶인 구글 캘린더 일정을 그대로 이어 쓴다.
 * 참여자는 지우는 회원을 가리키므로 옮기지 않는다.
 */
const findUpcomingRegularSessions = async (
  execute: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  plan: ImportPlan,
  lock = false,
): Promise<TargetRow[]> => {
  const plannedDateKeys = new Set(
    plan.rows.match_sessions.map((session) => session.regular_date_key).filter(Boolean),
  );
  const { rows } = await execute(
    `SELECT id, name, "date", location, created_at, updated_at, regular_date_key, auto_created, start_time, end_time
     FROM match_sessions
     WHERE regular_date_key >= $1
     ORDER BY regular_date_key${lock ? " FOR UPDATE" : ""}`,
    [toKstDateKey(new Date())],
  );
  return rows
    .filter((row) => !plannedDateKeys.has(row.regular_date_key as string))
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      date: Number(row.date),
      location: String(row.location),
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      kind: "regular",
      regular_date_key: String(row.regular_date_key),
      auto_created: row.auto_created === true,
      start_time: (row.start_time as string | null) ?? null,
      end_time: (row.end_time as string | null) ?? null,
    }));
};

/** 비우기와 이관을 한 트랜잭션으로 한다. 실패하면 대상 DB는 그대로다 */
const wipeAndImport = async (client: DbClient, plan: ImportPlan) => {
  await assertExpectedSchema(client);

  // 캘린더 일정 id는 세션 id에서 만들므로 지우기 전 세션 목록을 남긴다
  const { rows: wipedSessions } = await client.execute(
    `SELECT id, name, regular_date_key, "date" FROM match_sessions ORDER BY "date"`,
  );
  writeOutput("wiped-sessions.json", JSON.stringify(wipedSessions, null, 2));

  const transaction = await client.transaction("write");
  try {
    const execute = (sql: string, values: unknown[] = []) =>
      transaction.execute({ sql, args: values });
    if (args["keep-upcoming-regular-sessions"]) {
      const kept = await findUpcomingRegularSessions(execute, plan, true);
      // 검증 행 수와 캘린더 정리 대상 제외가 같은 목록을 보도록 계획에 더한다
      plan.rows.match_sessions.push(...kept);
      log(
        `  유지하는 정기 세션 ${kept.length}개: ${kept.map((session) => `${session.regular_date_key}(${session.id})`).join(", ") || "없음"}`,
      );
    }
    await execute(
      `TRUNCATE TABLE ${EXPECTED_PUBLIC_TABLES.map((table) => `"${table}"`).join(", ")}`,
    );
    for (const table of TARGET_TABLES) {
      await insertRows(execute, table, plan.rows[table]);
      log(`  ${table}: ${plan.rows[table].length}행`);
    }
    await transaction.commit();
  } finally {
    transaction.close();
  }
  return wipedSessions.map((row) => String(row.id));
};

const recalculateRatings = async () => {
  // AuthService·api 저장소는 import 시점에 DB 연결을 만들므로 쓰기 단계에서만 불러온다
  const [{ AuthService }, { MatchRepository }] = await Promise.all([
    import("../../src/services/AuthService"),
    import("../../src/repositories/MatchRepository"),
  ]);
  const matchRepository = new MatchRepository();
  // 관리자 '평점 재계산'(POST /api/admin/ratings/recalculate)과 같은 입력·옵션이다.
  // source를 주지 않아 재계산 전후 요약 로그(manual_recalculation)는 남기지 않고 경기별 로그만 만든다.
  return await new AuthService().recalculateDuprRatings(
    async () => {
      const { matches } = await matchRepository.findAll(0, 10000);
      return matches.filter((match) => match.status === "completed");
    },
    { perMatchLogs: true },
  );
};

/**
 * 지운 세션의 캘린더 일정을 지운다. 덤프에서 같은 id로 다시 들어온 세션은 일정이 그대로 맞으므로 남긴다.
 * 이미 DB·계정을 바꾼 뒤라 실패해도 멈추지 않고 검증으로 넘어간다.
 */
const deleteWipedCalendarEvents = async (wipedSessionIds: string[], plan: ImportPlan) => {
  const importedSessionIds = new Set(plan.rows.match_sessions.map((session) => String(session.id)));
  const sessionIds = wipedSessionIds.filter((sessionId) => !importedSessionIds.has(sessionId));
  const [{ readGoogleCalendarConfig, createGoogleCalendarClient }, { toCalendarEventId }] =
    await Promise.all([
      import("../../src/services/GoogleCalendarClient"),
      import("../../src/services/SessionCalendarSync"),
    ]);
  const config = readGoogleCalendarConfig();
  if (!config) {
    log(
      "  캘린더 설정(GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON·GOOGLE_CALENDAR_ID)이 없어 건너뜁니다. wiped-sessions.json으로 따로 정리하세요.",
    );
    return;
  }
  const calendar = createGoogleCalendarClient(config);
  const failed: string[] = [];
  for (const sessionId of sessionIds) {
    try {
      // 없는 일정(404·410)은 클라이언트가 성공으로 처리한다
      await calendar.deleteEvent(toCalendarEventId(sessionId));
    } catch (error) {
      failed.push(sessionId);
      console.error(`  ${sessionId} 일정 삭제 실패`, error instanceof Error ? error.message : error);
    }
  }
  log(
    `  지운 세션 ${sessionIds.length - failed.length}개의 캘린더 일정을 정리했습니다.` +
      (failed.length ? ` 실패 ${failed.length}개(${failed.join(", ")})는 wiped-sessions.json을 보고 직접 지우세요.` : ""),
  );
};

// ───────────────────────── 계정 ─────────────────────────

/** Auth 관리 클라이언트. Auth 사용자를 모두 지우는 단계가 있어, DB와 다른 프로젝트의 Auth를 가리키면 멈춘다 */
const createAuthAdmin = () => {
  const url = process.env.SUPABASE_URL?.trim() || fail("SUPABASE_URL이 필요합니다.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) fail("SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  const authRef = /^([a-z0-9]+)\.supabase\.co$/.exec(new URL(url).hostname)?.[1];
  if (authRef && authRef !== getDatabaseTarget()) {
    fail(`SUPABASE_URL 프로젝트(${authRef})가 DATABASE_URL 프로젝트(${getDatabaseTarget()})와 다릅니다.`);
  }
  return new SupabaseAuthAdmin();
};

const deleteAllAuthUsers = async (authAdmin: SupabaseAuthAdmin) => {
  const users = await authAdmin.listUsers();
  for (const user of users) {
    await authAdmin.deleteUser(user.id);
  }
  log(`  기존 Auth 사용자 ${users.length}명을 지웠습니다.`);
};

const requireInitialPassword = (): string => {
  const password = process.env.IMPORT_INITIAL_PASSWORD ?? "";
  if (!isValidInitialPassword(password)) {
    // 값 자체는 출력하지 않는다
    fail("IMPORT_INITIAL_PASSWORD는 6자 이상이고 영문과 숫자를 모두 넣어야 합니다.");
  }
  return password;
};

/**
 * 연결되지 않은 active 정회원마다 Auth 사용자를 만들어 연결하고 첫 로그인 비밀번호 변경을 켠다.
 * 관리자 '비밀번호 초기화'의 계정 발급과 결과가 같다(내부 이메일·이메일 확인됨·is_first_login = true).
 * 이미 연결된 회원은 건너뛰므로 다시 돌려도 계정이 두 번 만들어지지 않는다.
 * 같은 이메일의 사용자가 남아 있으면(앞선 실행이 연결 전에 멈춘 경우) 그 사용자를 연결한다.
 */
const issueAccounts = async (client: DbClient, authAdmin: SupabaseAuthAdmin) => {
  const password = requireInitialPassword();
  // api 저장소는 import 시점에 DB 연결을 만들므로 쓰기 단계에서만 불러온다
  const { db } = await import("../../src/db");
  const { rows } = await client.execute(
    `SELECT id, username FROM players
     WHERE status = 'active' AND is_guest = false AND auth_user_id IS NULL
     ORDER BY lower(username)`,
  );
  const existingByEmail = new Map(
    (await authAdmin.listUsers()).map((user) => [user.email?.toLowerCase(), user.id]),
  );
  const invalidUsernames: string[] = [];
  let issued = 0;
  for (const row of rows) {
    const username = String(row.username);
    if (!isValidUsername(username)) {
      invalidUsernames.push(username);
      continue;
    }
    const email = toInternalEmail(username);
    let authUserId = existingByEmail.get(email);
    if (authUserId) {
      await authAdmin.updateUser(authUserId, { password });
    } else {
      authUserId = await authAdmin.createUser({ email, password });
    }
    if (!(await db.players.linkAuthUser(String(row.id), authUserId, true))) {
      fail(`${username}: 회원을 Auth 사용자와 연결하지 못했습니다.`);
    }
    issued += 1;
  }
  log(`  계정 발급 ${issued}명`);
  if (invalidUsernames.length) {
    log(
      `  아이디 형식이 맞지 않아 건너뜀: ${invalidUsernames.join(", ")} (admin-web에서 아이디를 바꾼 뒤 비밀번호 초기화)`,
    );
  }
};

// ───────────────────────── 보고·검증 ─────────────────────────

const printPlan = (plan: ImportPlan) => {
  const { report } = plan;
  log("덤프 행 수");
  for (const [table, count] of Object.entries(report.dumpCounts)) log(`  ${table}: ${count}`);
  log("\n넣을 행 수");
  for (const table of TARGET_TABLES) log(`  ${table}: ${plan.rows[table].length}`);
  log("\n옮기지 않는 평점 로그(재계산이 다시 만듦)");
  for (const [source, count] of Object.entries(report.skippedRatingLogCounts)) log(`  ${source}: ${count}`);
  log(`\n부트스트랩 계정(inactive로 옮김): ${report.bootstrapUsernames.join(", ") || "없음"}`);
  log(`관리자(player_admins): ${report.adminPlayerIds.join(", ") || "없음"}`);
  log(`게임마다 쪼갠 옛 2선승 경기: ${report.splitMatchCount}`);
  log(`세션 경기 선수라서 추가한 세션 참여자: ${report.addedSessionParticipantCount}`);
  log(`\n일반 세션(이름 유지): ${report.customSessionNames.join(", ")}`);
  log(`정기 세션 ${report.regularSessions.length}개`);
  for (const session of report.regularSessions) {
    log(
      `  ${session.dateKey} ${session.name} ${session.sessionId} 경기 ${session.matchCount} 참여자 ${session.participantCount}${session.legacySessionName ? ` ← "${session.legacySessionName}"` : " (세션 없던 경기로 만듦)"}`,
    );
  }
  const players = plan.rows.players;
  const active = players.filter((player) => player.status === "active");
  const invalid = active.filter((player) => !isValidUsername(String(player.username)));
  log(
    `\n계정 발급 대상 active 회원 ${active.length}명, inactive ${players.length - active.length}명` +
      (invalid.length ? `, 아이디 형식 오류 ${invalid.map((player) => player.username).join(", ")}` : ""),
  );
};

interface Rating {
  singles: number;
  doubles: number;
}

/** players.dupr_rating(`{ rating, metrics }`)의 평점. 없으면(NR 회원) null */
const parseRating = (json: unknown): Rating | null =>
  typeof json === "string" ? ((JSON.parse(json) as { rating?: Rating }).rating ?? null) : null;

/** 평점 변경 로그의 *_rating_json(`{ singles, doubles }`) */
const parseRatingJson = (json: unknown): Rating => JSON.parse(String(json)) as Rating;

const verify = async (client: DbClient, tables: DumpTables, plan: ImportPlan) => {
  log("\n[검증] 테이블별 행 수 (기대 / 실제)");
  const counts = await countRows(client, EXPECTED_PUBLIC_TABLES);
  // 덤프 밖 정기 세션(--keep-upcoming-regular-sessions로 유지한 것, 이관 뒤 예약 작업·조회가 만든 것)은 따로 센다
  const plannedSessionIds = new Set(plan.rows.match_sessions.map((session) => String(session.id)));
  const { rows: regularSessionRows } = await client.execute(
    "SELECT id FROM match_sessions WHERE regular_date_key IS NOT NULL",
  );
  const extraRegularSessionCount = regularSessionRows.filter(
    (row) => !plannedSessionIds.has(String(row.id)),
  ).length;
  const dumpMatchCompletedLogs = tables.player_rating_change_logs.filter(
    (row) => row.source === "match_completed",
  );
  const lines: string[] = ["| 테이블 | 덤프 | 기대 | 실제 | 결과 |", "| --- | --- | --- | --- | --- |"];
  let countMismatch = 0;
  for (const table of EXPECTED_PUBLIC_TABLES) {
    const planned = (plan.rows as Partial<Record<string, TargetRow[]>>)[table]?.length ?? 0;
    // 평점 로그는 옮긴 공식 조정 영향 로그에 재계산이 만든 경기별 로그(덤프와 같은 수)가 더해진다
    const expected =
      table === "player_rating_change_logs"
        ? planned + dumpMatchCompletedLogs.length
        : table === "match_sessions"
          ? planned + extraRegularSessionCount
          : planned;
    const actual = counts[table];
    const ok = expected === actual;
    if (!ok) countMismatch += 1;
    const dumpCount = plan.report.dumpCounts[table] ?? "-";
    lines.push(`| ${table} | ${dumpCount} | ${expected} | ${actual} | ${ok ? "같음" : "다름"} |`);
    log(`  ${ok ? "  " : "✗ "}${table}: ${expected} / ${actual} (덤프 ${dumpCount})`);
  }
  log(
    "  * player_rating_change_logs 기대값 = 옮긴 공식 조정 영향 로그 + 덤프의 경기별 로그 수(재계산이 같은 수를 만들어야 함)",
  );
  if (extraRegularSessionCount > 0) {
    log(`  * match_sessions 기대값에 덤프 밖 정기 세션 ${extraRegularSessionCount}개(유지분·예약 작업분)를 더했습니다.`);
  }

  // 경기별 평점 로그: 덤프 값과 재계산 값을 (경기, 회원)으로 맞춰 본다
  const { rows: logRows } = await client.execute(
    `SELECT player_id, source_log_id, next_rating_json FROM player_rating_change_logs WHERE source = 'match_completed'`,
  );
  const matchLogKey = (sourceLogId: string, playerId: string) =>
    `${sourceLogId.replace(/^match-completed-/, "").replace(/-[^-]+$/, "")}:${playerId}`;
  const recalculatedLogs = new Map(
    logRows.map((row) => [
      matchLogKey(String(row.source_log_id), String(row.player_id)),
      parseRatingJson(row.next_rating_json),
    ]),
  );
  let matchLogMissing = 0;
  let matchLogMaxDiff = 0;
  let matchLogDiffCount = 0;
  for (const row of dumpMatchCompletedLogs) {
    const recalculated = recalculatedLogs.get(matchLogKey(String(row.source_log_id), String(row.player_id)));
    if (!recalculated) {
      matchLogMissing += 1;
      continue;
    }
    const original = parseRatingJson(row.next_rating_json);
    const diff = Math.max(
      Math.abs(original.singles - recalculated.singles),
      Math.abs(original.doubles - recalculated.doubles),
    );
    matchLogMaxDiff = Math.max(matchLogMaxDiff, diff);
    if (diff >= 0.0005) matchLogDiffCount += 1;
  }
  const matchLogSummary = `덤프 ${dumpMatchCompletedLogs.length}건 중 재계산에 없음 ${matchLogMissing}, 0.001 이상 다름 ${matchLogDiffCount}, 최대 차이 ${matchLogMaxDiff.toFixed(3)}`;
  log(`\n[검증] 경기별 평점 로그: ${matchLogSummary}`);

  // 회원 평점: 덤프 players.dupr_rating과 재계산 뒤 값
  const { rows: playerRows } = await client.execute(
    `SELECT id, username, status, dupr_rating, auth_user_id, is_first_login FROM players ORDER BY lower(username)`,
  );
  const dumpRatingById = new Map(
    tables.players.map((row) => [String(row.id), parseRating(row.dupr_rating)]),
  );
  const ratingLines = [
    "| 회원 | 상태 | 복식 덤프 | 복식 재계산 | 차이 | 단식 덤프 | 단식 재계산 | 차이 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const activeDiffs: string[] = [];
  let maxActiveDiff = 0;
  const fmt = (value: number | undefined) => (value === undefined ? "NR" : value.toFixed(3));
  const fmtDiff = (value: number) => {
    if (Number.isNaN(value)) return "?";
    if (Math.abs(value) < 0.0005) return "0";
    return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
  };
  for (const row of playerRows) {
    const before = dumpRatingById.get(String(row.id)) ?? null;
    const after = parseRating(row.dupr_rating);
    if (!before && !after) continue;
    // 한쪽만 평점이 없으면(NR) 차이를 판정할 수 없으므로 기준 이상 차이로 센다
    const doublesDiff = before && after ? after.doubles - before.doubles : Number.NaN;
    const singlesDiff = before && after ? after.singles - before.singles : Number.NaN;
    const diff = before && after ? Math.max(Math.abs(doublesDiff), Math.abs(singlesDiff)) : Infinity;
    if (row.status === "active") {
      if (Number.isFinite(diff)) maxActiveDiff = Math.max(maxActiveDiff, diff);
      if (diff >= RATING_DIFF_THRESHOLD) activeDiffs.push(String(row.username));
    }
    ratingLines.push(
      `| ${row.username} | ${row.status} | ${fmt(before?.doubles)} | ${fmt(after?.doubles)} | ${fmtDiff(doublesDiff)} | ${fmt(before?.singles)} | ${fmt(after?.singles)} | ${fmtDiff(singlesDiff)} |`,
    );
  }
  const ratingSummary = `활성 회원 최대 차이 ${maxActiveDiff.toFixed(3)}, 기준(${RATING_DIFF_THRESHOLD}) 이상 ${activeDiffs.length}명${activeDiffs.length ? ` (${activeDiffs.join(", ")})` : ""}`;
  log(`[검증] 회원 평점: ${ratingSummary}`);

  const active = playerRows.filter((row) => row.status === "active");
  const linked = active.filter((row) => row.auth_user_id);
  const firstLogin = linked.filter((row) => row.is_first_login === true);
  const unlinked = active.filter((row) => !row.auth_user_id).map((row) => String(row.username));
  const inactive = playerRows
    .filter((row) => row.status !== "active")
    .map((row) => String(row.username));
  const accountSummary = `active ${active.length}명 중 연결 ${linked.length}명(첫 로그인 비밀번호 변경 ${firstLogin.length}명), 미연결 ${unlinked.join(", ") || "없음"}`;
  const inactiveSummary = `발급하지 않은 inactive ${inactive.length}명: ${inactive.join(", ") || "없음"}`;
  log(`[검증] 계정: ${accountSummary}\n  ${inactiveSummary}`);

  writeOutput(
    "verify.md",
    [
      "## 테이블별 행 수",
      "",
      ...lines,
      "",
      "## 경기별 평점 로그",
      "",
      matchLogSummary,
      "",
      "## 회원 평점 (덤프 players.dupr_rating → 재계산)",
      "",
      ratingSummary,
      "",
      ...ratingLines,
      "",
      "## 계정",
      "",
      accountSummary,
      "",
      inactiveSummary,
      "",
    ].join("\n"),
  );
  return { countMismatch, activeRatingDiffCount: activeDiffs.length, matchLogMissing };
};

// ───────────────────────── 실행 ─────────────────────────

const main = async () => {
  const target = getDatabaseTarget();
  log(`대상 DB: ${target ?? "(DATABASE_URL 없음)"}\n`);

  if (args["issue-accounts"]) {
    requireConfirmedTarget();
    log("[계정 발급]");
    await issueAccounts(getDbClient(), createAuthAdmin());
    return;
  }

  const tables = loadDump();
  const plan = buildImportPlan(tables, {
    adminUsernames: args.admin,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  if (args.verify) {
    await verify(getDbClient(), tables, plan);
    return;
  }

  printPlan(plan);
  writeOutput("plan.json", JSON.stringify(plan.report, null, 2));

  if (!args.execute) {
    if (target) {
      const client = getDbClient();
      const tablesInDb = await listPublicTables(client);
      log("\n대상 DB 현재 행 수 (비우면 모두 사라짐)");
      for (const [table, count] of Object.entries(await countRows(client, tablesInDb))) {
        log(`  ${table}: ${count}`);
      }
    }
    if (target && args["keep-upcoming-regular-sessions"]) {
      const kept = await findUpcomingRegularSessions(
        (sql, values = []) => getDbClient().execute({ sql, args: values }),
        plan,
      );
      log(
        `\n위 match_sessions에 더해, 같은 id의 빈 세션으로 유지할 정기 세션 ${kept.length}개: ${kept.map((session) => session.regular_date_key).join(", ") || "없음"}`,
      );
    }
    log("\ndry-run입니다. 실제로 하려면 --execute --confirm-target <프로젝트 ref 또는 DB 호스트>를 붙입니다.");
    return;
  }

  requireConfirmedTarget();
  if (args.admin.length === 0) {
    fail("--admin <아이디>가 필요합니다. 비운 뒤 admin-web에 들어갈 관리자가 없어집니다.");
  }
  requireInitialPassword();
  const authAdmin = createAuthAdmin();
  const client = getDbClient();

  log("\n[1/5] 비우기·이관 (한 트랜잭션)");
  const wipedSessionIds = await wipeAndImport(client, plan);

  log("\n[2/5] 평점 재계산");
  const summary = await recalculateRatings();
  log(`  평점이 바뀐 회원 ${summary.changedPlayerCount}명, 경기별 로그 ${summary.perMatchLogCount}건, 경기 전 평점 스냅샷 ${summary.restoredMatchDuprSnapshotCount}건`);

  log("\n[3/5] 기존 Auth 사용자 삭제·계정 발급");
  await deleteAllAuthUsers(authAdmin);
  await issueAccounts(client, authAdmin);

  log("\n[4/5] 지운 세션의 캘린더 일정 정리");
  await deleteWipedCalendarEvents(wipedSessionIds, plan);

  log("\n[5/5] 검증");
  const result = await verify(client, tables, plan);
  if (result.countMismatch || result.matchLogMissing) {
    process.exitCode = 1;
  }
  if (result.activeRatingDiffCount > 0) {
    // 증분 반영과 전체 재계산의 차이로 생길 수 있어 실패로 끝내지 않는다. verify.md의 차이표를 확인한다
    log(`\n주의: 활성 회원 ${result.activeRatingDiffCount}명의 평점이 덤프와 ${RATING_DIFF_THRESHOLD} 이상 다릅니다.`);
  }
};

main()
  .catch((error) => {
    console.error(`\n실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!process.env.DATABASE_URL?.trim()) return;
    try {
      await getDbClient().close();
    } catch {
      // 연결을 만들지 못한 경우다. 원래 오류는 위에서 이미 출력했다
    }
  });

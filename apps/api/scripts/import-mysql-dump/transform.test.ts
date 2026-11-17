import { describe, expect, it } from "vitest";
import { parseMysqlDump, parseValuesList } from "./parseDump";
import { buildImportPlan, buildRegularSessionId, buildSplitMatchId } from "./transform";

const KST = 9 * 3600;
/** KST 벽시계 시각의 epoch 초 */
const kst = (iso: string) => Date.parse(`${iso}Z`) / 1000 - KST;

const table = (name: string, columns: string[], rows: unknown[][]) => {
  const values = rows
    .map(
      (row) =>
        `(${row
          .map((value) =>
            value === null
              ? "NULL"
              : typeof value === "number"
                ? String(value)
                : `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
          )
          .join(",")})`,
    )
    .join(",");
  return [
    `CREATE TABLE \`${name}\` (`,
    ...columns.map((column) => `  \`${column}\` text,`),
    `  PRIMARY KEY (\`${columns[0]}\`)`,
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
    rows.length ? `INSERT INTO \`${name}\` VALUES ${values};` : "",
  ].join("\n");
};

const PLAYER_COLUMNS = [
  "id", "username", "dupr_rating", "gender", "status", "avatar_url", "affiliations_json",
  "status_message", "status_message_background_color", "password_hash", "is_first_login",
  "created_at", "updated_at",
];
const MATCH_COLUMNS = [
  "id", "type", "mode", "source", "creator_player_id", "name", "session_id", "session_name",
  "session_date", "status", "location", "court_name", "match_starts_at", "completed_at",
  "result_submitted_by_player_id", "result_submitted_at", "auto_approval_due_at",
  "auto_approved_at", "auto_approval_rating_applied_at", "created_at", "updated_at",
];
const RATING_LOG_COLUMNS = [
  "id", "player_id", "source", "source_log_id", "previous_rating_json", "next_rating_json",
  "delta_json", "created_at",
];

const player = (id: string, username: string, status = "active") => [
  id, username, '{"rating":{"singles":3,"doubles":3.1}}', "M", status, "/uploads/avatars/a.png",
  null, null, null, "hash", 1, 100, 100,
];
const match = (id: string, sessionId: string | null, startsAt: number) => [
  id, "men-doubles", "single-game", "player_created", "Pboot001", null, sessionId,
  sessionId ? "옛 이름" : null, sessionId ? startsAt : null, "completed", "야탑초등학교", null,
  startsAt, startsAt, "Pboot001", startsAt, null, null, null, startsAt, startsAt,
];

/** 9/14(월) 옛 정기운동 세션 + 같은 날 세션 없는 경기, 9/17(목) 세션 없는 경기, 일요일 경기, 행사 세션 */
const buildDump = () =>
  [
    table("players", PLAYER_COLUMNS, [
      player("Pboot001", "admin"),
      player("Paaaaaa1", "brad.ley"),
      player("Pbbbbbb2", "o'neil"),
      player("Pcccccc3", "gone", "inactive"),
    ]),
    table("player_creation_logs", ["id", "player_id", "created_by_player_id", "created_by_username", "creation_source", "created_at"], [
      ["log-1", "Pboot001", "Pboot001", "admin", "bootstrap", 1],
      ["log-2", "Paaaaaa1", "Pboot001", "admin", "admin_register", 2],
    ]),
    table("player_status_change_logs", ["id", "player_id", "previous_status", "next_status", "changed_by_player_id", "changed_by_username", "changed_at"], []),
    table("official_dupr_adjustment_logs", ["id", "player_id", "changed_by_player_id", "changed_by_username", "ratings_json", "confidence_json", "previous_rating_json", "next_rating_json", "pre_update_accuracy_json", "reason", "created_at"], [
      ["official-1", "Paaaaaa1", "Pboot001", "admin", '{"doubles":3.5}', '{"doubles":10}', "{}", "{}", "{}", null, 5],
    ]),
    table("player_rating_change_logs", RATING_LOG_COLUMNS, [
      ["r1", "Paaaaaa1", "match_completed", "match-completed-M1111111-1", "{}", "{}", "{}", 1],
      ["r2", "Paaaaaa1", "manual_recalculation", "manual-1", "{}", "{}", "{}", 2],
      ["r3", "Paaaaaa1", "official_adjustment_recalculation", "official-1", "{}", "{}", "{}", 5],
    ]),
    table("match_sessions", ["id", "name", "date", "location", "created_at", "updated_at"], [
      ["Slegacy1", "9/14 정기운동", kst("2026-09-14T19:00:00"), "야탑초등학교", 10, 11],
      ["Sevent01", "피카피카행사2", kst("2026-06-25T19:00:00"), "야탑초등학교", 20, 21],
    ]),
    table("match_session_participants", ["id", "session_id", "player_id", "created_at"], [
      ["Sevent01-Pbbbbbb2", "Sevent01", "Pbbbbbb2", 30],
    ]),
    table("matches", MATCH_COLUMNS, [
      match("M1111111", "Slegacy1", kst("2026-09-14T20:40:00")),
      match("M2222222", null, kst("2026-09-14T19:10:00")),
      match("M3333333", null, kst("2026-09-17T21:59:00")),
      match("M4444444", null, kst("2026-07-12T05:00:00")),
      match("M5555555", "Sevent01", kst("2026-06-25T19:30:00")),
    ]),
    table("match_scores", ["id", "match_id", "score_a", "score_b"], [
      ["M1111111-score-1", "M1111111", 11, 9],
      ["M2222222-score-1", "M2222222", 9, 11],
      ["M2222222-score-2", "M2222222", 11, 7],
    ]),
    table("match_participants", ["id", "match_id", "team_index", "player_id", "dupr_rating_json"], [
      ["M1111111-team-0-Paaaaaa1", "M1111111", 0, "Paaaaaa1", '{"doubles":3}'],
      ["M2222222-team-0-Pbbbbbb2", "M2222222", 0, "Pbbbbbb2", '{"doubles":3}'],
      ["M3333333-team-0-Paaaaaa1", "M3333333", 0, "Paaaaaa1", null],
      ["M5555555-team-0-Paaaaaa1", "M5555555", 0, "Paaaaaa1", null],
    ]),
    table("match_result_approvals", ["id", "match_id", "player_id", "approved_at"], [["a1", "M1111111", "Paaaaaa1", 1]]),
    table("player_rating_chart_points", ["id"], []),
    table("player_rating_chart_projections", ["player_id", "generated_at"], []),
    table("__pkpkdupr_migrations", ["id", "applied_at"], [["0000", 1]]),
  ].join("\n");

const plan = () =>
  buildImportPlan(parseMysqlDump(buildDump()), {
    adminUsernames: ["Brad.Ley"],
    nowSeconds: 999,
  });

describe("parseMysqlDump", () => {
  it("문자열 이스케이프·NULL·숫자를 읽는다", () => {
    expect(parseValuesList(`('a\\'b\\\\c\\n',NULL,-1.5,42),('x''y','',0,1)`, "t")).toEqual([
      ["a'b\\c\n", null, -1.5, 42],
      ["x'y", "", 0, 1],
    ]);
  });

  it("CRLF 줄바꿈과 값 안의 U+2028을 읽고, 형식이 다른 INSERT는 건너뛰지 않고 멈춘다", () => {
    const dump = [
      "CREATE TABLE `t` (",
      "  `id` text,",
      "  `memo` text",
      ") ENGINE=InnoDB;",
      "INSERT INTO `t` VALUES ('a','x y');",
    ].join("\r\n");
    expect(parseMysqlDump(dump).t).toEqual([{ id: "a", memo: "x y" }]);
    expect(() =>
      parseMysqlDump(`${dump}\nINSERT IGNORE INTO \`t\` VALUES ('b','z');`),
    ).toThrow("해석할 수 없는 INSERT");
  });

  it("CREATE TABLE의 컬럼 이름으로 행을 만든다", () => {
    const tables = parseMysqlDump(buildDump());
    expect(tables.players.find((row) => row.id === "Pbbbbbb2")?.username).toBe("o'neil");
    expect(tables.player_status_change_logs).toEqual([]);
  });
});

describe("buildImportPlan", () => {
  it("옛 정기운동 세션을 정기 세션으로 바꾸고 같은 날 세션 없는 경기를 그 세션에 묶는다", () => {
    const { rows } = plan();
    const legacy = rows.match_sessions.find((session) => session.id === "Slegacy1");
    expect(legacy).toMatchObject({
      name: "월요 정기운동",
      date: kst("2026-09-14T18:00:00"),
      location: "야탑초등학교",
      regular_date_key: "2026-09-14",
      created_at: 10,
    });
    const sameDay = rows.matches.find((m) => m.id === "M2222222");
    expect(sameDay).toMatchObject({
      session_id: "Slegacy1",
      session_name: "월요 정기운동",
      session_date: kst("2026-09-14T18:00:00"),
    });
    expect(rows.matches.find((m) => m.id === "M1111111")?.session_name).toBe("월요 정기운동");
  });

  it("정기 시간 경기만 있는 날은 날짜에서 정한 id로 정기 세션을 새로 만든다", () => {
    const { rows } = plan();
    const sessionId = buildRegularSessionId("2026-09-17");
    expect(sessionId).toMatch(/^S[a-z0-9]{7}$/);
    expect(rows.match_sessions.find((session) => session.id === sessionId)).toMatchObject({
      name: "목요 정기운동",
      regular_date_key: "2026-09-17",
    });
    expect(rows.matches.find((m) => m.id === "M3333333")?.session_id).toBe(sessionId);
    // 정기 요일·시간 밖의 경기는 세션 없이 남는다
    expect(rows.matches.find((m) => m.id === "M4444444")?.session_id).toBeNull();
  });

  it("행사 세션은 이름을 유지하고 세션 경기 선수를 참여자로 넣는다", () => {
    const { rows, report } = plan();
    expect(rows.match_sessions.find((session) => session.id === "Sevent01")).toMatchObject({
      name: "피카피카행사2",
      regular_date_key: null,
    });
    const participantKeys = rows.match_session_participants.map(
      (participant) => `${participant.session_id}:${participant.player_id}`,
    );
    expect(participantKeys).toEqual(
      expect.arrayContaining([
        "Sevent01:Pbbbbbb2",
        "Sevent01:Paaaaaa1",
        "Slegacy1:Paaaaaa1",
        "Slegacy1:Pbbbbbb2",
        `${buildRegularSessionId("2026-09-17")}:Paaaaaa1`,
      ]),
    );
    expect(participantKeys).toHaveLength(5);
    expect(report.addedSessionParticipantCount).toBe(4);
  });

  it("회원 계정·아바타·비밀번호 해시를 옮기지 않고 부트스트랩 계정은 inactive로 옮긴다", () => {
    const { rows, report } = plan();
    for (const row of rows.players) {
      expect(row).not.toHaveProperty("password_hash");
      expect(row).toMatchObject({ avatar_url: null, auth_user_id: null, is_guest: false });
    }
    expect(rows.players.find((row) => row.id === "Pboot001")?.status).toBe("inactive");
    expect(report.bootstrapUsernames).toEqual(["admin"]);
    expect(rows.player_admins).toEqual([{ player_id: "Paaaaaa1", created_at: 999 }]);
  });

  it("경기 전 평점 스냅샷을 비우고 공식 조정 영향 로그만 옮긴다", () => {
    const { rows, report } = plan();
    expect(rows.match_participants.every((row) => row.dupr_rating_json === null)).toBe(true);
    expect(rows.player_rating_change_logs.map((row) => row.id)).toEqual(["r3"]);
    expect(report.skippedRatingLogCounts).toEqual({ match_completed: 1, manual_recalculation: 1 });
    expect(rows.matches.every((row) => !("mode" in row) && row.rating_excluded === false)).toBe(true);
    expect(report.splitMatchCount).toBe(1);
  });

  it("옛 2선승 경기는 마이그레이션과 같은 규칙으로 게임마다 단판 경기로 쪼갠다", () => {
    const { rows } = plan();
    const startsAt = kst("2026-09-14T19:10:00");
    // SQL 'M' || substr(md5('M2222222:game:2'), 1, 7)과 같은 값
    const secondGameId = "M2e5b2d9";
    expect(buildSplitMatchId("M2222222", 2)).toBe(secondGameId);
    expect(rows.matches.find((m) => m.id === secondGameId)).toMatchObject({
      session_id: "Slegacy1",
      creator_player_id: "Pboot001",
      match_starts_at: startsAt + 600,
      completed_at: startsAt + 1,
      result_submitted_at: startsAt + 1,
    });
    expect(rows.matches.find((m) => m.id === "M2222222")).toMatchObject({
      match_starts_at: startsAt,
    });
    expect(
      rows.match_scores
        .filter((score) => String(score.match_id).startsWith("M2"))
        .map((score) => [score.id, score.match_id, score.score_a, score.score_b]),
    ).toEqual([
      ["M2222222-score-1", "M2222222", 9, 11],
      [`${secondGameId}-score-1`, secondGameId, 11, 7],
    ]);
    expect(rows.match_participants.find((row) => row.match_id === secondGameId)).toEqual({
      id: `${secondGameId}-team-0-Pbbbbbb2`,
      match_id: secondGameId,
      team_index: 0,
      player_id: "Pbbbbbb2",
      dupr_rating_json: null,
    });
  });

  it("처리 방법을 정하지 않은 테이블이나 없는 관리자는 멈춘다", () => {
    const tables = parseMysqlDump(buildDump());
    expect(() =>
      buildImportPlan({ ...tables, new_table: [] }, { adminUsernames: [], nowSeconds: 0 }),
    ).toThrow("new_table");
    expect(() =>
      buildImportPlan(tables, { adminUsernames: ["nobody"], nowSeconds: 0 }),
    ).toThrow("nobody");
  });
});

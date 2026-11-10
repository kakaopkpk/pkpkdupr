import { createClient } from "@libsql/client";
import { getDbClient } from "./client";
import { runMigrations } from "./migrate";

const sourceUrl = process.env.SQLITE_SOURCE_URL?.trim();
const legacyTimestampThreshold = 100_000_000_000;

const tableColumns: Record<string, string[]> = {
  players: [
    "id", "username", "dupr_rating", "gender", "status", "avatar_url",
    "affiliations_json", "status_message", "status_message_background_color",
    "password_hash", "is_first_login", "created_at", "updated_at",
  ],
  player_creation_logs: [
    "id", "player_id", "created_by_player_id", "created_by_username",
    "creation_source", "created_at",
  ],
  player_status_change_logs: [
    "id", "player_id", "previous_status", "next_status", "changed_by_player_id",
    "changed_by_username", "changed_at",
  ],
  player_rating_change_logs: [
    "id", "player_id", "source", "source_log_id", "previous_rating_json",
    "next_rating_json", "delta_json", "created_at",
  ],
  matches: [
    "id", "type", "mode", "source", "creator_player_id", "name", "session_id",
    "session_name", "session_date", "status", "location", "court_name",
    "match_starts_at", "completed_at", "result_submitted_by_player_id",
    "result_submitted_at", "auto_approval_due_at", "auto_approved_at",
    "auto_approval_rating_applied_at", "created_at", "updated_at",
  ],
  match_sessions: ["id", "name", "date", "location", "created_at", "updated_at"],
  match_session_participants: ["id", "session_id", "player_id", "created_at"],
  match_scores: ["id", "match_id", "score_a", "score_b"],
  match_participants: ["id", "match_id", "team_index", "player_id", "dupr_rating_json"],
  match_result_approvals: ["id", "match_id", "player_id", "approved_at"],
  official_dupr_adjustment_logs: [
    "id", "player_id", "changed_by_player_id", "changed_by_username", "ratings_json",
    "confidence_json", "previous_rating_json", "next_rating_json",
    "pre_update_accuracy_json", "reason", "created_at",
  ],
};

const timestampColumns = new Set([
  "created_at", "updated_at", "changed_at", "session_date", "match_starts_at",
  "completed_at", "result_submitted_at", "auto_approval_due_at", "auto_approved_at",
  "auto_approval_rating_applied_at", "date", "approved_at",
]);

const quote = (identifier: string) => `\`${identifier}\``;

const normalizeTimestamp = (value: unknown) => {
  if (value == null) return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`유효하지 않은 timestamp 값입니다: ${String(value)}`);
  }
  return numberValue >= legacyTimestampThreshold
    ? Math.floor(numberValue / 1000)
    : Math.floor(numberValue);
};

const normalizeRow = (
  table: string,
  row: Record<string, unknown>,
): unknown[] =>
  tableColumns[table].map((column) => {
    if (table === "match_scores" && column === "score_a") {
      return row.score_a ?? row.team_a;
    }
    if (table === "match_scores" && column === "score_b") {
      return row.score_b ?? row.team_b ?? row.t_b;
    }
    if (column === "is_first_login") return Number(row[column]) === 1 ? 1 : 0;
    if (timestampColumns.has(column)) return normalizeTimestamp(row[column]);
    return row[column] ?? null;
  });

const countRows = async (executor: { execute: (statement: any) => Promise<any> }, table: string) => {
  const result = await executor.execute(`SELECT COUNT(*) AS count FROM ${quote(table)}`);
  return Number(result.rows[0]?.count ?? 0);
};

const run = async () => {
  if (!sourceUrl) {
    throw new Error("SQLITE_SOURCE_URL 환경변수가 필요합니다.");
  }

  const source = createClient({ url: sourceUrl });
  const target = getDbClient();
  try {
    await runMigrations();

    for (const table of Object.keys(tableColumns)) {
      if ((await countRows(target, table)) > 0) {
        throw new Error(`대상 MySQL 테이블이 비어 있지 않습니다: ${table}`);
      }
    }

    const sourceRows = new Map<string, Array<Record<string, unknown>>>();
    for (const table of Object.keys(tableColumns)) {
      const result = await source.execute(`SELECT * FROM ${quote(table)}`);
      sourceRows.set(table, result.rows as Array<Record<string, unknown>>);
    }

    const transaction = await target.transaction("write");
    try {
      for (const [table, rows] of sourceRows) {
        const columns = tableColumns[table];
        const sql = `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
        for (const row of rows) {
          await transaction.execute({ sql, args: normalizeRow(table, row) });
        }
      }
      await transaction.commit();
    } catch (error) {
      transaction.close();
      throw error;
    }

    for (const [table, rows] of sourceRows) {
      const targetCount = await countRows(target, table);
      if (targetCount !== rows.length) {
        throw new Error(`${table} 이관 건수 불일치: source=${rows.length}, target=${targetCount}`);
      }
    }

    for (const [table, columns] of Object.entries(tableColumns)) {
      for (const column of columns.filter((name) => timestampColumns.has(name))) {
        const result = await target.execute(
          `SELECT COUNT(*) AS count FROM ${quote(table)} WHERE ${quote(column)} >= ${legacyTimestampThreshold}`,
        );
        if (Number(result.rows[0]?.count ?? 0) > 0) {
          throw new Error(`${table}.${column}에 밀리초 timestamp가 남아 있습니다.`);
        }
      }
    }

    console.log("[DB-SERVER] SQLite to MySQL import completed successfully");
  } finally {
    source.close();
  }
};

run().catch((error) => {
  console.error("[DB-SERVER] SQLite to MySQL import failed", error);
  process.exitCode = 1;
});

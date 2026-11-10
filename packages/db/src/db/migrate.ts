import { getDbClient } from "./client";

type MigrationExecutor = Pick<ReturnType<typeof getDbClient>, "execute">;

interface Migration {
  id: string;
  statements: string[];
  beforeApply?: (executor: MigrationExecutor) => Promise<void>;
}

const initialSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS players (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(191) NOT NULL UNIQUE,
    dupr_rating TEXT NULL,
    gender VARCHAR(8) NOT NULL,
    status VARCHAR(32) NOT NULL,
    avatar_url TEXT NULL,
    affiliations_json TEXT NULL,
    status_message VARCHAR(20) NULL,
    status_message_background_color VARCHAR(32) NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_first_login BOOLEAN NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS player_creation_logs (
    id VARCHAR(255) PRIMARY KEY,
    player_id VARCHAR(255) NOT NULL,
    created_by_player_id VARCHAR(255) NULL,
    created_by_username VARCHAR(191) NOT NULL,
    creation_source VARCHAR(64) NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX player_creation_logs_player_id_idx (player_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS player_status_change_logs (
    id VARCHAR(255) PRIMARY KEY,
    player_id VARCHAR(255) NOT NULL,
    previous_status VARCHAR(32) NOT NULL,
    next_status VARCHAR(32) NOT NULL,
    changed_by_player_id VARCHAR(255) NOT NULL,
    changed_by_username VARCHAR(191) NOT NULL,
    changed_at BIGINT NOT NULL,
    INDEX player_status_change_logs_player_id_idx (player_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS player_rating_change_logs (
    id VARCHAR(255) PRIMARY KEY,
    player_id VARCHAR(255) NOT NULL,
    source VARCHAR(64) NOT NULL,
    source_log_id VARCHAR(255) NOT NULL,
    previous_rating_json TEXT NOT NULL,
    next_rating_json TEXT NOT NULL,
    delta_json TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX player_rating_change_logs_player_id_idx (player_id),
    INDEX player_rating_change_logs_source_log_id_idx (source, source_log_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS matches (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(32) NOT NULL,
    mode VARCHAR(32) NOT NULL DEFAULT 'single-game',
    source VARCHAR(32) NOT NULL DEFAULT 'player_created',
    creator_player_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NULL,
    session_id VARCHAR(255) NULL,
    session_name VARCHAR(255) NULL,
    session_date BIGINT NULL,
    status VARCHAR(32) NOT NULL,
    location VARCHAR(255) NOT NULL,
    court_name VARCHAR(255) NULL,
    match_starts_at BIGINT NOT NULL,
    completed_at BIGINT NULL,
    result_submitted_by_player_id VARCHAR(255) NULL,
    result_submitted_at BIGINT NULL,
    auto_approval_due_at BIGINT NULL,
    auto_approved_at BIGINT NULL,
    auto_approval_rating_applied_at BIGINT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    INDEX matches_session_id_idx (session_id),
    INDEX matches_status_auto_approval_due_at_idx (status, auto_approval_due_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS match_sessions (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    \`date\` BIGINT NOT NULL,
    location VARCHAR(255) NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE KEY match_sessions_name_date_unique (name, \`date\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS match_session_participants (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    player_id VARCHAR(255) NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE KEY match_session_participants_session_player_unique (session_id, player_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS match_scores (
    id VARCHAR(255) PRIMARY KEY,
    match_id VARCHAR(255) NOT NULL,
    score_a INT NOT NULL,
    score_b INT NOT NULL,
    INDEX match_scores_match_id_idx (match_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS match_participants (
    id VARCHAR(255) PRIMARY KEY,
    match_id VARCHAR(255) NOT NULL,
    team_index INT NOT NULL,
    player_id VARCHAR(255) NOT NULL,
    dupr_rating_json TEXT NULL,
    INDEX match_participants_match_id_idx (match_id),
    INDEX match_participants_player_id_idx (player_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS match_result_approvals (
    id VARCHAR(255) PRIMARY KEY,
    match_id VARCHAR(255) NOT NULL,
    player_id VARCHAR(255) NOT NULL,
    approved_at BIGINT NOT NULL,
    UNIQUE KEY match_result_approvals_match_player_unique (match_id, player_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS official_dupr_adjustment_logs (
    id VARCHAR(255) PRIMARY KEY,
    player_id VARCHAR(255) NOT NULL,
    changed_by_player_id VARCHAR(255) NOT NULL,
    changed_by_username VARCHAR(191) NOT NULL,
    ratings_json TEXT NOT NULL,
    confidence_json TEXT NOT NULL,
    previous_rating_json TEXT NOT NULL,
    next_rating_json TEXT NOT NULL,
    pre_update_accuracy_json TEXT NOT NULL,
    reason TEXT NULL,
    created_at BIGINT NOT NULL,
    INDEX official_dupr_adjustment_logs_player_id_idx (player_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

const migrations: Migration[] = [
  {
    id: "0000_mysql_initial_schema",
    statements: initialSchemaStatements,
  },
  {
    id: "0004_player_rating_chart_projection",
    statements: [
      `CREATE TABLE player_rating_chart_projections (
        player_id VARCHAR(255) PRIMARY KEY,
        generated_at BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE player_rating_chart_points (
        id VARCHAR(255) PRIMARY KEY,
        player_id VARCHAR(255) NOT NULL,
        category VARCHAR(16) NOT NULL,
        rating DOUBLE NOT NULL,
        source VARCHAR(16) NOT NULL,
        point_at BIGINT NOT NULL,
        generated_at BIGINT NOT NULL,
        INDEX player_rating_chart_points_player_category_point_at_idx
          (player_id, category, point_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ],
  },
  {
    id: "0005_player_status_message_max_length",
    beforeApply: async (executor) => {
      const result = await executor.execute(`
        SELECT username, CHAR_LENGTH(status_message) AS status_message_length
        FROM players
        WHERE status_message IS NOT NULL
          AND CHAR_LENGTH(status_message) > 20
        LIMIT 1
      `);
      const invalidPlayer = result.rows[0];
      if (!invalidPlayer) return;

      throw new Error(
        `상태메시지 최대 길이를 20자로 줄일 수 없습니다. ${String(invalidPlayer.username)}의 상태메시지가 ${String(invalidPlayer.status_message_length)}자입니다. 데이터를 먼저 20자 이하로 수정하세요.`,
      );
    },
    statements: [
      "ALTER TABLE players MODIFY COLUMN status_message VARCHAR(20) NULL",
    ],
  },
  {
    id: "0006_match_participants_player_match_index",
    statements: [
      "CREATE INDEX match_participants_player_match_idx ON match_participants (player_id, match_id)",
    ],
  },
];

export const runMigrations = async () => {
  const client = getDbClient();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS __pkpkdupr_migrations (
      id VARCHAR(191) PRIMARY KEY,
      applied_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  for (const migration of migrations) {
    const existing = await client.execute({
      sql: "SELECT id FROM __pkpkdupr_migrations WHERE id = ?",
      args: [migration.id],
    });
    if (existing.rows.length > 0) continue;

    const transaction = await client.transaction("write");
    try {
      await migration.beforeApply?.(transaction);
      for (const statement of migration.statements) {
        await transaction.execute(statement);
      }
      await transaction.execute({
        sql: "INSERT INTO __pkpkdupr_migrations (id, applied_at) VALUES (?, ?)",
        args: [migration.id, Math.floor(Date.now() / 1000)],
      });
      await transaction.commit();
    } catch (error) {
      transaction.close();
      throw error;
    }
  }
};

if (process.argv[1]?.includes("migrate.")) {
  runMigrations()
    .then(() => console.log("[DB] MySQL migrations applied"))
    .catch((error) => {
      console.error("[DB] Failed to apply MySQL migrations", error);
      process.exitCode = 1;
    });
}

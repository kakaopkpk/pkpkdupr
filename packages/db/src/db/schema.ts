import {
  customType,
  doublePrecision,
  integer,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  DEFAULT_MATCH_MODE,
  matchModeValues,
  matchSourceValues,
  matchTypeValues,
} from "@pkpkdupr/shared/match";
import { PLAYER_STATUS_MESSAGE_MAX_LENGTH } from "@pkpkdupr/shared/player";

/**
 * 테이블 정의는 쿼리 빌더용이다. 실제 스키마는 supabase/migrations/*.sql이
 * 기준이며, 인덱스·제약 이름도 마이그레이션과 맞춘다.
 *
 * 타임스탬프는 Unix 초 BIGINT로 저장하고 저장소에는 Date로 노출한다.
 */
const unixTimestamp = customType<{ data: Date; driverData: number | string }>({
  dataType: () => "BIGINT",
  toDriver: (value) => Math.floor(value.getTime() / 1000),
  fromDriver: (value) => new Date(Number(value) * 1000),
});

const id = (name: string) => varchar(name, { length: 255 });

/**
 * username은 lower(username) 유니크 인덱스(players_username_lower_unique)로 대소문자 구분 없이 unique다.
 * drizzle 0.30 pg-core는 표현식 인덱스를 정의하지 못해 그 인덱스는 마이그레이션에만 있다.
 */
export const players = pgTable("players", {
  id: id("id").primaryKey(),
  username: varchar("username", { length: 191 }).notNull(),
  duprRating: text("dupr_rating"),
  gender: varchar("gender", { length: 8 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  avatarUrl: text("avatar_url"),
  affiliationsJson: text("affiliations_json"),
  statusMessage: varchar("status_message", {
    length: PLAYER_STATUS_MESSAGE_MAX_LENGTH,
  }),
  statusMessageBackgroundColor: varchar("status_message_background_color", {
    length: 32,
  }),
  /** Supabase Auth 사용자(auth.users.id). 아직 로그인해 연결되지 않은 회원은 null이다. */
  authUserId: uuid("auth_user_id").unique("players_auth_user_id_unique"),
  createdAt: unixTimestamp("created_at").notNull(),
  updatedAt: unixTimestamp("updated_at").notNull(),
});

/** 관리자 권한이 있는 회원. 관리자도 일반 회원으로 경기에 참여한다. */
export const playerAdmins = pgTable("player_admins", {
  playerId: id("player_id").primaryKey(),
  createdAt: unixTimestamp("created_at").notNull(),
});

/** 1회용 초대 코드. 평문은 저장하지 않고 SHA-256 hex만 둔다. */
export const inviteCodes = pgTable("invite_codes", {
  id: id("id").primaryKey(),
  codeHash: varchar("code_hash", { length: 64 })
    .notNull()
    .unique("invite_codes_code_hash_unique"),
  createdByPlayerId: id("created_by_player_id").notNull(),
  createdAt: unixTimestamp("created_at").notNull(),
  expiresAt: unixTimestamp("expires_at").notNull(),
  usedByPlayerId: id("used_by_player_id"),
  usedAt: unixTimestamp("used_at"),
}, (table) => ({
  createdAtIndex: index("invite_codes_created_at_idx").on(table.createdAt),
}));

export const playerCreationLogs = pgTable("player_creation_logs", {
  id: id("id").primaryKey(),
  playerId: id("player_id").notNull(),
  createdByPlayerId: id("created_by_player_id"),
  createdByUsername: varchar("created_by_username", { length: 191 }).notNull(),
  creationSource: varchar("creation_source", { length: 64 }).notNull(),
  createdAt: unixTimestamp("created_at").notNull(),
}, (table) => ({
  playerIdIndex: index("player_creation_logs_player_id_idx").on(table.playerId),
}));

/** 미연결 회원이 Auth 사용자와 자동 연결된 기록. 회원이 지워져도 남도록 FK를 두지 않는다. */
export const playerAuthLinkLogs = pgTable("player_auth_link_logs", {
  id: id("id").primaryKey(),
  playerId: id("player_id").notNull(),
  authUserId: uuid("auth_user_id").notNull(),
  linkMethod: varchar("link_method", { length: 32 }).notNull(),
  createdAt: unixTimestamp("created_at").notNull(),
}, (table) => ({
  playerIdIndex: index("player_auth_link_logs_player_id_idx").on(table.playerId),
}));

export const playerStatusChangeLogs = pgTable("player_status_change_logs", {
  id: id("id").primaryKey(),
  playerId: id("player_id").notNull(),
  previousStatus: varchar("previous_status", { length: 32 }).notNull(),
  nextStatus: varchar("next_status", { length: 32 }).notNull(),
  changedByPlayerId: id("changed_by_player_id").notNull(),
  changedByUsername: varchar("changed_by_username", { length: 191 }).notNull(),
  changedAt: unixTimestamp("changed_at").notNull(),
}, (table) => ({
  playerIdIndex: index("player_status_change_logs_player_id_idx").on(
    table.playerId,
  ),
}));

export const playerRatingChangeLogs = pgTable("player_rating_change_logs", {
  id: id("id").primaryKey(),
  playerId: id("player_id").notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  sourceLogId: id("source_log_id").notNull(),
  previousRatingJson: text("previous_rating_json").notNull(),
  nextRatingJson: text("next_rating_json").notNull(),
  deltaJson: text("delta_json").notNull(),
  createdAt: unixTimestamp("created_at").notNull(),
}, (table) => ({
  playerIdIndex: index("player_rating_change_logs_player_id_idx").on(
    table.playerId,
  ),
  sourceLogIdIndex: index("player_rating_change_logs_source_log_id_idx").on(
    table.source,
    table.sourceLogId,
  ),
}));

/**
 * 프로필 차트 전용 materialized view입니다. 원본 평점 로그는
 * playerRatingChangeLogs에 유지하고, 이 테이블은 최대 90일의 압축된 지점만
 * 보관합니다.
 */
export const playerRatingChartProjections = pgTable(
  "player_rating_chart_projections",
  {
    playerId: id("player_id").primaryKey(),
    generatedAt: unixTimestamp("generated_at").notNull(),
  },
);

export const playerRatingChartPoints = pgTable(
  "player_rating_chart_points",
  {
    id: id("id").primaryKey(),
    playerId: id("player_id").notNull(),
    category: varchar("category", { length: 16 }).notNull(),
    rating: doublePrecision("rating").notNull(),
    source: varchar("source", { length: 16 }).notNull(),
    pointAt: unixTimestamp("point_at").notNull(),
    generatedAt: unixTimestamp("generated_at").notNull(),
  },
  (table) => ({
    playerCategoryPointIndex: index(
      "player_rating_chart_points_player_category_point_at_idx",
    ).on(table.playerId, table.category, table.pointAt),
  }),
);

export const matches = pgTable("matches", {
  id: id("id").primaryKey(),
  type: varchar("type", { length: 32, enum: matchTypeValues }).notNull(),
  mode: varchar("mode", { length: 32, enum: matchModeValues })
    .notNull()
    .default(DEFAULT_MATCH_MODE),
  source: varchar("source", { length: 32, enum: matchSourceValues })
    .notNull()
    .default("player_created"),
  creatorPlayerId: id("creator_player_id").notNull(),
  name: varchar("name", { length: 255 }),
  sessionId: id("session_id"),
  sessionName: varchar("session_name", { length: 255 }),
  sessionDate: unixTimestamp("session_date"),
  status: varchar("status", { length: 32 }).notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  courtName: varchar("court_name", { length: 255 }),
  matchStartsAt: unixTimestamp("match_starts_at").notNull(),
  completedAt: unixTimestamp("completed_at"),
  resultSubmittedByPlayerId: id("result_submitted_by_player_id"),
  resultSubmittedAt: unixTimestamp("result_submitted_at"),
  autoApprovalDueAt: unixTimestamp("auto_approval_due_at"),
  autoApprovedAt: unixTimestamp("auto_approved_at"),
  autoApprovalRatingAppliedAt: unixTimestamp("auto_approval_rating_applied_at"),
  createdAt: unixTimestamp("created_at").notNull(),
  updatedAt: unixTimestamp("updated_at").notNull(),
}, (table) => ({
  sessionIdIndex: index("matches_session_id_idx").on(table.sessionId),
  statusAutoApprovalDueAtIndex: index(
    "matches_status_auto_approval_due_at_idx",
  ).on(table.status, table.autoApprovalDueAt),
}));

export const matchSessions = pgTable(
  "match_sessions",
  {
    id: id("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    date: unixTimestamp("date").notNull(),
    location: varchar("location", { length: 255 }).notNull(),
    createdAt: unixTimestamp("created_at").notNull(),
    updatedAt: unixTimestamp("updated_at").notNull(),
  },
  (table) => ({
    nameDateUnique: uniqueIndex("match_sessions_name_date_unique").on(
      table.name,
      table.date,
    ),
  }),
);

export const matchSessionParticipants = pgTable(
  "match_session_participants",
  {
    id: id("id").primaryKey(),
    sessionId: id("session_id").notNull(),
    playerId: id("player_id").notNull(),
    createdAt: unixTimestamp("created_at").notNull(),
  },
  (table) => ({
    sessionPlayerUnique: uniqueIndex(
      "match_session_participants_session_player_unique",
    ).on(table.sessionId, table.playerId),
  }),
);

export const matchScores = pgTable("match_scores", {
  id: id("id").primaryKey(),
  matchId: id("match_id").notNull(),
  scoreA: integer("score_a").notNull(),
  scoreB: integer("score_b").notNull(),
}, (table) => ({
  matchIdIndex: index("match_scores_match_id_idx").on(table.matchId),
}));

export const matchParticipants = pgTable("match_participants", {
  id: id("id").primaryKey(),
  matchId: id("match_id").notNull(),
  teamIndex: integer("team_index").notNull(),
  playerId: id("player_id").notNull(),
  duprRatingJson: text("dupr_rating_json"),
}, (table) => ({
  matchIdIndex: index("match_participants_match_id_idx").on(table.matchId),
  playerIdIndex: index("match_participants_player_id_idx").on(table.playerId),
  playerMatchIndex: index("match_participants_player_match_idx").on(
    table.playerId,
    table.matchId,
  ),
}));

export const matchResultApprovals = pgTable("match_result_approvals", {
  id: id("id").primaryKey(),
  matchId: id("match_id").notNull(),
  playerId: id("player_id").notNull(),
  approvedAt: unixTimestamp("approved_at").notNull(),
}, (table) => ({
  matchPlayerUnique: uniqueIndex(
    "match_result_approvals_match_player_unique",
  ).on(table.matchId, table.playerId),
}));

export const officialDuprAdjustmentLogs = pgTable(
  "official_dupr_adjustment_logs",
  {
    id: id("id").primaryKey(),
    playerId: id("player_id").notNull(),
    changedByPlayerId: id("changed_by_player_id").notNull(),
    changedByUsername: varchar("changed_by_username", { length: 191 }).notNull(),
    ratingsJson: text("ratings_json").notNull(),
    confidenceJson: text("confidence_json").notNull(),
    previousRatingJson: text("previous_rating_json").notNull(),
    nextRatingJson: text("next_rating_json").notNull(),
    preUpdateAccuracyJson: text("pre_update_accuracy_json").notNull(),
    reason: text("reason"),
    createdAt: unixTimestamp("created_at").notNull(),
  },
  (table) => ({
    playerIdIndex: index("official_dupr_adjustment_logs_player_id_idx").on(
      table.playerId,
    ),
  }),
);

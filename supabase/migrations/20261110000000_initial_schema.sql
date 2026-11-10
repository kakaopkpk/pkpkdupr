-- 초기 스키마(13개 테이블).
-- - 타임스탬프는 Unix 초 BIGINT, JSON은 TEXT *_json 컬럼으로 저장한다.
-- - 모든 테이블에 RLS를 켜고 정책은 두지 않는다. anon·authenticated 역할은 Data API로
--   어떤 행도 읽거나 쓸 수 없고, DB 접근은 테이블 소유자(postgres)로 접속하는 서버만 한다.

CREATE TABLE players (
  id VARCHAR(255) PRIMARY KEY,
  username VARCHAR(191) NOT NULL,
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
  updated_at BIGINT NOT NULL,
  CONSTRAINT players_username_unique UNIQUE (username)
);

CREATE TABLE player_creation_logs (
  id VARCHAR(255) PRIMARY KEY,
  player_id VARCHAR(255) NOT NULL,
  created_by_player_id VARCHAR(255) NULL,
  created_by_username VARCHAR(191) NOT NULL,
  creation_source VARCHAR(64) NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX player_creation_logs_player_id_idx
  ON player_creation_logs (player_id);

CREATE TABLE player_status_change_logs (
  id VARCHAR(255) PRIMARY KEY,
  player_id VARCHAR(255) NOT NULL,
  previous_status VARCHAR(32) NOT NULL,
  next_status VARCHAR(32) NOT NULL,
  changed_by_player_id VARCHAR(255) NOT NULL,
  changed_by_username VARCHAR(191) NOT NULL,
  changed_at BIGINT NOT NULL
);
CREATE INDEX player_status_change_logs_player_id_idx
  ON player_status_change_logs (player_id);

CREATE TABLE player_rating_change_logs (
  id VARCHAR(255) PRIMARY KEY,
  player_id VARCHAR(255) NOT NULL,
  source VARCHAR(64) NOT NULL,
  source_log_id VARCHAR(255) NOT NULL,
  previous_rating_json TEXT NOT NULL,
  next_rating_json TEXT NOT NULL,
  delta_json TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX player_rating_change_logs_player_id_idx
  ON player_rating_change_logs (player_id);
CREATE INDEX player_rating_change_logs_source_log_id_idx
  ON player_rating_change_logs (source, source_log_id);

-- 프로필 차트 전용 materialized view. 원본은 player_rating_change_logs에 있다.
CREATE TABLE player_rating_chart_projections (
  player_id VARCHAR(255) PRIMARY KEY,
  generated_at BIGINT NOT NULL
);

CREATE TABLE player_rating_chart_points (
  id VARCHAR(255) PRIMARY KEY,
  player_id VARCHAR(255) NOT NULL,
  category VARCHAR(16) NOT NULL,
  rating DOUBLE PRECISION NOT NULL,
  source VARCHAR(16) NOT NULL,
  point_at BIGINT NOT NULL,
  generated_at BIGINT NOT NULL
);
CREATE INDEX player_rating_chart_points_player_category_point_at_idx
  ON player_rating_chart_points (player_id, category, point_at);

CREATE TABLE matches (
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
  updated_at BIGINT NOT NULL
);
CREATE INDEX matches_session_id_idx ON matches (session_id);
CREATE INDEX matches_status_auto_approval_due_at_idx
  ON matches (status, auto_approval_due_at);

CREATE TABLE match_sessions (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  "date" BIGINT NOT NULL,
  location VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT match_sessions_name_date_unique UNIQUE (name, "date")
);

CREATE TABLE match_session_participants (
  id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL,
  CONSTRAINT match_session_participants_session_player_unique
    UNIQUE (session_id, player_id)
);

CREATE TABLE match_scores (
  id VARCHAR(255) PRIMARY KEY,
  match_id VARCHAR(255) NOT NULL,
  score_a INTEGER NOT NULL,
  score_b INTEGER NOT NULL
);
CREATE INDEX match_scores_match_id_idx ON match_scores (match_id);

CREATE TABLE match_participants (
  id VARCHAR(255) PRIMARY KEY,
  match_id VARCHAR(255) NOT NULL,
  team_index INTEGER NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  dupr_rating_json TEXT NULL
);
CREATE INDEX match_participants_match_id_idx ON match_participants (match_id);
CREATE INDEX match_participants_player_id_idx ON match_participants (player_id);
CREATE INDEX match_participants_player_match_idx
  ON match_participants (player_id, match_id);

CREATE TABLE match_result_approvals (
  id VARCHAR(255) PRIMARY KEY,
  match_id VARCHAR(255) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  approved_at BIGINT NOT NULL,
  CONSTRAINT match_result_approvals_match_player_unique UNIQUE (match_id, player_id)
);

CREATE TABLE official_dupr_adjustment_logs (
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
  created_at BIGINT NOT NULL
);
CREATE INDEX official_dupr_adjustment_logs_player_id_idx
  ON official_dupr_adjustment_logs (player_id);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_creation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_status_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_rating_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_rating_chart_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_rating_chart_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_result_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_dupr_adjustment_logs ENABLE ROW LEVEL SECURITY;

-- 이메일 앞부분 자동 연결 감사 로그.
-- - 회원이 지워져도 기록이 남도록 다른 player_*_logs처럼 FK 없이 id만 보관한다.
-- - RLS를 켜고 정책은 두지 않는다(DB 접근은 서버만 한다).

CREATE TABLE player_auth_link_logs (
  id VARCHAR(255) PRIMARY KEY,
  player_id VARCHAR(255) NOT NULL,
  auth_user_id UUID NOT NULL,
  link_method VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX player_auth_link_logs_player_id_idx
  ON player_auth_link_logs (player_id);

ALTER TABLE player_auth_link_logs ENABLE ROW LEVEL SECURITY;

-- 경기 수정 감사 로그. 이미 완료된 경기를 PUT /api/matches/:matchId로 고칠 때(회원·관리자) 같은 트랜잭션에서 남긴다.
-- 진행 중 경기에 첫 점수를 넣는 기록과 바뀐 내용이 없는 저장은 남기지 않는다.
-- before_snapshot·after_snapshot은 고치기 전·후의 경기 전체(shared Match JSON)다.
CREATE TABLE match_edit_logs (
  id VARCHAR(255) PRIMARY KEY,
  match_id VARCHAR(255) NOT NULL,
  edited_by_player_id VARCHAR(255) NOT NULL,
  edited_by_admin BOOLEAN NOT NULL DEFAULT false,
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB NOT NULL,
  edited_at BIGINT NOT NULL
);
CREATE INDEX match_edit_logs_match_id_idx
  ON match_edit_logs (match_id);

-- 기존 테이블과 같이 RLS on·정책 없음(기본 거부). DB 접근은 서버만 한다.
ALTER TABLE match_edit_logs ENABLE ROW LEVEL SECURITY;

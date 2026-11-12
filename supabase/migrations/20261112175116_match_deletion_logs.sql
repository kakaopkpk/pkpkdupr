-- 경기 삭제 감사 로그. 회원 삭제(DELETE /api/matches/:matchId)와 관리자 삭제가 같이 쓴다.
-- match_snapshot은 지운 시점의 경기 전체(원래 id·completedAt·팀·점수·세션 포함)를 담아 관리자가 되살릴 근거로 쓴다.
-- 지운 경기는 matches에서 사라지므로 match_id에 외래 키를 두지 않는다.
CREATE TABLE match_deletion_logs (
  id VARCHAR(255) PRIMARY KEY,
  match_id VARCHAR(255) NOT NULL,
  deleted_by_player_id VARCHAR(255) NOT NULL,
  deleted_by_admin BOOLEAN NOT NULL DEFAULT false,
  match_snapshot JSONB NOT NULL,
  deleted_at BIGINT NOT NULL
);
CREATE INDEX match_deletion_logs_match_id_idx
  ON match_deletion_logs (match_id);

-- 기존 테이블과 같이 RLS on·정책 없음(기본 거부). DB 접근은 서버만 한다.
ALTER TABLE match_deletion_logs ENABLE ROW LEVEL SECURITY;

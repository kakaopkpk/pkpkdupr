-- 세션 칭찬. 회원이 세션마다 한 번, 후보 한 명에게 보낸다(자기 자신 포함). 바꾸거나 취소할 수 없다.
-- 세션·회원이 지워지면 함께 지워진다.
CREATE TABLE session_praises (
  session_id VARCHAR(255) NOT NULL
    CONSTRAINT session_praises_session_id_fkey REFERENCES match_sessions (id) ON DELETE CASCADE,
  voter_player_id VARCHAR(255) NOT NULL
    CONSTRAINT session_praises_voter_player_id_fkey REFERENCES players (id) ON DELETE CASCADE,
  target_player_id VARCHAR(255) NOT NULL
    CONSTRAINT session_praises_target_player_id_fkey REFERENCES players (id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  CONSTRAINT session_praises_pkey PRIMARY KEY (session_id, voter_player_id)
);
CREATE INDEX session_praises_target_player_id_idx
  ON session_praises (target_player_id);

-- 기존 테이블과 같이 RLS on·정책 없음(기본 거부). DB 접근은 서버만 한다.
ALTER TABLE session_praises ENABLE ROW LEVEL SECURITY;

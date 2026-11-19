-- 대회 최종 순위. 관리자가 1~3위를 직접 정한다(대회 룰이 매번 달라 자동 계산하지 않는다).
-- 한 순위에 참가 단위(1명·2명·팀)의 선수 여러 명이 들어가고, position은 관리자가 고른 순서(0이 대표)다.
-- 한 세션에서 한 회원은 한 순위에만 들어간다. 세션·회원이 지워지면 함께 지워진다.
-- 세션 종류가 대회에서 바뀌어도 행은 남는다(응답에서만 생략).
CREATE TABLE match_session_placements (
  session_id VARCHAR(255) NOT NULL
    CONSTRAINT match_session_placements_session_id_fkey REFERENCES match_sessions (id) ON DELETE CASCADE,
  player_id VARCHAR(255) NOT NULL
    CONSTRAINT match_session_placements_player_id_fkey REFERENCES players (id) ON DELETE CASCADE,
  place INTEGER NOT NULL CONSTRAINT match_session_placements_place_check CHECK (place BETWEEN 1 AND 3),
  position INTEGER NOT NULL CONSTRAINT match_session_placements_position_check CHECK (position >= 0),
  CONSTRAINT match_session_placements_pkey PRIMARY KEY (session_id, player_id)
);
CREATE INDEX match_session_placements_player_id_idx
  ON match_session_placements (player_id);

-- 기존 테이블과 같이 RLS on·정책 없음(기본 거부). DB 접근은 서버만 한다.
ALTER TABLE match_session_placements ENABLE ROW LEVEL SECURITY;

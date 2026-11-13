-- 회원이 축하 시트로 확인한 업적. 업적 자체는 저장하지 않고 완료 경기로 조회 시 계산하므로,
-- 여기에는 "어느 획득 건까지 봤는지"만 남긴다.
-- earned_match_id는 확인할 때의 획득 경기다. 업적을 잃었다가 다른 경기로 다시 받으면 값이 달라져 다시 미확인이 된다.
CREATE TABLE player_seen_achievements (
  player_id VARCHAR(255) NOT NULL
    CONSTRAINT player_seen_achievements_player_id_fkey REFERENCES players (id) ON DELETE CASCADE,
  achievement_id VARCHAR(64) NOT NULL,
  earned_match_id VARCHAR(255) NOT NULL,
  seen_at BIGINT NOT NULL,
  CONSTRAINT player_seen_achievements_pkey PRIMARY KEY (player_id, achievement_id)
);

-- 기존 테이블과 같이 RLS on·정책 없음(기본 거부). DB 접근은 서버만 한다.
ALTER TABLE player_seen_achievements ENABLE ROW LEVEL SECURITY;

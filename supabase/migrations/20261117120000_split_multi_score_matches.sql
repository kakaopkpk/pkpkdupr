-- 점수가 여러 개인 과거 2선승 경기를 게임마다 단판 경기 하나로 쪼갠다.
-- - 게임 순서는 점수 행 id 자연 정렬(길이 → 문자열) 순서다.
-- - 첫 게임은 원래 경기 id를 그대로 쓰고, k번째 게임(k >= 2)은 'M' || md5('<원래 id>:game:<k>') 16진수 7자를 쓴다(isEntityId 경기 형식, 다시 돌려도 같은 id).
-- - 팀·종류·세션·장소·코트·기록자·source·평점 제외 여부는 원래 경기에서 복사한다.
-- - 게임마다 실제 시각 기록이 없으므로 k번째 게임은 시작에 (k-1)×10분, 완료·결과 입력에 (k-1)초를 더해 목록·평점 재생 순서가 게임 순서가 되게 한다.
-- 쪼갠 뒤 평점은 전체 재계산(관리자 '평점 재계산')으로 다시 만든다. 재계산은 비어 있는 경기 전 평점 스냅샷만 채우므로 모든 경기의 스냅샷을 비운다.

CREATE TEMP TABLE split_games AS
SELECT
  s.id AS score_id,
  s.match_id,
  row_number() OVER (PARTITION BY s.match_id ORDER BY length(s.id), s.id) AS game_no
FROM match_scores s
WHERE s.match_id IN (
  SELECT match_id FROM match_scores GROUP BY match_id HAVING count(*) > 1
);

CREATE TEMP TABLE split_new_matches AS
SELECT
  g.score_id,
  g.match_id,
  g.game_no,
  'M' || substr(md5(g.match_id || ':game:' || g.game_no), 1, 7) AS new_match_id
FROM split_games g
WHERE g.game_no > 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM split_new_matches n JOIN matches m ON m.id = n.new_match_id
  ) OR (
    SELECT count(DISTINCT new_match_id) <> count(*) FROM split_new_matches
  ) THEN
    RAISE EXCEPTION '쪼갠 경기의 새 id가 기존 경기 또는 서로 겹칩니다.';
  END IF;
END
$$;

-- 시각 컬럼은 epoch 초 단위다. 레거시 밀리초 값(>= 100,000,000,000)이면 같은 간격을 밀리초로 더한다.
INSERT INTO matches (
  id, type, source, creator_player_id, name, session_id, session_name, session_date, status,
  location, court_name, match_starts_at, completed_at, result_submitted_by_player_id,
  result_submitted_at, created_at, updated_at, rating_excluded
)
SELECT
  n.new_match_id, m.type, m.source, m.creator_player_id, m.name, m.session_id, m.session_name,
  m.session_date, m.status, m.location, m.court_name,
  m.match_starts_at
    + (n.game_no - 1) * 600 * CASE WHEN m.match_starts_at >= 100000000000 THEN 1000 ELSE 1 END,
  m.completed_at
    + (n.game_no - 1) * CASE WHEN m.completed_at >= 100000000000 THEN 1000 ELSE 1 END,
  m.result_submitted_by_player_id,
  m.result_submitted_at
    + (n.game_no - 1) * CASE WHEN m.result_submitted_at >= 100000000000 THEN 1000 ELSE 1 END,
  m.created_at, m.updated_at, m.rating_excluded
FROM split_new_matches n
JOIN matches m ON m.id = n.match_id;

INSERT INTO match_participants (id, match_id, team_index, player_id, dupr_rating_json)
SELECT
  n.new_match_id || '-team-' || p.team_index || '-' || p.player_id,
  n.new_match_id,
  p.team_index,
  p.player_id,
  NULL
FROM split_new_matches n
JOIN match_participants p ON p.match_id = n.match_id;

UPDATE match_scores s
SET match_id = n.new_match_id, id = n.new_match_id || '-score-1'
FROM split_new_matches n
WHERE s.id = n.score_id;

UPDATE match_participants SET dupr_rating_json = NULL WHERE dupr_rating_json IS NOT NULL;

DROP TABLE split_new_matches;
DROP TABLE split_games;

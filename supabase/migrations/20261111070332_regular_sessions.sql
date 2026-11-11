-- 월·목 정기 세션을 날짜당 하나로 묶는다.
--   1. match_sessions에 정기 세션 날짜 키(KST YYYY-MM-DD) 컬럼과 유니크 제약을 추가한다.
--      값이 있으면 정기 세션, NULL이면 회원·관리자가 만든 세션이다.
--   2. 세션이 없는 기존 경기 중 KST 월·목 18:00 이상 22:00 미만에 시작한 경기를
--      날짜별 정기 세션 하나로 묶고, 그 경기 선수들을 세션 참여자로 추가한다.
--
-- 시각 컬럼은 모두 epoch 초 단위 BIGINT다. 레거시 밀리초 match_starts_at(>= 100,000,000,000)은 1000으로 나눠 판정한다.
-- 정기 세션 행 값은 packages/shared/src/session.ts의 REGULAR_SESSION_NAME·REGULAR_SESSION_LOCATION과 맞춘다.

ALTER TABLE match_sessions
  ADD COLUMN regular_date_key VARCHAR(10) NULL;

ALTER TABLE match_sessions
  ADD CONSTRAINT match_sessions_regular_date_key_unique UNIQUE (regular_date_key);

CREATE TEMP TABLE regular_session_backfill_matches AS
SELECT
  candidate.id AS match_id,
  to_char(candidate.kst_starts_at, 'YYYY-MM-DD') AS date_key
FROM (
  SELECT
    id,
    to_timestamp(
      CASE
        WHEN match_starts_at >= 100000000000 THEN match_starts_at / 1000
        ELSE match_starts_at
      END
    ) AT TIME ZONE 'Asia/Seoul' AS kst_starts_at
  FROM matches
  WHERE session_id IS NULL
) AS candidate
WHERE EXTRACT(ISODOW FROM candidate.kst_starts_at) IN (1, 4)
  AND EXTRACT(HOUR FROM candidate.kst_starts_at) >= 18
  AND EXTRACT(HOUR FROM candidate.kst_starts_at) < 22;

-- 세션 id는 isEntityId(…, "session") 형식(S + 소문자·숫자 7자)이어야 한다. md5 16진수는 그 문자 집합에 들어간다.
CREATE TEMP TABLE regular_session_backfill_sessions AS
SELECT
  date_key,
  'S' || substr(md5(date_key || ':' || random()::text), 1, 7) AS session_id,
  EXTRACT(EPOCH FROM ((date_key::date + TIME '18:00') AT TIME ZONE 'Asia/Seoul'))::BIGINT
    AS session_date
FROM (SELECT DISTINCT date_key FROM regular_session_backfill_matches) AS dates;

INSERT INTO match_sessions (
  id,
  name,
  "date",
  location,
  created_at,
  updated_at,
  regular_date_key
)
SELECT
  session_id,
  '정기 세션',
  session_date,
  '야탑초등학교',
  FLOOR(EXTRACT(EPOCH FROM now()))::BIGINT,
  FLOOR(EXTRACT(EPOCH FROM now()))::BIGINT,
  date_key
FROM regular_session_backfill_sessions;

UPDATE matches
SET
  session_id = sessions.session_id,
  session_name = '정기 세션',
  session_date = sessions.session_date
FROM regular_session_backfill_matches AS backfill
JOIN regular_session_backfill_sessions AS sessions
  ON sessions.date_key = backfill.date_key
WHERE matches.id = backfill.match_id;

INSERT INTO match_session_participants (id, session_id, player_id, created_at)
SELECT DISTINCT
  sessions.session_id || '-' || participants.player_id,
  sessions.session_id,
  participants.player_id,
  FLOOR(EXTRACT(EPOCH FROM now()))::BIGINT
FROM regular_session_backfill_matches AS backfill
JOIN regular_session_backfill_sessions AS sessions
  ON sessions.date_key = backfill.date_key
JOIN match_participants AS participants
  ON participants.match_id = backfill.match_id
ON CONFLICT DO NOTHING;

DROP TABLE regular_session_backfill_matches;
DROP TABLE regular_session_backfill_sessions;

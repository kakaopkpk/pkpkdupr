-- 정기 세션 이름을 날짜 키의 요일별 이름("월요 정기운동" | "목요 정기운동")으로 바꾼다.
-- 이름 규칙은 packages/shared/src/session.ts의 getRegularSessionName과 맞춘다.
-- 경기 행에 비정규화된 세션 이름(matches.session_name)도 같은 값으로 맞춘다.

UPDATE match_sessions
SET name = substr('일월화수목금토', EXTRACT(DOW FROM regular_date_key::date)::int + 1, 1) || '요 정기운동'
WHERE regular_date_key IS NOT NULL;

UPDATE matches
SET session_name = sessions.name
FROM match_sessions AS sessions
WHERE matches.session_id = sessions.id
  AND sessions.regular_date_key IS NOT NULL;

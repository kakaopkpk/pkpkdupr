-- 세션 종류: regular(정기), custom(회원), tournament(대회).
-- 정기 세션 날짜 유일성은 regular_date_key가 맡고, 정기 세션만 regular_date_key를 가진다.
ALTER TABLE match_sessions
  ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'custom';

UPDATE match_sessions SET kind = 'regular' WHERE regular_date_key IS NOT NULL;

ALTER TABLE match_sessions
  ADD CONSTRAINT match_sessions_kind_check
    CHECK (kind IN ('regular', 'custom', 'tournament')),
  ADD CONSTRAINT match_sessions_regular_date_key_kind_check
    CHECK ((kind = 'regular') = (regular_date_key IS NOT NULL));

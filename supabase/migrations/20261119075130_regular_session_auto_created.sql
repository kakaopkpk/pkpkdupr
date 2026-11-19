-- 정기 세션을 서버가 자동으로 만들었는지(매일 예약 작업·다가오는 세션 조회·경기 기록 등, 정기 쉬는 날 해제 포함).
-- 관리자가 직접 만든 정기 세션과 다른 종류의 세션은 false다.
-- 자동 정기 세션만 지우면 그 날짜가 정기 쉬는 날(regular_session_skips canceled)로 남고, 종류를 바꿀 수 없다.
ALTER TABLE match_sessions
  ADD COLUMN auto_created BOOLEAN NOT NULL DEFAULT false;

-- 기존 정기 세션은 모두 자동 생성으로 본다
UPDATE match_sessions SET auto_created = true WHERE kind = 'regular';

ALTER TABLE match_sessions
  ADD CONSTRAINT match_sessions_auto_created_kind_check
    CHECK (NOT auto_created OR kind = 'regular');

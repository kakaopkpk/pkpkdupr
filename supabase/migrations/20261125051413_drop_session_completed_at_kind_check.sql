-- 회원·대회 세션도 회원이 완료할 수 있으므로 completed_at을 정기 세션에만 두던 제약을 지운다.
-- 종류를 바꾸면 저장소가 completed_at을 지운다.
ALTER TABLE match_sessions
  DROP CONSTRAINT IF EXISTS match_sessions_completed_at_kind_check;

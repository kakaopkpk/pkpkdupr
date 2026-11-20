-- 회원이 정기 세션을 완료한 시각(Unix 초). 정기 세션 종료(21:00 KST)부터 자동 완료(22:00 KST) 전까지 누구나 완료할 수 있다.
-- 완료 전이거나 정기 세션이 아니면 null이다. 22:00 자동 완료는 저장하지 않고 시각으로 판정한다.
ALTER TABLE match_sessions ADD COLUMN completed_at BIGINT;

ALTER TABLE match_sessions
  ADD CONSTRAINT match_sessions_completed_at_kind_check
    CHECK (completed_at IS NULL OR kind = 'regular');

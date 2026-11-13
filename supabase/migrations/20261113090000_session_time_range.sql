-- 회원 세션의 시작·종료 시각("HH:MM", KST)을 저장한다.
-- 기존 세션과 정기 세션은 null로 두며, 정기 세션 시각(18:00~22:00)은 서버가 응답에서 채운다.
ALTER TABLE match_sessions
  ADD COLUMN start_time VARCHAR(5),
  ADD COLUMN end_time VARCHAR(5);

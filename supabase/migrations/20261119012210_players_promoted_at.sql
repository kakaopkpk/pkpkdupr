-- 게스트가 정회원으로 승급된 시각(Unix 초).
-- - 승급 시점부터 저장하므로 기존 행은 채우지 않는다. 이미 승급한 회원·일반 가입 회원·게스트는 null이다.
ALTER TABLE players ADD COLUMN promoted_at BIGINT;

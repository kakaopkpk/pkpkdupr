-- 관리자 발급 아이디·비밀번호 로그인으로 전환한다.
-- - is_first_login: 관리자가 계정을 발급하거나 비밀번호를 초기화하면 true가 되고,
--   회원이 비밀번호를 바꾼 뒤 POST /api/me/password-changed로 false가 된다.
-- - 회원과 Auth 사용자는 관리자가 계정을 발급할 때만 연결하므로 초대 코드와 자동 연결 감사 로그를 지운다.

ALTER TABLE players ADD COLUMN is_first_login BOOLEAN NOT NULL DEFAULT false;

DROP TABLE invite_codes;

DROP TABLE player_auth_link_logs;

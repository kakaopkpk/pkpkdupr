-- Supabase Auth(Google 로그인) 전환.
-- - 회원(players)은 auth.users와 auth_user_id로 연결한다. 이메일은 auth.users에만 있고 여기에는 저장하지 않는다.
-- - 비밀번호 로그인을 없애므로 비밀번호 해시와 최초 로그인 여부 컬럼을 지운다.
-- - 관리자는 별도 계정이 아니라 player_admins에 등록된 회원이다.
-- - 초대 코드는 SHA-256 해시만 저장한다. 평문은 발급 응답에서만 보인다.
-- - 새 테이블도 RLS를 켜고 정책은 두지 않는다(DB 접근은 서버만 한다).

ALTER TABLE players
  ADD COLUMN auth_user_id UUID NULL
    CONSTRAINT players_auth_user_id_fkey REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD CONSTRAINT players_auth_user_id_unique UNIQUE (auth_user_id);

ALTER TABLE players
  DROP COLUMN password_hash,
  DROP COLUMN is_first_login;

-- 이메일 앞부분과 username을 대소문자 구분 없이 비교해 자동 연결한다.
CREATE INDEX players_username_lower_idx ON players (lower(username));

CREATE TABLE player_admins (
  player_id VARCHAR(255) PRIMARY KEY
    CONSTRAINT player_admins_player_id_fkey REFERENCES players (id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);

CREATE TABLE invite_codes (
  id VARCHAR(255) PRIMARY KEY,
  code_hash VARCHAR(64) NOT NULL,
  created_by_player_id VARCHAR(255) NOT NULL
    CONSTRAINT invite_codes_created_by_player_id_fkey REFERENCES players (id),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_by_player_id VARCHAR(255) NULL
    CONSTRAINT invite_codes_used_by_player_id_fkey REFERENCES players (id),
  used_at BIGINT NULL,
  CONSTRAINT invite_codes_code_hash_unique UNIQUE (code_hash)
);
CREATE INDEX invite_codes_created_at_idx ON invite_codes (created_at);

ALTER TABLE player_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

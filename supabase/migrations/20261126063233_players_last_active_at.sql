-- 회원이 마지막으로 앱에 들어온 시각(Unix 초). 웹이 앱을 열거나 앱으로 돌아올 때 부르는 GET /api/me에서 갱신한다.
-- - 기존 회원은 Supabase Auth 마지막 로그인 시각으로 채운다. 로그인한 적 없으면 null이다.
ALTER TABLE players ADD COLUMN last_active_at BIGINT;

UPDATE players AS p
SET last_active_at = floor(extract(epoch FROM u.last_sign_in_at))::BIGINT
FROM auth.users AS u
WHERE p.auth_user_id = u.id
  AND u.last_sign_in_at IS NOT NULL;

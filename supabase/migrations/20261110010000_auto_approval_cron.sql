-- 자동 합의(auto-approval) 예약 작업.
-- Supabase Cron(pg_cron)이 5분마다 pg_net으로 Edge Function `api`의
-- POST /api/internal/cron/auto-approvals를 호출한다.
--
-- 호출 주소와 시크릿은 마이그레이션에 넣지 않고 Supabase Vault에서 읽는다(docs/deploy.md 참고).
--   - project_url : https://<project-ref>.supabase.co
--   - cron_secret : 함수 secret CRON_SECRET과 같은 값
-- 두 값 중 하나라도 없으면(로컬 스택 등) 아무 요청도 보내지 않는다.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 같은 이름의 작업이 있으면 cron.schedule이 일정·명령을 덮어쓴다.
SELECT cron.schedule(
  'auto-approvals',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := secrets.project_url || '/functions/v1/api/internal/cron/auto-approvals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', secrets.cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  FROM (
    SELECT
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') AS project_url,
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret') AS cron_secret
  ) AS secrets
  WHERE secrets.project_url IS NOT NULL
    AND secrets.cron_secret IS NOT NULL;
  $$
);

# pkpkdupr 배포 (Supabase)

api는 Supabase Edge Function `api`로, DB 스키마는 `supabase/migrations/`로 배포합니다. main에 push되면 `.github/workflows/supabase-deploy.yml`이 자동으로 배포합니다.

```text
브라우저 ── https://<project-ref>.supabase.co/functions/v1/api/... ──> Edge Function `api`
                                                                        │ (apps/api Express app 번들)
                                                                        ▼
                                                  Supabase Postgres (커넥션 풀러, transaction mode)
Supabase Cron (pg_cron + pg_net) ── 5분마다 POST /api/internal/cron/auto-approvals ──┘
Edge Function `api` ── service role key ──> Supabase Storage `avatars` 버킷 (업로드·삭제)
브라우저 ── https://<project-ref>.supabase.co/storage/v1/object/public/avatars/... (아바타 읽기)
```

- 클라이언트의 API base URL은 `https://<project-ref>.supabase.co/functions/v1`이고, 경로는 로컬과 같은 `/api/...`입니다(함수 이름 `api`가 경로 첫 segment가 됩니다).
- 함수는 게이트웨이 JWT 검증을 끕니다(`supabase/config.toml`의 `[functions.api] verify_jwt = false`). 인증은 api가 `Authorization: Bearer <Supabase Auth access token>`을 Supabase Auth로 직접 확인해 합니다(아래 "로그인과 회원 연결").

## 패키징

Edge Runtime(Deno)은 확장자 없는 상대 import와 tsconfig paths를 그대로 해석하지 못하므로, apps/api를 esbuild로 묶어 함수 디렉터리에 둡니다.

```bash
pnpm build:edge   # apps/api/src/edge.ts → supabase/functions/api/dist/api.js
```

- 워크스페이스 소스(`apps/api`, `packages/*`)는 번들에 포함하고, npm 패키지는 설치된 버전 그대로 `npm:<이름>@<버전>` import로 남깁니다. Node 내장 모듈은 `node:` 접두사로 바꿉니다.
- 번들(`supabase/functions/api/dist/`)은 커밋하지 않습니다. 배포 workflow가 배포 직전에 만듭니다.
- 함수 진입점은 `supabase/functions/api/index.ts`이고, 번들의 `apps/api/src/edge.ts`가 Express app으로 요청을 넘깁니다. 요청 pathname에 `/functions/v1` 접두사가 남아 있으면 진입점에서 떼어 냅니다.

## Edge Runtime에서 달라지는 점

- 부팅 작업(dev mock 시딩)과 자동 합의 interval은 Edge Runtime에서 실행하지 않습니다. 로컬 Node 개발(`pnpm dev`)에서는 기존처럼 실행합니다.
  - 관리자는 별도 계정이 아니라 `player_admins`에 등록된 회원입니다. 첫 관리자는 SQL로 등록합니다(아래 6).
- 자동 합의는 Supabase Cron이 5분마다 `POST /api/internal/cron/auto-approvals`를 호출해 처리합니다. 헤더 `x-cron-secret`이 함수 secret `CRON_SECRET`과 같을 때만 실행하고, 아니면 401을 돌려줍니다.
- 아바타는 Supabase Storage에 저장합니다. 아래 "아바타 저장소"를 봅니다.

## 아바타 저장소 (Supabase Storage)

- 버킷 `avatars`는 `supabase/migrations/20261110020000_avatars_storage_bucket.sql`이 만듭니다(`supabase db push`로 적용). 공개 읽기, 파일당 1MB, 허용 형식 `image/jpeg`·`image/png`·`image/webp`입니다.
- 객체 경로는 `avatars/<playerId>/<uuid>.<ext>`이고, `players.avatar_url`에는 공개 절대 URL `https://<project-ref>.supabase.co/storage/v1/object/public/avatars/<playerId>/<uuid>.<ext>`를 저장합니다.
- `storage.objects`에 avatars용 insert·update·delete 정책이 없으므로 브라우저(anon·authenticated)는 쓸 수 없습니다. 업로드(`POST /api/me/avatar`)와 삭제(`DELETE /api/me/avatar`)는 함수가 service role key로 합니다. 교체하면 이전 파일을 지웁니다.
- 함수는 Supabase가 주입하는 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`를 쓰므로 운영에서 추가 secret은 필요 없습니다.

브라우저에서 쓰기가 막혀 있는지 확인합니다(400/403이어야 한다).

```bash
curl -si -X POST "https://<project-ref>.supabase.co/storage/v1/object/avatars/test/x.png" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>" \
  -H "Content-Type: image/png" --data-binary 'x'
```

## 1. Supabase 프로젝트 준비 (최초 1회)

1. [Supabase 대시보드](https://supabase.com/dashboard)에서 프로젝트를 만들고 DB 비밀번호를 보관합니다.
2. Project Settings → General에서 **Project ref**를 확인합니다.
3. Project Settings → Database → Connection pooling에서 **Transaction mode(포트 6543)** 연결 문자열을 확인합니다. 함수 secret `DATABASE_URL`로 씁니다.

   ```text
   postgresql://postgres.<project-ref>:<DB 비밀번호>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```

4. [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)에서 배포용 access token을 발급합니다.

## 2. GitHub secrets·variables

저장소 Settings → Secrets and variables → Actions에 등록합니다.

| 종류 | 이름 | 값 |
| --- | --- | --- |
| secret | `SUPABASE_ACCESS_TOKEN` | Supabase access token |
| secret | `SUPABASE_DB_PASSWORD` | 프로젝트 DB 비밀번호 (`supabase db push`가 사용) |
| variable | `SUPABASE_PROJECT_REF` | Project ref |

```bash
gh secret set SUPABASE_ACCESS_TOKEN
gh secret set SUPABASE_DB_PASSWORD
gh variable set SUPABASE_PROJECT_REF --body <project-ref>
```

## 3. 함수 secrets

함수 secret은 Edge Function의 환경 변수입니다. `SUPABASE_`로 시작하는 이름은 Supabase가 예약하므로 쓰지 않습니다.

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | 예 | 커넥션 풀러 transaction mode 주소(위 1-3). 없으면 Supabase가 주입하는 `SUPABASE_DB_URL`(직접 연결)로 대신하며 경고를 남깁니다. |
| `CORS_ALLOWED_ORIGINS` | 예 | 허용 origin(쉼표 구분). 운영값 `https://kakaopkpk.github.io` |
| `CRON_SECRET` | 예 | 자동 합의 cron 호출 인증값. Vault의 `cron_secret`과 같은 값 |
| `ALLOWED_EMAIL_DOMAIN` | 예 | 로그인을 허용할 이메일 도메인. 운영값 `kakaocorp.com`. 이 도메인과 정확히 같고 확인된 이메일만 통과합니다. |
| `QR_TOTP_SECRET` | 예 | 플레이어 QR 토큰 서명 키. 다른 값으로 대신하지 않습니다. |
| `STORAGE_PUBLIC_URL` | 아니오 | 아바타 공개 URL의 base. 없으면 `SUPABASE_URL`을 씁니다. 운영에서는 비워 두고, 로컬 `functions serve`에서만 `http://127.0.0.1:54321`로 넣습니다(함수 안의 `SUPABASE_URL`은 브라우저가 접근할 수 없는 `http://kong:8000`이기 때문). |

`ALLOWED_EMAIL_DOMAIN`·`QR_TOTP_SECRET` 중 하나라도 없으면 함수가 기동하지 않습니다(로컬 `functions serve` 포함). 토큰 확인에 쓰는 `SUPABASE_URL`·`SUPABASE_ANON_KEY`는 Supabase가 함수에 자동으로 넣습니다.

```bash
CRON_SECRET="$(openssl rand -hex 32)"
pnpm exec supabase secrets set --project-ref <project-ref> \
  DATABASE_URL='postgresql://postgres.<project-ref>:<DB 비밀번호>@aws-0-<region>.pooler.supabase.com:6543/postgres' \
  CORS_ALLOWED_ORIGINS='https://kakaopkpk.github.io' \
  CRON_SECRET="$CRON_SECRET" \
  ALLOWED_EMAIL_DOMAIN='kakaocorp.com' \
  QR_TOTP_SECRET="$(openssl rand -hex 32)"
pnpm exec supabase secrets list --project-ref <project-ref>
```

secret을 바꾼 뒤에는 함수를 다시 배포하지 않아도 새 요청부터 반영됩니다. `QR_TOTP_SECRET`을 바꾸면 이미 띄워 둔 QR 코드는 더 이상 검증되지 않습니다.

## 4. Supabase Cron용 Vault secrets

`supabase/migrations/20261110010000_auto_approval_cron.sql`이 pg_cron 작업 `auto-approvals`(5분 주기)를 등록합니다. 호출 주소와 인증값은 Vault에서 읽으므로 SQL Editor에서 한 번 넣습니다. 두 값 중 하나라도 없으면 작업은 아무 요청도 보내지 않습니다.

```sql
SELECT vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
SELECT vault.create_secret('<CRON_SECRET과 같은 값>', 'cron_secret');

-- 값을 바꿀 때
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'cron_secret'),
  '<새 값>'
);
```

실행 이력은 다음으로 확인합니다.

```sql
SELECT * FROM cron.job WHERE jobname = 'auto-approvals';
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
SELECT id, status_code, content, error_msg FROM net._http_response ORDER BY created DESC LIMIT 10;
```

## 5. Google 로그인 (최초 1회)

운영에서는 Google 로그인만 켭니다. 이메일·비밀번호 등 다른 provider는 끕니다.

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services
   1. OAuth consent screen: User type은 회사 Workspace 안에서만 쓰면 **Internal**을 고릅니다. 앱 이름·지원 이메일을 넣고, scope는 기본(`email`, `profile`, `openid`)만 둡니다.
   2. Credentials → Create credentials → **OAuth client ID** → Application type **Web application**
      - Authorized JavaScript origins: `https://kakaopkpk.github.io`
      - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
   3. 만들어진 Client ID·Client secret을 보관합니다.
2. Supabase 대시보드 → Authentication
   1. Sign In / Providers → **Google**을 켜고 Client ID·Client secret을 넣습니다.
   2. Sign In / Providers → **Email**은 끕니다(매직링크·비밀번호 로그인 차단).
   3. URL Configuration → Site URL `https://kakaopkpk.github.io/<저장소 경로>/`, Redirect URLs에 web·admin 배포 주소를 넣습니다.

### 로그인과 회원 연결

- api는 요청의 access token으로 Supabase Auth 사용자(이메일, 이메일 확인 여부)를 조회합니다. 브라우저가 보낸 이메일 값은 쓰지 않습니다.
- 이메일 도메인이 `ALLOWED_EMAIL_DOMAIN`과 정확히 같고 확인된 경우만 통과합니다. 아니면 403 `DOMAIN_NOT_ALLOWED`입니다.
- 회원 테이블(`players`)에는 이메일을 저장하지 않고 `auth_user_id`(auth.users.id)만 둡니다.
- 처음 로그인하면 `GET /api/me`가 이메일 앞부분과 같은 `username`(대소문자 무시)의 미연결 회원을 찾아 연결합니다. 기존 회원은 그대로 로그인하면 됩니다.
- 대상 회원이 없으면 403 `ACCOUNT_NOT_LINKED`이고, 관리자가 발급한 초대 코드(`POST /api/auth/invite`)로 가입합니다. 초대 가입 회원의 성별은 `M`으로 만들어지므로 필요하면 관리자가 고칩니다.
- 관리자는 `POST /api/admin/invite-codes`로 1회용 초대 코드(7일 만료, 8자)를 발급합니다. 평문 코드는 발급 응답에서만 보이고 DB에는 SHA-256 해시만 저장됩니다.
- 회원을 미리 만들어 두려면 `POST /api/admin/register {username, gender}`를 씁니다. 그 회원이 Google로 로그인하면 자동 연결됩니다.

## 6. 첫 관리자 등록

관리자는 `player_admins`에 등록된 회원입니다. 첫 관리자는 SQL Editor에서 등록하고, 이후 관리자 추가·제거도 같은 방식으로 합니다.

```sql
-- username으로 회원 확인
SELECT id, username, auth_user_id FROM players WHERE lower(username) = lower('<이메일 앞부분>');

-- 관리자 등록 (created_at은 Unix 초)
INSERT INTO player_admins (player_id, created_at)
SELECT id, extract(epoch FROM now())::bigint
FROM players
WHERE username = '<이메일 앞부분>'
ON CONFLICT (player_id) DO NOTHING;

-- 관리자 제거
DELETE FROM player_admins
WHERE player_id = (SELECT id FROM players WHERE username = '<이메일 앞부분>');
```

- 등록할 회원이 아직 없으면 그 사람이 Google로 한 번 로그인해(자동 연결) 회원이 생기거나 연결된 뒤에 등록합니다. 기존 데이터에 회원이 없으면 `players`에 먼저 넣습니다.
- 예전 고정 관리자 회원(`username = 'admin'`)은 더 이상 특별 취급되지 않습니다. 쓰지 않으면 관리자 화면에서 inactive로 바꿉니다.

## 7. 배포

- 자동: main push에서 `supabase/**`, `apps/api/**`, `packages/**`가 바뀌면 `supabase-deploy` workflow가 실행됩니다.
- 수동: Actions → `supabase-deploy` → Run workflow (`gh workflow run supabase-deploy.yml`).

workflow는 다음을 순서대로 실행합니다. 로컬에서 직접 배포할 때도 같습니다(`pnpm exec supabase login` 필요).

```bash
pnpm build:edge
pnpm exec supabase link --project-ref <project-ref>   # SUPABASE_DB_PASSWORD 또는 프롬프트 입력
pnpm exec supabase db push
pnpm exec supabase functions deploy api --project-ref <project-ref> --use-api
```

배포 확인:

```bash
curl -s https://<project-ref>.supabase.co/functions/v1/api/health
curl -si -X OPTIONS https://<project-ref>.supabase.co/functions/v1/api/players \
  -H 'Origin: https://kakaopkpk.github.io' -H 'Access-Control-Request-Method: GET'
# 401이어야 한다
curl -si -X POST https://<project-ref>.supabase.co/functions/v1/api/internal/cron/auto-approvals
```

## 로컬에서 함수 실행

Docker가 필요합니다. 로컬 함수는 별도 설정 없이 로컬 DB(`SUPABASE_DB_URL`)에 연결합니다.

```bash
pnpm db:start
pnpm functions:serve        # pnpm build:edge 후 supabase functions serve api
curl -s http://127.0.0.1:54321/functions/v1/api/health
curl -s http://127.0.0.1:54321/functions/v1/api/players
```

- api 소스를 바꾸면 `pnpm build:edge`로 번들을 다시 만들어야 함수에 반영됩니다.
- dev mock 데이터는 `pnpm dev`(Node api)가 시작할 때 로컬 DB에 넣습니다. 함수는 시딩하지 않습니다.
- 함수 secret은 `supabase/functions/.env`(커밋 금지)에 두거나 `--env-file`로 넘깁니다. `ALLOWED_EMAIL_DOMAIN`(예: `kakaocorp.com`)과 `QR_TOTP_SECRET`은 필수이고, cron 경로를 호출하려면 `CRON_SECRET`도 넣습니다. 아바타 업로드를 확인하려면 `STORAGE_PUBLIC_URL=http://127.0.0.1:54321`도 넣습니다.
- 로컬 로그인은 이메일 매직링크입니다. 방법은 `docs/dev-environment.md`의 "로컬 로그인"을 따릅니다.

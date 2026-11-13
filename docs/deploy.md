# pkpkdupr 배포 (Supabase)

api는 Supabase Edge Function `api`로, DB 스키마는 `supabase/migrations/`로 배포합니다. main에 push되면 `.github/workflows/supabase-deploy.yml`이 자동으로 배포합니다.

```text
브라우저 ── https://<project-ref>.supabase.co/functions/v1/api/... ──> Edge Function `api`
                                                                        │ (apps/api Express app 번들)
                                                                        ▼
                                                  Supabase Postgres (커넥션 풀러, transaction mode)
Edge Function `api` ── service role key ──> Supabase Storage `avatars` 버킷 (업로드·삭제)
브라우저 ── https://<project-ref>.supabase.co/storage/v1/object/public/avatars/... (아바타 읽기)
```

- 클라이언트의 API base URL은 `https://<project-ref>.supabase.co/functions/v1`이고, 경로는 로컬과 같은 `/api/...`입니다(함수 이름 `api`가 경로 첫 segment가 됩니다).
- 함수는 게이트웨이 JWT 검증을 끕니다(`supabase/config.toml`의 `[functions.api] verify_jwt = false`). 인증은 api가 `Authorization: Bearer <Supabase Auth access token>`의 서명을 직접 검증해 합니다(아래 "로그인과 회원 연결").

## 패키징

Edge Runtime(Deno)은 확장자 없는 상대 import와 tsconfig paths를 그대로 해석하지 못하므로, apps/api를 esbuild로 묶어 함수 디렉터리에 둡니다.

```bash
pnpm build:edge   # apps/api/src/edge.ts → supabase/functions/api/dist/api.js
```

- 워크스페이스 소스(`apps/api`, `packages/*`)는 번들에 포함하고, npm 패키지는 설치된 버전 그대로 `npm:<이름>@<버전>` import로 남깁니다. Node 내장 모듈은 `node:` 접두사로 바꿉니다.
- 번들(`supabase/functions/api/dist/`)은 커밋하지 않습니다. 배포 workflow가 배포 직전에 만듭니다.
- 함수 진입점은 `supabase/functions/api/index.ts`이고, 번들의 `apps/api/src/edge.ts`가 Express app으로 요청을 넘깁니다. 요청 pathname에 `/functions/v1` 접두사가 남아 있으면 진입점에서 떼어 냅니다.

## Edge Runtime에서 달라지는 점

- 부팅 작업(dev mock 시딩)은 Edge Runtime에서 실행하지 않습니다. 로컬 Node 개발(`pnpm dev`)에서는 기존처럼 실행합니다.
  - 관리자는 별도 계정이 아니라 `player_admins`에 등록된 회원입니다. 첫 관리자는 대시보드와 SQL로 등록합니다(아래 5).
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
| `STORAGE_PUBLIC_URL` | 아니오 | 아바타 공개 URL의 base. 없으면 `SUPABASE_URL`을 씁니다. 운영에서는 비워 두고, 로컬 `functions serve`에서만 `http://127.0.0.1:54321`로 넣습니다(함수 안의 `SUPABASE_URL`은 브라우저가 접근할 수 없는 `http://kong:8000`이기 때문). |
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON` | 아니오 | 동호회 구글 캘린더에 세션 일정을 쓰는 서비스 계정의 JSON 키 파일 내용 전체(아래 3-1). `GOOGLE_CALENDAR_ID`와 둘 다 있어야 연동이 켜지고, 하나라도 없으면 캘린더를 호출하지 않습니다. |
| `GOOGLE_CALENDAR_ID` | 아니오 | 일정을 쓸 동호회 캘린더 ID(아래 3-1). 예 `abcd…@group.calendar.google.com` |
| `WEB_APP_URL` | 아니오 | 일정 설명에 넣는 웹 앱 주소. 운영값 `https://kakaopkpk.github.io/pkpkdupr/`. 없으면 설명에서 앱 링크 두 줄을 뺍니다. |

`SUPABASE_URL`·`SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`·`SUPABASE_JWKS`는 Supabase가 함수에 자동으로 넣으므로 직접 설정하지 않습니다(예약 이름이라 설정할 수도 없습니다). 토큰 확인에는 `SUPABASE_JWKS`(프로젝트 JWT 서명 공개키, 토큰 서명 검증용)와 `SUPABASE_URL`·`SUPABASE_ANON_KEY`를, 계정 발급·비밀번호 초기화·아이디 변경(Auth admin API)에는 service role key를 씁니다.

```bash
pnpm exec supabase secrets set --project-ref <project-ref> \
  DATABASE_URL='postgresql://postgres.<project-ref>:<DB 비밀번호>@aws-0-<region>.pooler.supabase.com:6543/postgres' \
  CORS_ALLOWED_ORIGINS='https://kakaopkpk.github.io'
pnpm exec supabase secrets list --project-ref <project-ref>
```

secret을 바꾼 뒤에는 함수를 다시 배포하지 않아도 새 요청부터 반영됩니다.

### 3-1. 구글 캘린더 연동 (선택, 최초 1회)

세션 일정과 참석 현황을 동호회 전용 구글 캘린더에 보여 줍니다. 참석 데이터의 원본은 앱(세션 참여자)이고, 서버가 서비스 계정으로 캘린더에 쓰기만 합니다(캘린더에서 고친 내용은 앱으로 오지 않고, 다음 변경 때 덮어써집니다). 세션을 만들거나 참여자가 바뀌거나 세션이 지워질 때 응답 뒤에 반영하며, 실패하면 함수 로그(`[CALENDAR]`)만 남기고 다음 변경 때 최신 상태로 다시 씁니다. 연동 전부터 있던 세션은 다음 변경 때 일정이 생깁니다.

1. [Google Cloud 콘솔](https://console.cloud.google.com/)에서 프로젝트를 만들거나 고르고, API 및 서비스 → 라이브러리에서 **Google Calendar API**를 사용 설정합니다.
2. IAM 및 관리자 → 서비스 계정에서 서비스 계정을 만듭니다(역할 부여 없음). 서비스 계정 → 키 → 키 추가 → 새 키 만들기 → **JSON**으로 키 파일을 받습니다. 이 파일 내용 전체가 `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON`입니다.
3. [구글 캘린더](https://calendar.google.com/)에서 동호회 전용 캘린더를 만들고(설정 → 캘린더 추가 → 새 캘린더), 그 캘린더 설정 → 특정 사용자 또는 그룹과 공유 → 서비스 계정 이메일(`…@<프로젝트>.iam.gserviceaccount.com`)을 **일정 변경** 권한으로 추가합니다.
4. 같은 설정 화면의 캘린더 통합 → **캘린더 ID**를 확인합니다. 이 값이 `GOOGLE_CALENDAR_ID`입니다.
5. secret을 넣습니다.

   ```bash
   pnpm exec supabase secrets set --project-ref <project-ref> \
     GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON="$(cat <서비스 계정 키>.json)" \
     GOOGLE_CALENDAR_ID='<캘린더 ID>' \
     WEB_APP_URL='https://kakaopkpk.github.io/pkpkdupr/'
   ```

6. 회원에게는 캘린더 공유(보기 권한)나 공개 주소로 그 캘린더를 구독하도록 안내합니다. 서비스 계정은 초대를 보내지 않으므로 일정에 참석자는 넣지 않습니다.

로컬 dev에서는 이 값들을 넣지 않으면 연동이 꺼진 채로 동작합니다.

## 4. 로그인 설정 (최초 1회)

로그인은 관리자가 발급한 아이디·비밀번호만 씁니다. 소셜 로그인과 공개 가입은 쓰지 않습니다.

Supabase 대시보드 → Authentication

1. Sign In / Providers
   - **Email**: 켭니다. 비밀번호 로그인에 쓰므로 꺼서는 안 됩니다.
   - **Allow new users to sign up**: 끕니다. 브라우저에서 `signUp`으로 계정을 만들 수 없게 막습니다. 관리자가 api(service role admin API)로 만드는 계정에는 영향이 없습니다.
   - **Confirm email**: 내부 이메일로는 메일을 받을 수 없으므로 계정은 api가 확인 완료 상태로 만듭니다. 이 설정은 그대로 둬도 됩니다.
   - **Google**: 끕니다(다른 provider도 켜지 않습니다).
2. Sign In / Providers → Email → **Secure password change**: 끕니다. 켜면 최근에 로그인하지 않은 사용자의 비밀번호 변경에 재인증이 필요해져, 첫 로그인 때 비밀번호 변경이 막힐 수 있습니다.
3. URL Configuration은 아래 "7. GitHub Pages (web·admin)"의 "Supabase Auth URL"을 따릅니다.

### 로그인과 회원 연결

- 회원은 아이디로 로그인합니다. 클라이언트가 아이디를 내부 이메일 `<아이디 소문자>@<INTERNAL_EMAIL_DOMAIN>`(`packages/shared/src/auth.ts`, 현재 `pkpkdupr.invalid`)로 바꿔 Supabase Auth 비밀번호 로그인을 합니다. 이 주소로 실제 메일은 보내지 않습니다.
- 계정은 관리자가 admin-web에서 발급합니다.
  - **회원 추가**: 아이디와 성별을 넣으면 회원과 Auth 사용자가 함께 만들어지고, 초기 비밀번호가 응답에 한 번만 보입니다.
  - **비밀번호 초기화**: 임시 비밀번호가 응답에 한 번만 보입니다. 이 회원은 다시 첫 로그인 상태가 됩니다.
  - **아이디 변경**: 회원의 `username`과 Auth 사용자의 내부 이메일을 같이 바꿉니다.
- 관리자가 발급·초기화한 계정은 `players.is_first_login = true`입니다. 처음 로그인하면 web이 `/force-change-password`로 보내 비밀번호를 바꾸게 하고, 바꾸면 `POST /api/me/password-changed`가 플래그를 내립니다.
- api는 요청의 access token 서명과 만료(`exp`)를 프로젝트 공개키로 직접 검증하고(Auth 서버 왕복 없음), 토큰의 `sub`(auth.users.id)와 `players.auth_user_id`가 같은 회원과 관리자 여부를 DB 쿼리 1회로 찾습니다. 회원 테이블에는 이메일을 저장하지 않습니다. 브라우저가 보낸 이메일·아이디 값은 쓰지 않습니다.
  - 공개키는 `SUPABASE_JWKS`에서 읽고, 없거나 읽을 수 없으면(로컬 Node api 등) Auth JWKS 엔드포인트(`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`)에서 받습니다. 받은 키는 auth-js가 프로세스 전역 캐시에 약 10분간 보관합니다. 캐시에 없는 `kid`는 곧바로 다시 받으므로 새 키는 바로 쓰이지만, 폐기한 키는 캐시가 만료될 때까지(최대 약 10분) 계속 통과할 수 있습니다. 엔드포인트를 조회하지 못하면 503 `SESSION_UNAVAILABLE`입니다.
  - 대칭 서명(HS256) 토큰과 키 목록에 없는 `kid`의 토큰은 전처럼 Auth 서버 사용자 조회(`GET /auth/v1/user`)로 확인합니다.
  - `iss`·`aud`는 검사하지 않습니다(로컬 함수 런타임의 `SUPABASE_URL`이 토큰 `iss`와 다릅니다).
  - **세션 무효화 지연**: 로그아웃·세션 철회·Auth 사용자 삭제·정지(ban)는 access token이 만료될 때까지 api에 반영되지 않습니다. 만료 시간은 로컬이 `supabase/config.toml`의 `jwt_expiry`(3600초), 운영은 대시보드 설정을 따릅니다. 회원 inactive 처리는 요청마다 DB로 확인하므로 즉시 반영됩니다. 계정을 즉시 차단해야 하면 Auth 정지 대신(또는 함께) 회원 상태를 inactive로 바꿉니다. 삭제된 Auth 사용자는 `players.auth_user_id`가 비워지므로 만료 전까지 401 대신 403 `ACCOUNT_NOT_LINKED`를 받습니다.
- 연결된 회원이 없는 Auth 사용자(예: 대시보드에서 직접 만든 사용자)는 403 `ACCOUNT_NOT_LINKED`이고, 앱이 관리자에게 문의하라고 안내합니다.
- 로그인 provider와 이메일 도메인은 서버가 검사하지 않습니다. 계정을 만들 수 있는 주체를 막는 것(위 설정의 가입 끔, 관리자 발급)이 접근 통제입니다.

## 5. 첫 관리자 등록

관리자는 `player_admins`에 등록된 회원입니다. 첫 관리자는 admin-web에 들어갈 수 없으므로 대시보드와 SQL로 만들고, 그 뒤 다른 회원의 계정은 admin-web에서 발급합니다.

1. 대시보드 Authentication → Users → **Add user** → Create new user
   - Email: `<아이디 소문자>@<INTERNAL_EMAIL_DOMAIN>` (예: `admin@pkpkdupr.invalid`)
   - Password: 임시 비밀번호
   - **Auto Confirm User**를 켭니다. 꺼 두면 확인 메일을 받을 수 없어 로그인할 수 없습니다.
   - 만든 사용자의 UID를 확인합니다.
2. SQL Editor에서 회원과 연결합니다.

   ```sql
   -- 기존 회원이면 연결 (대소문자 무시). is_first_login을 켜 첫 로그인에 비밀번호를 바꾸게 합니다.
   UPDATE players
   SET auth_user_id = '<UID>', is_first_login = true
   WHERE lower(username) = lower('<아이디>')
   RETURNING id, username, auth_user_id;

   -- 위가 0행(회원이 없음)이면 회원 행을 만듭니다.
   -- id는 'P' + 영문 소문자·숫자 7자, gender는 'M' 또는 'F', 타임스탬프는 Unix 초입니다.
   INSERT INTO players (id, username, gender, status, is_first_login, auth_user_id, created_at, updated_at)
   VALUES (
     'P' || substr(md5(random()::text), 1, 7),
     '<아이디>',
     'M',
     'active',
     true,
     '<UID>',
     extract(epoch FROM now())::bigint,
     extract(epoch FROM now())::bigint
   )
   RETURNING id, username, auth_user_id;
   ```
3. `player_admins`에 등록합니다(created_at은 Unix 초).

   ```sql
   INSERT INTO player_admins (player_id, created_at)
   SELECT id, extract(epoch FROM now())::bigint
   FROM players
   WHERE auth_user_id = '<UID>'
   ON CONFLICT (player_id) DO NOTHING;
   ```

4. 그 아이디와 임시 비밀번호로 admin-web에 로그인하고 비밀번호를 바꿉니다.

관리자 추가·제거는 같은 SQL로 합니다.

```sql
-- 관리자 제거
DELETE FROM player_admins
WHERE player_id = (SELECT id FROM players WHERE lower(username) = lower('<아이디>'));
```

- 예전 고정 관리자 회원(`username = 'admin'`)은 더 이상 특별 취급되지 않습니다. 쓰지 않으면 관리자 화면에서 inactive로 바꿉니다.

### Google 로그인 운영 프로젝트 전환 (1회)

Google 로그인으로 운영 중인 프로젝트를 아이디·비밀번호 로그인으로 옮기는 절차입니다. 새 함수를 먼저 배포하고 그다음 대시보드에서 Google을 끕니다. 배포하면 web·admin-web에는 아이디·비밀번호 로그인 화면만 남으므로, 기존 회원은 4단계에서 비밀번호 초기화를 받기 전까지 새로 로그인할 수 없습니다. 회원에게 미리 알리고 1~4단계를 이어서 진행합니다.

1. **배포**: 새 코드와 마이그레이션(`20261111000000_password_login.sql`)을 main에 머지해 `supabase-deploy`·`pages` workflow로 배포합니다(아래 6, 7). 마이그레이션이 `invite_codes`·`player_auth_link_logs` 테이블을 지우므로 미사용 초대 코드는 버려집니다.
2. **대시보드 설정**: 위 4대로 Email 켬, Google 끔, 가입 허용 끔, Secure password change 끔으로 바꿉니다.
3. **첫 관리자 등록**: 위 5대로 만듭니다. 기존 회원이 관리자가 될 때도 5의 SQL로 새 Auth 사용자와 연결합니다(기존 Google Auth 사용자의 연결은 이 `UPDATE`가 덮어씁니다).
4. **기존 회원 계정 발급**: 관리자가 admin-web에서 회원마다 비밀번호 초기화를 하고 임시 비밀번호를 전달합니다.
   - 초기화하면 Google로 만든 계정도 아이디로 로그인하는 계정이 됩니다(Auth 사용자의 이메일이 내부 이메일로 바뀌고 비밀번호가 설정됩니다).
   - 쓰지 않는 Google Auth 사용자는 대시보드에서 지워도 됩니다. `players.auth_user_id`가 `ON DELETE SET NULL`이라 연결만 풀리고 회원 데이터는 그대로입니다.
5. **안 쓰는 값 정리**

   ```bash
   pnpm exec supabase secrets unset ALLOWED_EMAIL_DOMAIN ALLOWED_AUTH_PROVIDERS --project-ref <project-ref>
   gh variable delete VITE_ALLOWED_EMAIL_DOMAIN
   ```

   Google Cloud Console의 OAuth 클라이언트도 지워도 됩니다(선택).

### 원격 확인 포인트

- 관리자가 회원 추가를 했을 때 이메일 형식 오류로 실패하면, 원격 Auth가 `INTERNAL_EMAIL_DOMAIN`(예약 TLD `.invalid`)을 거부하는 것입니다. `packages/shared/src/auth.ts`의 `INTERNAL_EMAIL_DOMAIN`을 허용되는 도메인으로 바꿔야 합니다. 바꾸면 기존 Auth 사용자의 이메일을 모두 옮겨야 하므로 계정을 많이 발급하기 전에 확인합니다.

## 6. 배포

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
# 토큰 없이 인증 경로를 호출하면 401이어야 한다
curl -si https://<project-ref>.supabase.co/functions/v1/api/me
```

### 이전 버전에서 올릴 때 (1회)

경기 합의 단계·자동 합의 cron·QR 기능이 있던 운영 프로젝트에 이 변경을 처음 배포한 뒤 한 번만 하는 정리입니다.

1. 배포 직후 admin-web에서 "평점 재계산"을 1회 실행합니다. 합의 대기 경기를 completed로 바꾸는 마이그레이션은 평점을 계산하지 못하므로, 재계산해야 이 경기가 평점에 반영됩니다.
2. 더 이상 쓰지 않는 함수 secret을 지웁니다.

   ```bash
   pnpm exec supabase secrets unset --project-ref <project-ref> CRON_SECRET QR_TOTP_SECRET
   ```

3. SQL Editor에서 자동 합의 cron이 쓰던 Vault 값 `project_url`·`cron_secret`을 지웁니다. cron 작업 `auto-approvals`는 마이그레이션이 해제합니다.

   ```sql
   DELETE FROM vault.secrets WHERE name IN ('project_url', 'cron_secret');
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
- 함수 secret은 `supabase/functions/.env`(커밋 금지)에 두거나 `--env-file`로 넘깁니다. 로컬에서는 직접 넣어야 하는 필수 secret이 없습니다. `SUPABASE_URL`·`SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`는 로컬 함수 런타임이 넣어 줍니다. 아바타 업로드를 확인하려면 `STORAGE_PUBLIC_URL=http://127.0.0.1:54321`도 넣습니다.
- 로컬 로그인은 아이디·비밀번호입니다. 로컬 `functions serve`는 dev mock을 시딩하지 않으므로 dev 계정이 없습니다. 계정은 `pnpm dev`(Node api)를 한 번 띄워 만들거나 관리자 api로 발급합니다. 자세한 내용은 `docs/dev-environment.md`의 "로컬 로그인"을 따릅니다.

## 7. GitHub Pages (web·admin)

web과 admin-web은 한 GitHub Pages 사이트에 같이 배포합니다. Pages는 저장소당 사이트가 하나라서 admin-web을 `admin/` 아래에 둡니다.

| 앱 | 주소 | 빌드 base (`VITE_BASE_PATH`) |
| --- | --- | --- |
| web | `https://kakaopkpk.github.io/pkpkdupr/` | `/pkpkdupr/` |
| admin-web | `https://kakaopkpk.github.io/pkpkdupr/admin/` | `/pkpkdupr/admin/` |

- `VITE_BASE_PATH`는 두 앱 공통 이름의 빌드 env입니다(Vite 설정이 `process.env`에서 읽으므로 `.env` 파일이 아니라 빌드 명령의 환경으로 넘깁니다). 비우면 `/`라서 로컬 개발은 그대로입니다.
- 라우터 basename, 정적 자산, 아이콘, web PWA manifest(`id`·`start_url`·`scope`·아이콘), 서비스워커의 `navigateFallback`·`importScripts`가 모두 이 base를 따릅니다.
- web 서비스워커 scope(`/pkpkdupr/`) 안에 admin이 있으므로, `navigateFallbackDenylist`에 `/pkpkdupr/admin/`을 넣어 관리자 화면 탐색을 web `index.html`로 가로채지 않습니다.

### Pages 설정 (최초 1회)

1. 저장소 Settings → Pages → Build and deployment → **Source: GitHub Actions**
2. Settings → Secrets and variables → Actions → **Variables**에 빌드 env를 넣습니다. 모두 브라우저 번들에 들어가는 공개 값입니다(service role key 금지).

| variable | 필수 | 값 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 예 | `https://<project-ref>.supabase.co/functions/v1` |
| `VITE_SUPABASE_URL` | 예 | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | 예 | 프로젝트 anon(publishable) key |
| `VITE_FUNCTION_REGION` | 아니오 | Supabase 프로젝트(DB) 리전 코드. 현재 운영값 `ap-southeast-1` |

```bash
gh variable set VITE_API_BASE_URL --body 'https://<project-ref>.supabase.co/functions/v1'
gh variable set VITE_SUPABASE_URL --body 'https://<project-ref>.supabase.co'
gh variable set VITE_SUPABASE_ANON_KEY --body '<anon key>'
gh variable set VITE_FUNCTION_REGION --body 'ap-southeast-1'   # 선택
```

- 필수 variable이 비어 있으면 workflow가 빌드 전에 실패합니다. web 운영 번들은 `VITE_API_BASE_URL`이 없으면 API 주소를 추측하지 않고 시작할 때 오류를 냅니다.
- `VITE_FUNCTION_REGION`은 선택값이라 비어 있어도 빌드는 실패하지 않습니다. 값이 있으면 두 앱이 모든 API 요청 URL에 `forceFunctionRegion=<값>` 쿼리를 붙여 Edge Function을 그 리전에서 실행합니다. 함수를 DB와 같은 리전에서 실행해 DB 왕복 지연을 줄이기 위해서입니다. 비우면 파라미터를 붙이지 않고(함수는 요청자 근처 리전에서 실행), Supabase Auth 호출과 Storage URL에는 붙지 않습니다.

### Supabase Auth URL

Supabase 대시보드 → Authentication → URL Configuration

- Site URL: `https://kakaopkpk.github.io/pkpkdupr/`
- Redirect URLs: 아이디·비밀번호 로그인은 리다이렉트를 쓰지 않으므로 필요하지 않습니다. OAuth·매직링크 리다이렉트용 값이라 비워 둡니다.

### 함수 CORS

api 함수 secret `CORS_ALLOWED_ORIGINS=https://kakaopkpk.github.io`(위 3). origin에는 경로가 없으므로 web·admin 모두 이 값 하나로 허용됩니다.

### 배포

- 자동: main push에서 `apps/web/**`, `apps/admin-web/**`, `packages/shared/**`, `scripts/pages/**`, 의존성 파일, workflow가 바뀌면 `pages` workflow가 실행됩니다.
- 수동: Actions → `pages` → Run workflow (`gh workflow run pages.yml`).

workflow는 `scripts/pages/assemble.sh`로 두 앱을 빌드해 산출물 하나로 합친 뒤 `actions/deploy-pages`로 배포합니다.

```text
<산출물>/
├── index.html, assets/, sw.js, manifest.webmanifest ...   # web (base /pkpkdupr/)
├── admin/index.html, admin/assets/ ...                     # admin-web (base /pkpkdupr/admin/)
└── 404.html                                                # scripts/pages/404.html (base 치환)
```

### 딥링크 새로고침

Pages는 없는 경로(예: `/pkpkdupr/login`, `/pkpkdupr/admin/players`)에 루트 `404.html`을 돌려줍니다.

1. `404.html`이 경로가 `/pkpkdupr/admin/`으로 시작하면 admin, 아니면 web을 고릅니다.
2. 원래 경로(쿼리·해시 포함)를 sessionStorage `pkpkdupr:pages-redirect`에 남기고 그 앱의 base로 이동합니다.
3. 앱의 `main.tsx`가 라우터를 만들기 전에 값을 읽어 `history.replaceState`로 원래 경로를 되돌립니다.

web 서비스워커가 설치된 뒤에는 web 경로 탐색을 서비스워커가 `index.html`로 바로 응답하므로 404를 거치지 않습니다.

### 로컬에서 운영 base로 확인

```bash
PAGES_BASE_PATH=/pkpkdupr/ \
VITE_API_BASE_URL=https://<project-ref>.supabase.co/functions/v1 \
VITE_SUPABASE_URL=https://<project-ref>.supabase.co \
VITE_SUPABASE_ANON_KEY=<anon key> \
  bash scripts/pages/assemble.sh /tmp/pages-site/pkpkdupr
```

`/tmp/pages-site`를 루트로, 없는 경로에는 `/tmp/pages-site/pkpkdupr/404.html`을 404로 돌려주는 정적 서버로 띄워 `http://127.0.0.1:<port>/pkpkdupr/`, `/pkpkdupr/admin/`과 딥링크 새로고침을 확인합니다. 서비스워커는 `localhost`·`127.0.0.1`에서 HTTP로도 등록됩니다.

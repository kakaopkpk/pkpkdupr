# pkpkdupr 개발 환경

로컬 개발은 Supabase CLI가 띄우는 로컬 Supabase 스택(Postgres·Studio·Data API 등)을 사용합니다. Supabase CLI는 루트 devDependency(`supabase` npm 패키지)라서 전역 설치 없이 `pnpm install`만으로 쓸 수 있습니다.

> 로컬 스택 명령(`pnpm dev`, `pnpm db:start`, `pnpm db:reset`, `pnpm db:migrate` 등)은 **Docker가 필요**합니다. Docker Desktop(또는 호환 런타임)을 먼저 실행하세요.

## 실행

```bash
pnpm dev                 # supabase start + 미적용 마이그레이션 적용 후 web/admin/api 실행
pnpm db:start            # 로컬 Supabase 스택만 기동
pnpm db:stop             # 로컬 Supabase 스택 중지
pnpm db:status           # 접속 URL·키 확인 (Studio, API URL, anon key 등)
pnpm db:migrate          # supabase/migrations/ 중 미적용 마이그레이션을 로컬 DB에 적용
pnpm db:reset            # 로컬 DB를 지우고 마이그레이션을 처음부터 다시 적용
pnpm db:migration:new <이름>  # 새 마이그레이션 파일 생성
```

`pnpm dev`는 api에 다음 환경 변수를 주입합니다. api는 시작 시 스키마를 만들지 않고(마이그레이션은 Supabase CLI가 적용) dev mock 데이터만 넣습니다. mock 데이터를 넣으므로 `.env`의 `DATABASE_URL`과 무관하게 항상 로컬 DB를 씁니다.

```text
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
ENABLE_DEV_MOCK_DATA=true
SUPABASE_URL=<supabase status의 API_URL, 보통 http://127.0.0.1:54321>
SUPABASE_ANON_KEY=<supabase status의 ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<supabase status의 SERVICE_ROLE_KEY>
ALLOWED_EMAIL_DOMAIN=kakaocorp.com        # .env에 있으면 그 값
QR_TOTP_SECRET=local-dev-qr-totp-secret   # .env에 있으면 그 값
```

api는 `ALLOWED_EMAIL_DOMAIN`·`QR_TOTP_SECRET`·`SUPABASE_URL`·`SUPABASE_ANON_KEY`가 없으면 시작하지 않습니다. `SUPABASE_SERVICE_ROLE_KEY`는 아바타 업로드가 로컬 Storage(`avatars` 버킷)를 쓰는 데 필요합니다. `pnpm dev:api`로 따로 띄울 때는 같은 값을 직접 넣습니다(`pnpm db:status -o env`로 확인).

`pnpm dev:api`처럼 api를 따로 띄울 때 `DATABASE_URL`이 없으면 위 로컬 주소를 씁니다. `NODE_ENV=production`에서는 `DATABASE_URL`이 필수입니다.

## 로컬 로그인

로컬 Supabase는 Google 없이 이메일 매직링크로 로그인합니다(`supabase/config.toml`의 `[auth.email]`). 메일은 실제로 보내지 않고 Mailpit에 쌓입니다.

1. web(`http://localhost:8080`) 로그인 화면에서 `dev_alice@kakaocorp.com` 같은 dev 계정 이메일로 매직링크를 요청합니다.
2. Mailpit(`http://127.0.0.1:54324`)에서 메일을 열어 링크를 누릅니다.
3. `GET /api/me`가 이메일 앞부분과 같은 dev mock 회원(`dev_alice`, `dev_bob`, …, `test1`, `test2`)과 자동 연결합니다.

- `dev_alice`는 dev mock 시딩 때 관리자(`player_admins`)로 등록됩니다.
- dev mock에 없는 앞부분(예: `newbie@kakaocorp.com`)은 403 `ACCOUNT_NOT_LINKED`이며, 관리자가 발급한 초대 코드로 가입을 확인할 수 있습니다.
- 허용 도메인이 아닌 이메일(예: `dev_alice@example.com`)은 403 `DOMAIN_NOT_ALLOWED`입니다.

## 구조

```text
apps/web :8080 ── /api ──> apps/api :4000
                                 │ 함수 호출
                                 ▼
                     packages/db (@pkpkdupr/db)
                                 │ postgres.js + Drizzle (pg-core)
                                 ▼
               로컬 Supabase Postgres :54322 (DATABASE_URL)
                                 ▲
               Supabase Studio :54323 / Data API :54321
```

- DB 테이블 조회·편집은 Supabase Studio(`http://127.0.0.1:54323`)를 사용합니다.
- 드라이버는 postgres.js라서 Node(api)와 Deno(Supabase Edge Function)에서 같은 `@pkpkdupr/db` 코드를 씁니다. Supabase 풀러(transaction 모드) 호환을 위해 prepared statement를 쓰지 않습니다.

## 스키마와 마이그레이션

- 스키마의 기준은 `supabase/migrations/*.sql`입니다. 스키마를 바꿀 때는 기존 파일을 고치지 말고 `pnpm db:migration:new <이름>`으로 새 파일을 추가합니다.
- `packages/db/src/db/schema.ts`(drizzle `pg-core`)는 쿼리 빌더용 정의입니다. 마이그레이션을 바꾸면 같은 변경을 여기에도 반영합니다.
- 테이블·컬럼명과 저장 형식(타임스탬프는 Unix 초 `BIGINT`, JSON은 `TEXT` `*_json` 컬럼)은 기존 MySQL 스키마와 같아서 운영 데이터의 값은 바꾸지 않고 옮길 수 있습니다. 다만 mysqldump 출력은 백틱 식별자·백슬래시 이스케이프·`is_first_login`의 0/1 정수 표현 때문에 그대로 넣을 수 없으며, 운영 데이터 이관 방법은 아직 정해지지 않았습니다.
- raw SQL은 Postgres 위치 파라미터(`$1`, `$2`, ...)를 씁니다. 동적 목록은 `placeholders(count, start)`로 만듭니다.

## 원격 Supabase 프로젝트

```bash
pnpm supabase:link --project-ref <project-ref>   # 원격 프로젝트 연결(최초 1회)
pnpm db:push                                      # 원격 DB에 미적용 마이그레이션 적용
```

`supabase:link`·`db:push`는 Docker 없이 동작하지만 Supabase 로그인(`pnpm supabase login`)과 DB 비밀번호가 필요합니다.

## RLS(Row Level Security) 확인

모든 테이블에 RLS가 켜져 있고 정책은 하나도 없습니다. 따라서 브라우저에 공개되는 anon key나 로그인 사용자 JWT(`anon`·`authenticated` 역할)로는 Data API를 통해 어떤 행도 읽거나 쓸 수 없습니다. DB 접근은 테이블 소유자(`postgres`)로 접속하는 서버(api / Edge Function)만 합니다.

로컬 스택에서 다음으로 확인합니다.

1. RLS·정책 상태 (Studio SQL Editor 또는 `psql "$DATABASE_URL"`):

   ```sql
   -- 0행이어야 한다(RLS가 꺼진 public 테이블 없음)
   SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
   -- 0이어야 한다(정책 없음)
   SELECT count(*) FROM pg_policies WHERE schemaname = 'public';
   ```

2. Data API로 anon 접근 차단 (anon key는 `pnpm db:status`의 `anon key`/`Publishable key`):

   ```bash
   ANON_KEY=<anon key>
   # 읽기: 행이 있어도 빈 배열 []
   curl -s "http://127.0.0.1:54321/rest/v1/players?select=id" \
     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
   # 쓰기: 401/403과 "new row violates row-level security policy"
   curl -s -X POST "http://127.0.0.1:54321/rest/v1/match_scores" \
     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"id":"x","match_id":"y","score_a":1,"score_b":2}'
   ```

   `authenticated` 역할도 같은 결과여야 합니다(로그인 사용자의 access token을 `Authorization`에 넣어 확인).

3. SQL로 역할 전환 확인:

   ```sql
   SET ROLE anon;
   SELECT count(*) FROM players;  -- 0
   INSERT INTO match_scores (id, match_id, score_a, score_b) VALUES ('x', 'y', 1, 2);  -- RLS 위반 오류
   RESET ROLE;
   ```

# pkpkdupr 프로젝트 가이드

## 개요

- 제품명과 저장소/패키지 식별자는 모두 `pkpkdupr`입니다.
- 피클볼 플레이어, 경기 기록, DUPR 유사 평점과 관리자 운영 도구를 관리하는 pnpm 모노레포입니다.
- 변경은 공유 계약(`packages/shared`)부터 API, `packages/db`, web/admin 소비처까지 한 흐름으로 확인합니다.
- 동호회 배경·운영 원칙·거절한 안은 `docs/product.md`, 화면 디자인 결정은 `docs/design.md`에 있습니다. 새 기능·인프라·UI를 제안하기 전에 확인합니다.

## 아키텍처

```text
apps/web (:8080) ─┐
apps/admin-web (:3100) ─┼─> apps/api (:4000) ─함수 호출─> packages/db (@pkpkdupr/db) ─> Supabase Postgres
                       │
                       └─> packages/shared (player, match domain types)
```

| 영역 | 책임 |
| --- | --- |
| `apps/web` | React 19 사용자 앱. 인증, 홈 / 일정 / 랭킹 / 나 4탭, PWA를 담당합니다. |
| `apps/admin-web` | React 19 관리자 화면. 홈 / 회원 / 경기 / 세션 / 평점 5개 메뉴이고 PC 전용이며, 화면은 목록 + 오른쪽 상세 패널 구조입니다(`apps/admin-web/AGENTS.md`). |
| `apps/api` | Express 공개 API, Supabase Auth access token 확인(`Authorization: Bearer`)과 회원 연결, 관리자 권한 검사, 관리자의 계정 발급·비밀번호 초기화·아이디 변경(Auth admin API)을 담당합니다. 같은 `app`을 로컬 Node(`index.ts`가 listen)와 Supabase Edge Function `api`(`edge.ts` 번들)가 서비스합니다. Node 시작 시에만 `initDatabase()`(dev mock 시딩)·관리자 동기화를 실행하고(스키마는 Supabase CLI가 적용), 저장소 인스턴스는 `apps/api/src/db.ts`에서만 만듭니다. 저장소 예외를 공개 API 상태 코드로 바꾸는 처리도 api가 맡습니다. |
| `packages/db` | `@pkpkdupr/db` 워크스페이스 라이브러리. postgres.js + Drizzle(`pg-core`) 기반 저장소와 dev mock 데이터를 제공합니다. 연결은 env `DATABASE_URL`로 정하며 없으면 기동 시 오류가 납니다. 단, Edge 런타임에서는 `apps/api/src/db.ts`가 `DATABASE_URL`이 없을 때 `SUPABASE_DB_URL`로 대체합니다. Node·Deno 모두에서 동작합니다. HTTP 서버는 없습니다. |
| `supabase/` | Supabase CLI 프로젝트(`config.toml`). 스키마는 `supabase/migrations/*.sql`이 기준이며, 변경은 새 마이그레이션 파일로 추가합니다. `functions/api/`는 Edge Function 진입점이고 번들(`dist/`)은 `pnpm build:edge`로 만들며 커밋하지 않습니다. 번들은 npm 패키지를 `npm:` 외부 import로 남기되, `pnpm patch`로 고친 패키지(`pnpm-workspace.yaml`의 `patchedDependencies`, 지금은 Deno에서 워커가 죽는 쓰기 오류를 고친 postgres)는 설치된 소스를 번들에 넣습니다(`apps/api/scripts/build-edge.mjs`). postgres 버전을 올리면 패치도 다시 만듭니다. |
| `packages/shared` | `player.ts`, `match.ts` 등의 공통 도메인 계약을 제공합니다. |

## 개발 명령

```bash
pnpm install
pnpm dev                         # dev mock data와 전체 워크스페이스 실행
pnpm dev:web                     # Vite web :8080
pnpm dev:api                     # API :4000
pnpm dev:admin                   # admin Vite :3100
pnpm db:start / db:stop          # 로컬 Supabase 스택 (Docker 필요, Studio :54323)
pnpm db:migrate                  # 미적용 마이그레이션을 로컬 DB에 적용
pnpm db:reset                    # 로컬 DB 초기화 후 마이그레이션 재적용
pnpm db:migration:new <이름>     # 새 마이그레이션 파일 생성
pnpm supabase:link / db:push     # 원격 프로젝트 연결 / 원격 DB에 마이그레이션 적용 (운영은 릴리즈 워크플로만 실행)
pnpm build:edge                  # api를 Edge Function 번들로 빌드 (supabase/functions/api/dist/)
pnpm functions:serve             # build:edge 후 로컬 Edge Function api 실행 (Docker 필요)
pnpm db:import-mysql --dump <파일>  # 옛 MySQL 덤프로 DB를 비우고 다시 채움 (기본 dry-run, docs/data-migration.md)
pnpm design:snapshot [화면...]    # 디자인 시안용 화면 스냅샷 (Docker 불필요, --record는 녹화, .claude/skills/design-canvas)

pnpm build
pnpm build:web
pnpm build:api
pnpm build:admin
pnpm lint
```

- 루트 `pnpm dev`는 `supabase start`와 미적용 마이그레이션 적용을 마친 뒤 `ENABLE_DEV_MOCK_DATA=true`와 로컬 `DATABASE_URL`로 실행합니다. 세부 내용과 RLS 확인 방법은 `docs/dev-environment.md`를 따릅니다.
- api 실행 경로는 두 가지뿐입니다. 로컬은 `pnpm dev`(`dev:api`, tsx)로, 운영은 `pnpm build:edge`로 만든 Edge Function 번들을 배포합니다. `apps/api`에는 `start` 스크립트가 없으며, `build`(tsc)는 타입 검사·산출물용이고 Node로 직접 실행하지 않습니다.
- Supabase CLI는 루트 devDependency이므로 전역 설치 없이 `pnpm exec supabase ...`(또는 `pnpm supabase ...`)로 씁니다.
- web Vite proxy는 `/api`를 API로 연결합니다. 아바타는 Supabase Storage 공개 URL에서 직접 받습니다. DB 조회는 Supabase Studio를 씁니다.
- `apps/web/dist/`는 빌드 산출물이므로 커밋하지 않습니다.
- `pnpm dev`는 한 번에 한 워크트리에서만 띄웁니다(이유는 `docs/dev-environment.md`).
- Node 버전은 `.nvmrc`, pnpm 버전은 `package.json`의 `packageManager`가 기준입니다. corepack(`corepack enable`)으로 그 pnpm을 씁니다.

### 마이그레이션

- 새 마이그레이션은 `pnpm db:migration:new <이름>`으로만 만듭니다. 파일명 버전(UTC 시각)을 손으로 짓지 않습니다.
- 원격 DB는 마지막으로 적용한 버전보다 작은 새 파일을 거부하므로, 머지 직전 main의 최신 마이그레이션보다 버전이 작으면 지금 시각으로 파일명을 다시 만듭니다.
- 릴리즈된 마이그레이션 파일은 이름·내용을 바꾸지 않습니다. 고칠 일이 있으면 새 마이그레이션을 추가합니다.
- 브랜치를 바꾼 뒤 로컬 스키마가 맞지 않으면 `pnpm db:reset`으로 다시 적용합니다.

## Web 규칙

- 전역 라우트는 `/`, `/login`, `/force-change-password`(첫 로그인·비밀번호 초기화 직후 비밀번호 변경 강제)입니다. 인증 상태(`AuthContext`의 `status`)에 따라 접근 가능한 라우트가 정해집니다.
- 로그인은 Supabase Auth 아이디·비밀번호(`toInternalEmail(아이디)`로 `signInWithPassword`)이며, API 호출은 `lib/api.ts`의 `apiFetch`로 해서 access token을 붙입니다. 컴포넌트가 `Authorization` 헤더를 직접 만들지 않습니다.
- 로그인 뒤의 홈 / 일정 / 랭킹 / 나 4탭(`TabKey` `home`·`schedule`·`ranking`·`me`, 시작 탭 홈)은 `BottomNav.tsx`의 keep-alive 탭 셸이 소유합니다. 탭 상태와 URL 라우트를 무분별하게 중복하지 않습니다. 회원 탭은 없고 회원 찾기는 랭킹 목록이 맡습니다.
- 하단 바는 유리 알약 4탭과 원형 + 버튼이며, + 메뉴는 경기 기록·세션 만들기만 엽니다(설정·로그아웃은 나 탭의 설정에서).
- 경기 상세·회원 프로필·세션 상세·경기 기록 시트·세션 만들기·설정 같은 전역 화면은 `useAppNavigation()`(`context/AppNavigationContext.tsx`)으로 열고, 진행 중 세션 상태는 `useLiveSession()`(`context/LiveSessionContext.tsx`)으로 읽습니다.
- 데이터를 바꾼 화면은 `notifyDataChanged()`를 부르고, 탭 페이지는 `dataVersion`을 재조회 의존성으로 씁니다.
- 저장 실패(네트워크 오류) 알림은 `useSystemNotice()`(`context/SystemNoticeContext.tsx`)의 `showSaveFailure`로 띄웁니다.
- 공통 UI는 `apps/web/src/components/ui/`, 색·둥글기·글자 크기는 `index.css`의 `pk-*` 토큰을 씁니다. 하드코딩 색을 쓰지 않습니다.
- `apps/web/AGENTS.md`의 모바일·PWA·UI 세부 규칙(디자인 규칙 포함)을 함께 따릅니다. `apps/web/CLAUDE.md`가 그 문서를 불러오므로 web 파일을 다루면 자동으로 읽힙니다.
- 모바일 고정 하단 UI는 `env(safe-area-inset-bottom)`과 `--app-keyboard-offset`을 고려합니다. 스크롤 소유자는 `app-tab-panel-scroll-area`입니다.
- PWA 아이콘은 URL 기반입니다. 아이콘을 변경하면 `apps/web/index.html`의 favicon/Apple touch icon과 `apps/web/vite.config.ts`의 manifest·`includeAssets`를 같이 확인합니다.

## API와 도메인 계약

- 공개·관리자 API 목록과 엔드포인트별 규칙은 `apps/api/AGENTS.md`에 있습니다. API 경로·요청·응답·상태 코드를 바꾸면 그 문서의 해당 엔드포인트 항목을 같은 PR에서 고칩니다.
- 경기 타입·스코어·세션 계약은 `packages/shared/src/match.ts`가 기준입니다.
- api 저장소 어댑터(`apps/api/src/repositories/MatchRepository.ts`, `AuthService`)는 `@pkpkdupr/db` 결과를 공개 계약 형태로 hydrate 합니다.
- `packages/shared` 변경 시 web, admin-web, api, db 전체 소비처를 같은 변경 단위에서 점검합니다.

### 회원

- `Player.duprRating`은 단일 숫자가 아니라 singles/doubles 분류와 metric을 포함하는 상태입니다. `null`인 NR 값도 허용합니다.
- 비활성(inactive) 회원
  - 로그인만 막힙니다. Auth 계정 연결은 유지되어 다시 활성화하면 원래 비밀번호로 로그인합니다.
  - 회원 목록·선수 고르는 목록·랭킹에 나오지 않습니다.
  - 지난 경기 등에서 프로필을 열면 웹은 이름과 "비활성된 회원이에요" 안내만 보입니다.
- 게스트
  - 회원이 세션에서 추가한 비회원이며 `PlayerStatus`가 아니라 `Player.isGuest`로 구분합니다.
  - `status`는 active이고 Auth 계정이 없으며(`authUserId` null) 성별이 없을 수 있습니다. `gender` null은 게스트만이고, 정회원 만들기·수정은 성별 필수입니다.
  - 참여자 추가·삭제·경기 시작·기록·추천 매칭에서는 회원처럼 고를 수 있고, 추천 매칭에서는 NR로 다룹니다.
  - 랭킹에는 나오지 않습니다.

### 평점 미반영 경기(게스트 참가)

- 경기가 completed가 되는 순간(회원 기록, 진행 중 경기 첫 점수, 관리자 일괄 등록) 참가자 중 게스트가 있으면 `matches.rating_excluded`(`Match.ratingExcluded`)를 true로 저장합니다.
- 수정(회원·관리자 모두)
  - 이미 completed인 경기의 true는 참가자가 바뀌어도 유지됩니다(`resolveRatingExcludedAfterEdit`).
  - 수정으로 게스트가 새로 들어오면 true가 됩니다.
  - 진행 중 경기에 첫 점수를 넣는 수정은 그 시점 게스트 여부로 정합니다.
  - 바뀐 completed 경기는 전체 재계산합니다.
- 미반영 경기는 게스트가 끼면 같은 경기 정회원 평점도 바꾸지 않습니다.
- 증분·일괄·전체 재계산 어디서도 평점·평점 이력에 들어가지 않습니다(정회원 승급 뒤에도 유지).
- 업적·세션 지배자·랭킹 경기 수·순위 변동 기준 세션·프로필 요약 통계(승패·파트너 궁합·상대 전적·최근 경기 수)·`lastPlayedAt`·비활동 감쇠 기준 직전 경기에서도 빠집니다.
- 경기 목록·피드·기록 탭·세션 경기 목록·세션 리포트에는 그대로 나옵니다.

### 경기 기록·수정·삭제

- 경기는 기록 즉시 completed가 되어 평점에 반영됩니다.
- 수정
  - 활성 회원이면 참가자·생성자 여부와 상관없이 누구나 경기 시작 후 24시간 이내(`isWithinMatchEditWindow`)에만 수정할 수 있습니다(`isMatchRecordEditable`, 취소 경기는 제외, 웹 버튼 노출 기준).
  - 이후 정정은 관리자가 어드민 경기 화면에서 같은 `PUT /api/matches/:matchId`로 합니다(24시간 제한 없음).
  - 마지막으로 입력·수정한 회원은 `resultSubmittedByPlayerId`에 기록됩니다.
- 회원 삭제
  - 수정 가능 조건에 더해, 이미 시작했고(시작 시각 ≤ 지금) 완료되지 않은 관리자 예정 경기(이미 저장된 `source: "admin_created"` 경기)가 아닐 때만(`isMatchRecordDeletable`) 된다.
  - 실제로 지운 행이 completed였으면 평점을 처음부터 다시 계산한다.
  - 회원·관리자 삭제 모두 경기 전체 스냅샷을 `match_deletion_logs`에 남긴다.
- 평점을 쓰는 경로(증분 반영·일괄 반영·전체 재계산·공식 DUPR 조정)는 `AuthService` 공개 메서드에서 advisory 잠금 하나(`db.ratingWriteLock`)로 직렬화된다. 재계산 입력은 잠금 안에서 읽도록 로더 함수로 넘기고, 잠금 안에서는 잠금을 다시 잡지 않는다.

### 진행 중 경기

- 예외로 세션에서 시작한 경기는 점수 없는 진행 중 경기(`status: "created"`)입니다.
- 회원 누구나 `PUT /api/matches/:matchId`로 첫 점수를 넣는 순간 completed(`completedAt`=입력 시각)가 되고 평점에 증분 반영됩니다.
- 진행 중 경기는 평점·평점 이력·통계·`lastPlayedAt`에서 빠집니다.
- 시작 2시간(`isInProgressMatchExpired`)이 지나도록 점수가 없으면 조회 시점 정리(`cleanupExpired`)에서 빈 세션 정리보다 먼저 삭제됩니다. 이 정리는 관리자 예정 경기를 포함한 점수 없는 created 경기 전부에 적용됩니다.

### 세션 종류·정기 세션·세션 정리

- 세션 종류(`MatchSessionKind`, `match_sessions.kind`)는 정기 `regular`·회원 `custom`·대회 `tournament`다.
  - 회원이 만드는 세션은 항상 회원 세션이고, 종류는 관리자만 고른다(만들기·수정).
  - 정기 세션만 `regular_date_key`를 가져 날짜당 하나다. 대회 세션은 만료·오늘 세션 판정·경기 기록이 회원 세션과 같다.
  - 관리자가 오늘·미래 정기 세션을 다른 종류로 바꾸면 그 날짜가 취소로 남고, 정기로 바꾸면 그날 정기 세션(18:00~22:00)이 된다(이미 있거나 쉬는 날이면 409).
- 정기 세션은 월·목 18:00 KST 세션이며 이름은 요일별 `getRegularSessionName`("월요 정기운동"/"목요 정기운동")이다.
- 회차 만들기
  - 매일 예약 작업이 오늘부터 28일(`REGULAR_SESSION_LOOKAHEAD_DAYS`) 안의 정기 요일(`getRegularSessionDateKeys`, 오늘은 22시 전만)을 미리 만든다.
  - `GET /upcoming` 조회도 다음 회차 1개를 보장한다.
  - 그 밖의 세션 조회는 정기 세션을 만들지 않는다.
- 쉬는 날
  - `regular_session_skips`의 날짜(공휴일 `holiday`, 취소 `canceled`)에는 어떤 경로(예약 작업·upcoming·오늘 정기 세션 열기·경기 기록·시작)로도 정기 세션을 새로 만들지 않는다.
  - 공휴일은 예약 작업이 구글 "대한민국 공휴일" 캘린더에서 설명이 "공휴일"로 시작하는 일정만 골라 저장하고("기념일"은 제외), 이미 만든 그날 정기 세션은 참여자·경기가 모두 없을 때만 지운다.
  - 공휴일을 확인하지 못하면(조회 실패·캘린더 설정 없음) 그날 실행은 아무것도 만들지 않고 5xx다.
  - 관리자가 오늘·미래 정기 세션을 지우면(`DELETE /api/admin/match-sessions/:sessionId`) 그 날짜가 취소로 남는다.
- 경기가 없는 세션은 그날 만료 시각(정기 22:00, 회원·대회 다음 날 0시, 자정을 넘기는 회원·대회 세션은 다음 날 종료 시각)이 지나면 참여자와 함께 정리되므로, 미래 세션은 그날이 지나기 전에는 지워지지 않는다.

## 운영과 배포

- 운영은 Supabase(DB·Auth·Storage·Edge Functions)와 GitHub Pages(web·admin)로 합니다.
- DB는 Supabase Postgres입니다. 모든 테이블은 RLS on·정책 없음(기본 거부)이며, DB 접근은 서버만 합니다. Docker는 로컬 Supabase 스택에만 씁니다.
- GitHub Actions `ci.yml`은 PR과 main push에서 설치·빌드·api/shared/web 테스트를 실행합니다.
- api는 Supabase Edge Function `api`로 배포합니다(base URL `https://<project-ref>.supabase.co/functions/v1`, 경로 `/api/...`).
- 운영 배포는 GitHub Release 발행 때만 합니다.
  - 발행하면 `supabase-deploy.yml`(`supabase db push`와 함수 배포)과 `pages.yml`(web·admin)이 릴리즈 태그 커밋으로 함께 실행됩니다. main 머지만으로는 배포되지 않습니다.
  - web·admin 앱 버전은 릴리즈 태그 이름입니다.
  - 로컬에서 원격 `pnpm db:push`나 함수 배포를 하지 않습니다.
- Supabase 프로젝트 준비, GitHub secrets·variables, 함수 secrets는 `docs/deploy.md`가 기준이며, 새 함수 secret·설정이 생기면 이 문서에 추가합니다.
- api의 CORS 허용 origin은 env `CORS_ALLOWED_ORIGINS`(쉼표 구분)와 localhost 개발 origin(8080, 3100)입니다.
- 세션 일정·참석 현황은 동호회 구글 캘린더에 서버가 단방향으로 씁니다(`apps/api/src/services/SessionCalendarSync.ts`).
  - 세션 생성·참여자 변경·삭제를 api `MatchRepository`의 `onSessionsChanged`로 받아 응답과 분리해 반영합니다(Edge는 `EdgeRuntime.waitUntil`).
  - 반영이 빠진 일정은 매일 예약 작업이 다가오는 세션을 다시 써서 맞춥니다.
  - 일정 id는 세션 id에서 만들어 DB 매핑이 없습니다.
  - env `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON`·`GOOGLE_CALENDAR_ID`가 없거나 `ENABLE_DEV_MOCK_DATA=true`(로컬 `pnpm dev`)면 꺼지며, 준비 절차는 `docs/deploy.md`를 따릅니다.

## 작업 및 커밋 규칙

- 먼저 현재 변경과 기존 dirty tree를 확인하고, 관련 없는 변경은 명시적으로 제외합니다.
- `git add .`, `git commit -a`, reset, rebase, force push를 사용하지 않습니다.
- 커밋 제목은 `feat:`, `fix:`, `refactor:`, `chore:` 중 하나로 시작하며 변경 성격으로 선택합니다.
- 변경 후에는 영향 범위에 맞는 빌드/테스트를 실행합니다. web 변경은 기본적으로 `pnpm build:web`를 우선합니다.
- 문서(`AGENTS.md`·`docs/*.md`)는 규칙·엔드포인트 하나를 항목 한 줄로 씁니다. 조건·예외가 붙어 길어지면 하위 항목으로 쪼갭니다. 여러 사람이 같은 줄을 고쳐 충돌하지 않게 하려는 규칙입니다.

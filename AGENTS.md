# pkpkdupr 프로젝트 가이드

## 개요

- 제품명과 저장소/패키지 식별자는 모두 `pkpkdupr`입니다.
- 피클볼 플레이어, 경기 기록, DUPR 유사 평점과 관리자 운영 도구를 관리하는 pnpm 모노레포입니다.
- 변경은 공유 계약(`packages/shared`)부터 API, `packages/db`, web/admin 소비처까지 한 흐름으로 확인합니다.

## 아키텍처

```text
apps/web (:8080) ─┐
apps/admin-web (:3100) ─┼─> apps/api (:4000) ─함수 호출─> packages/db (@pkpkdupr/db) ─> Supabase Postgres
                       │
                       └─> packages/shared (player, match domain types)
```

| 영역 | 책임 |
| --- | --- |
| `apps/web` | React 19 사용자 앱. 인증, 홈 / 기록 / 랭킹 / 나 4탭, PWA를 담당합니다. |
| `apps/admin-web` | React 18 관리자 로그인과 회원·경기·평점 운영 화면을 담당합니다. |
| `apps/api` | Express 공개 API, Supabase Auth access token 확인(`Authorization: Bearer`)과 회원 연결, 관리자 권한 검사, 관리자의 계정 발급·비밀번호 초기화·아이디 변경(Auth admin API)을 담당합니다. 같은 `app`을 로컬 Node(`index.ts`가 listen)와 Supabase Edge Function `api`(`edge.ts` 번들)가 서비스합니다. Node 시작 시에만 `initDatabase()`(dev mock 시딩)·관리자 동기화를 실행하고(스키마는 Supabase CLI가 적용), 저장소 인스턴스는 `apps/api/src/db.ts`에서만 만듭니다. 저장소 예외를 공개 API 상태 코드로 바꾸는 처리도 api가 맡습니다. |
| `packages/db` | `@pkpkdupr/db` 워크스페이스 라이브러리. postgres.js + Drizzle(`pg-core`) 기반 저장소와 dev mock 데이터를 제공합니다. 연결은 env `DATABASE_URL`로 정하며 없으면 기동 시 오류가 납니다. 단, Edge 런타임에서는 `apps/api/src/db.ts`가 `DATABASE_URL`이 없을 때 `SUPABASE_DB_URL`로 대체합니다. Node·Deno 모두에서 동작합니다. HTTP 서버는 없습니다. |
| `supabase/` | Supabase CLI 프로젝트(`config.toml`). 스키마는 `supabase/migrations/*.sql`이 기준이며, 변경은 새 마이그레이션 파일로 추가합니다. `functions/api/`는 Edge Function 진입점이고 번들(`dist/`)은 `pnpm build:edge`로 만들며 커밋하지 않습니다. |
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
pnpm supabase:link / db:push     # 원격 프로젝트 연결 / 원격 DB에 마이그레이션 적용
pnpm build:edge                  # api를 Edge Function 번들로 빌드 (supabase/functions/api/dist/)
pnpm functions:serve             # build:edge 후 로컬 Edge Function api 실행 (Docker 필요)

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

## Web 규칙

- 전역 라우트는 `/`, `/login`, `/force-change-password`(첫 로그인·비밀번호 초기화 직후 비밀번호 변경 강제)입니다. 인증 상태(`AuthContext`의 `status`)에 따라 접근 가능한 라우트가 정해집니다.
- 로그인은 Supabase Auth 아이디·비밀번호(`toInternalEmail(아이디)`로 `signInWithPassword`)이며, API 호출은 `lib/api.ts`의 `apiFetch`로 해서 access token을 붙입니다. 컴포넌트가 `Authorization` 헤더를 직접 만들지 않습니다.
- 로그인 뒤의 홈 / 기록 / 랭킹 / 나 4탭(`TabKey` `home`·`records`·`ranking`·`me`, 시작 탭 홈)은 `BottomNav.tsx`의 keep-alive 탭 셸이 소유합니다. 탭 상태와 URL 라우트를 무분별하게 중복하지 않습니다. 회원 탭은 없고 회원 찾기는 랭킹 목록이 맡습니다.
- 하단 바는 유리 알약 4탭과 원형 + 버튼이며, + 메뉴는 경기 기록·세션 만들기만 엽니다(설정·로그아웃은 나 탭의 설정에서). 경기 상세·회원 프로필·세션 상세·경기 기록 시트·세션 만들기·설정 같은 전역 화면은 `useAppNavigation()`(`context/AppNavigationContext.tsx`)으로 열고, 진행 중 세션 상태는 `useLiveSession()`(`context/LiveSessionContext.tsx`)으로 읽습니다. 데이터를 바꾼 화면은 `notifyDataChanged()`를 부르고, 탭 페이지는 `dataVersion`을 재조회 의존성으로 씁니다.
- 저장 실패(네트워크 오류) 알림은 `useSystemNotice()`(`context/SystemNoticeContext.tsx`)의 `showSaveFailure`로 띄웁니다.
- 공통 UI는 `apps/web/src/components/ui/`, 색·둥글기·글자 크기는 `index.css`의 `pk-*` 토큰을 씁니다. 하드코딩 색을 쓰지 않습니다.
- `apps/web/AGENTS.md`의 모바일·PWA·UI 세부 규칙을 함께 따릅니다.(디자인 규칙 포함)
- 모바일 고정 하단 UI는 `env(safe-area-inset-bottom)`과 `--app-keyboard-offset`을 고려합니다. 스크롤 소유자는 `app-tab-panel-scroll-area`입니다.
- PWA 아이콘은 URL 기반입니다. 아이콘을 변경하면 `apps/web/index.html`의 favicon/Apple touch icon과 `apps/web/vite.config.ts`의 manifest·`includeAssets`를 같이 확인합니다.

## API와 도메인 계약

주요 공개 API:

- 상태: `GET /api/health`, `GET /api/ping`
- 인증/프로필: `GET /api/me`, `POST /api/me/password-changed`(첫 로그인 비밀번호 변경 완료), `PATCH /api/me/profile`, avatar API. 로그인과 비밀번호 변경은 클라이언트가 Supabase Auth로 직접 합니다.
- 플레이어: `GET /api/players`, 프로필 요약 `GET /api/players/:playerId/profile-summary`(승패·평점 변화·최근 7일 경기 수·파트너 궁합·요청자 기준 분류별 상대 전적과 그 경기들에서 바뀐 요청자 평점 합 `headToHead[분류].ratingDelta`)
- 경기: `GET /api/matches`(`playerId`와 함께 `category=singles|doubles`로 분류 필터), 경기 기록 `POST /api/matches`·수정 `PUT /api/matches/:matchId`·삭제 `DELETE /api/matches/:matchId`(`isMatchRecordDeletable`, 이미 지워졌으면 404, 둘 다 선택적 `expectedUpdatedAt`이 서버 `updatedAt`과 다르면 409), 세션과 상관없는 진행 중 경기 시작 `POST /api/matches/start`(요청 `sessionId`가 오늘 회원 세션이면 그 세션, 아니면 기록과 같은 시간 규칙, 선수가 이미 진행 중 경기에 있으면 409 "<아이디>님이 다른 경기 중이에요", 확인·생성은 advisory 잠금으로 직렬화)·진행 중 경기 전부 `GET /api/matches/in-progress`(`/api/matches/:matchId`보다 먼저 등록), `GET /api/match-feed`, 세션 조회 API
- 세션: 오늘 세션 `GET /api/match-sessions/today`(전날 시작해 자정을 넘긴 회원 세션도 끝나기 전까지 오늘 세션이다, `isSessionOnToday`), 다가오는 세션 `GET /api/match-sessions/upcoming`(만료 전 오늘·미래 세션, 날짜 키 오름차순·같은 날은 정기 세션 먼저, 조회 때 다음 정기 회차를 find-or-create), 오늘 정기 세션 열기 `POST /api/match-sessions/regular/today`(정기 요일 22시 전만), 회원 세션 생성 `POST /api/match-sessions`(`dateKey` 생략 시 오늘·과거 날짜 400, 시작·종료 시각 `startTime`·`endTime`("HH:MM" KST)은 함께 주거나 함께 생략하며 형식 오류·두 시각이 같으면 400, 종료 < 시작이면 다음 날 종료, 오늘 세션의 시작 시각이 지금보다 이르면 400, 세션 날짜는 시작 시각의 날짜이고 세션 시각(`date`)은 시작 시각과 상관없이 그날 00:00 KST라 같은 날 같은 이름은 409). 세션 응답의 `startTime`·`endTime`은 정기 세션이면 18:00~22:00, 시각 없이 만든 회원 세션이면 null, 상세 `GET /api/match-sessions/:sessionId`, 세션 경기 `GET /api/match-sessions/:sessionId/matches`, 점수 없이 진행 중 경기 시작 `POST /api/match-sessions/:sessionId/matches`(`POST /api/matches/start`와 같은 처리, 오늘 세션만, 이미 진행 중인 선수 포함 시 409, 선수 자동 참여), 복식 추천 매칭 `GET /api/match-sessions/:sessionId/recommendations?courts=N&seed=S`(오늘 세션만, courts 기본 3·1~4로 자름, seed 생략 시 서버가 정해 응답에 포함·같은 seed면 같은 결과, 진행 중 경기 선수 제외), 참여자 한 명씩 추가 `POST /api/match-sessions/:sessionId/participants`·삭제 `DELETE /api/match-sessions/:sessionId/participants/:playerId`(활성 회원 누구나·대리 가능, 오늘·미래 세션만·지난 세션 403, 멱등)
- 랭킹·세션 리포트(스냅샷 저장 없이 평점 변경 로그로 조회 시 계산): 랭킹 `GET /api/rankings?category=doubles|singles`(기본 doubles, 순위·완료 경기 수·가장 최근 세션 시작 직전 대비 순위 변동 `rankChange`, NR 회원은 `unrated`, 회원(`player`)에 상태메시지 `statusMessage`·`statusMessageBackgroundColor` 포함), 세션 기록 목록 `GET /api/session-reports?limit=&playerId=`(완료 경기가 있는 세션 최신순, limit 기본 20·최대 100, 홈이 사용), 기록 탭 목록 `GET /api/records?limit=&cursor=&playerId=`(`RecordsResponse` `{ items, nextCursor }`, 완료 경기가 있는 세션 줄 `kind: 'session'`(요청자 줄 `mine`은 세션 리포트 players의 요청자 줄과 같고 안 뛰었으면 null, 업적 제외)과 세션 없는 완료 경기 줄 `kind: 'match'`를 세션 `date`·경기 `matchStartsAt` 내림차순·같으면 id 내림차순으로 섞음, limit 규칙은 세션 기록 목록과 같음, `cursor`는 `nextCursor`를 그대로 넘기며 형식 오류 400·더 없으면 `nextCursor` null, `playerId`는 그 회원이 뛴 세션·경기만, 공개 Match hydrate는 페이지 경기만), 세션 리포트 `GET /api/session-reports/:sessionId`(선수별 경기·승패와 복식 평점·순위 전후, 최대 상승자 `topRiser`). 세션 줄(`MatchSessionHistoryItem`)의 `startTime`은 정기 세션 "18:00", 시각 없는 회원 세션 null
- 업적(저장 없이 완료 경기로 조회 시 계산, 정의·계산은 `packages/shared/src/achievements.ts`): 프로필 요약의 `achievements`(35개 진행 상태), 경기 기록·수정 응답의 `newAchievements`(이 저장으로 참가자 전원이 새로 받은 업적), 세션 리포트의 `achievements`(그 세션 경기로 받은 업적), 업적별 받은 활성 회원 수 `GET /api/achievements/holders`. 무패 세션만은 세션의 모든 경기로 판정해, 4경기 전승으로 받은 뒤 같은 세션에서 지면 받지 않은 상태로 돌아간다. 세션 지배자 업적은 끝난 세션(만료 시각이 지난 세션)의 `topRiser`로 세며(`findSessionDominations`), 그 회원의 세션 마지막 경기로 받고 `newAchievements`에는 나오지 않는다
- 관리자: 선수/감사 로그, 회원 추가(`POST /api/admin/register`)·비밀번호 초기화·아이디 변경, 경기 일괄 등록·메타데이터, 평점 재계산, 공식 DUPR 조정 API

도메인 규칙:

- `Player.duprRating`은 단일 숫자가 아니라 singles/doubles 분류와 metric을 포함하는 상태입니다. `null`인 NR 값도 허용합니다.
- api 저장소 어댑터(`apps/api/src/repositories/MatchRepository.ts`, `AuthService`)는 `@pkpkdupr/db` 결과를 공개 계약 형태로 hydrate 합니다.
- 경기 타입·스코어·세션 계약은 `packages/shared/src/match.ts`가 기준입니다.
- 경기는 기록 즉시 completed가 되어 평점에 반영됩니다. 활성 회원이면 참가자·생성자 여부와 상관없이 누구나 경기 시작 후 24시간 이내(`isWithinMatchEditWindow`)에만 수정할 수 있고(`isMatchRecordEditable`, 취소·과거 다중 점수 경기는 제외, 웹 버튼 노출 기준), 이후 정정은 관리자가 합니다. 마지막으로 입력·수정한 회원은 `resultSubmittedByPlayerId`에 기록됩니다.
- 회원 삭제는 수정 가능 조건에 더해 이미 시작했고(시작 시각 ≤ 지금) 완료되지 않은 관리자 예정 경기가 아닐 때만(`isMatchRecordDeletable`) 된다. 실제로 지운 행이 completed였으면 평점을 처음부터 다시 계산하고, 회원·관리자 삭제 모두 경기 전체 스냅샷을 `match_deletion_logs`에 남긴다.
- 평점을 쓰는 경로(증분 반영·일괄 반영·전체 재계산·공식 DUPR 조정)는 `AuthService` 공개 메서드에서 advisory 잠금 하나(`db.ratingWriteLock`)로 직렬화된다. 재계산 입력은 잠금 안에서 읽도록 로더 함수로 넘기고, 잠금 안에서는 잠금을 다시 잡지 않는다.
- 예외로 세션에서 시작한 경기는 점수 없는 진행 중 경기(`status: "created"`)입니다. 회원 누구나 `PUT /api/matches/:matchId`로 첫 점수를 넣는 순간 completed(`completedAt`=입력 시각)가 되고 평점에 증분 반영됩니다. 진행 중 경기는 평점·평점 이력·통계·`lastPlayedAt`에서 빠지고, 시작 2시간(`isInProgressMatchExpired`)이 지나도록 점수가 없으면 조회 시점 정리(`cleanupExpired`)에서 빈 세션 정리보다 먼저 삭제됩니다. 이 정리는 관리자 예정 경기를 포함한 점수 없는 created 경기 전부에 적용됩니다.
- 정기 세션은 월·목 18:00 KST 세션이며 이름은 요일별 `getRegularSessionName`("월요 정기운동"/"목요 정기운동")이다. 다음 정기 회차(`getNextRegularSessionDateKey`, 오늘이 정기 요일이고 22시 전이면 오늘)는 `GET /upcoming` 조회 때만 미리 만들어지고, 그 밖의 세션 조회는 정기 세션을 만들지 않는다. 경기가 없는 세션은 그날 만료 시각(정기 22:00, 회원 다음 날 0시, 자정을 넘기는 회원 세션은 다음 날 종료 시각)이 지나면 참여자와 함께 정리되므로, 미래 세션은 그날이 지나기 전에는 지워지지 않는다.
- `packages/shared` 변경 시 web, admin-web, api, db 전체 소비처를 같은 변경 단위에서 점검합니다.

## 운영과 배포

- 운영·배포는 Supabase(DB·Auth·Storage·Edge Functions) + GitHub Pages로 이전 중입니다. 범위와 순서는 이슈 #1~#10을 따릅니다.
- DB는 Supabase Postgres입니다. 모든 테이블은 RLS on·정책 없음(기본 거부)이며, DB 접근은 서버만 합니다. Docker는 로컬 Supabase 스택에만 씁니다.
- GitHub Actions `ci.yml`은 PR과 main push에서 설치·빌드·api/shared/web 테스트를 실행합니다.
- api는 Supabase Edge Function `api`로 배포합니다(base URL `https://<project-ref>.supabase.co/functions/v1`, 경로 `/api/...`). main push에서 `supabase-deploy.yml`이 `supabase db push`와 함수 배포를 실행합니다. Supabase 프로젝트 준비, GitHub secrets·variables, 함수 secrets는 `docs/deploy.md`가 기준이며, 새 함수 secret·설정이 생기면 이 문서에 추가합니다.
- api의 CORS 허용 origin은 env `CORS_ALLOWED_ORIGINS`(쉼표 구분)와 localhost 개발 origin(8080, 3100)입니다.

## 작업 및 커밋 규칙

- 먼저 현재 변경과 기존 dirty tree를 확인하고, 관련 없는 변경은 명시적으로 제외합니다.
- `git add .`, `git commit -a`, reset, rebase, force push를 사용하지 않습니다.
- 커밋 제목은 `feat:`, `fix:`, `refactor:`, `chore:` 중 하나로 시작하며 변경 성격으로 선택합니다.
- 변경 후에는 영향 범위에 맞는 빌드/테스트를 실행합니다. web 변경은 기본적으로 `pnpm build:web`를 우선합니다.

# pkpkdupr 프로젝트 가이드

## 개요

- 제품명과 저장소/패키지 식별자는 모두 `pkpkdupr`입니다.
- 피클볼 플레이어, 경기 기록, DUPR 유사 평점과 관리자 운영 도구를 관리하는 pnpm 모노레포입니다.
- 변경은 공유 계약(`packages/shared`)부터 API, DB 서버, web/admin 소비처까지 한 흐름으로 확인합니다.

## 아키텍처

```text
apps/web (:8080) ─┐
apps/admin-web (:3100) ─┼─> apps/api (:4000) ─함수 호출─> packages/db (@pkpkdupr/db) ─> MySQL
                       │
                       └─> packages/shared (player, match, qr domain types)
```

| 영역 | 책임 |
| --- | --- |
| `apps/web` | React 19 사용자 앱. 인증, Match / Members / Me 탭, QR, PWA를 담당합니다. |
| `apps/admin-web` | React 18 관리자 로그인과 회원·경기·평점 운영 화면을 담당합니다. |
| `apps/api` | Express 공개 API, JWT 인증, 관리자 권한 검사를 담당합니다. 시작 시 `initDatabase()`로 스키마 초기화와 dev mock 시딩을 한 번 실행하고, 저장소 인스턴스는 `apps/api/src/db.ts`에서만 만듭니다. 저장소 예외를 공개 API 상태 코드로 바꾸는 처리도 api가 맡습니다. |
| `packages/db` | `@pkpkdupr/db` 워크스페이스 라이브러리. mysql2 + Drizzle 기반 MySQL 저장소, 스키마·마이그레이션, dev mock 데이터를 제공합니다. HTTP 서버는 없습니다. |
| `packages/shared` | `player.ts`, `match.ts`, `qr.ts`의 공통 도메인 계약을 제공합니다. |

## 개발 명령

```bash
pnpm install
pnpm dev                         # dev mock data와 전체 워크스페이스 실행
pnpm dev:web                     # Vite web :8080
pnpm dev:api                     # API :4000
pnpm dev:admin                   # admin Vite :3100
pnpm db:migrate                  # @pkpkdupr/db 기준 MySQL 스키마 마이그레이션

pnpm build
pnpm build:web
pnpm build:api
pnpm build:admin
pnpm lint

pnpm dev:db                     # MySQL :3306 (docker-compose.dev.yml)
pnpm dev:db-browser             # Adminer :3301 (docker-compose.dev.yml)
```

- 루트 `pnpm dev`는 Docker MySQL을 준비한 뒤 `ENABLE_DEV_MOCK_DATA=true`와 `DB_HOST=127.0.0.1`을 사용합니다.
- web Vite proxy는 `/api`, `/uploads`, `/db`를 각각 API 또는 Adminer 개발 도구로 연결합니다.
- `apps/web/dist/`는 빌드 산출물이므로 커밋하지 않습니다.

## Web 규칙

- 전역 라우트는 `/`, `/login`, `/force-change-password`, 개발 전용 `/dev/qrs`입니다.
- 로그인 뒤의 Match / Members / Me는 `BottomNav.tsx`의 keep-alive 탭 셸이 소유합니다. 탭 상태와 URL 라우트를 무분별하게 중복하지 않습니다.
- `apps/web/AGENTS.md`의 모바일·PWA·UI 세부 규칙을 함께 따릅니다.
- 모바일 고정 하단 UI는 `env(safe-area-inset-bottom)`과 `--app-keyboard-offset`을 고려합니다. 스크롤 소유자는 `app-tab-panel-scroll-area`입니다.
- PWA 아이콘은 URL 기반입니다. 아이콘을 변경하면 `apps/web/index.html`의 favicon/Apple touch icon과 `apps/web/vite.config.ts`의 manifest·`includeAssets`를 같이 확인합니다.

## API와 도메인 계약

주요 공개 API:

- 상태: `GET /api/health`, `GET /api/ping`
- 인증/프로필: `POST /api/register`, `POST /api/login`, `GET /api/me`, `POST /api/change-password`, `PATCH /api/me/profile`, avatar API
- 플레이어/QR: `GET /api/players`, `GET /api/player-qr-token`, `POST /api/player-qr-token/verify`
- 경기: `GET|POST /api/matches`, 경기 결과·승인 API, `GET /api/match-feed`, 세션 조회 API
- 관리자: 선수/감사 로그, 경기 일괄 등록·메타데이터, 비밀번호 초기화, 평점 재계산, 공식 DUPR 조정 API

도메인 규칙:

- `Player.duprRating`은 단일 숫자가 아니라 singles/doubles 분류와 metric을 포함하는 상태입니다. `null`인 NR 값도 허용합니다.
- api 저장소 어댑터(`apps/api/src/repositories/MatchRepository.ts`, `AuthService`)는 `@pkpkdupr/db` 결과를 공개 계약 형태로 hydrate 합니다.
- 경기 타입·스코어·세션 계약은 `packages/shared/src/match.ts`가 기준입니다.
- `packages/shared` 변경 시 web, admin-web, api, db 전체 소비처를 같은 변경 단위에서 점검합니다.

## 운영과 배포

- 운영·배포는 Supabase(DB·Auth·Storage·Edge Functions) + GitHub Pages로 이전 중입니다. 범위와 순서는 이슈 #1~#10을 따릅니다.
- 이전 전까지 Docker는 로컬 개발용 MySQL·Adminer(`docker-compose.dev.yml`)에만 씁니다.
- GitHub Actions `ci.yml`은 PR과 main push에서 설치·빌드·api/shared 테스트를 실행합니다.
- api의 CORS 허용 origin은 env `CORS_ALLOWED_ORIGINS`(쉼표 구분)와 localhost 개발 origin(8080, 3100)입니다.

## 작업 및 커밋 규칙

- 먼저 현재 변경과 기존 dirty tree를 확인하고, 관련 없는 변경은 명시적으로 제외합니다.
- `git add .`, `git commit -a`, reset, rebase, force push를 사용하지 않습니다.
- 커밋 제목은 `feat:`, `fix:`, `refactor:`, `chore:` 중 하나로 시작하며 변경 성격으로 선택합니다.
- 변경 후에는 영향 범위에 맞는 빌드/테스트를 실행합니다. web 변경은 기본적으로 `pnpm build:web`를 우선합니다.

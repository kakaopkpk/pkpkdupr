# Frontend (apps/web) 개발 규칙

## 현재 역할

- 일반 사용자용 웹 앱입니다.
- 엔트리 라우트는 `/`, `/login`, `/force-change-password`(첫 로그인·비밀번호 초기화 직후)입니다. `AuthContext`의 `status`(`signedOut`·`mustChangePassword`·`authenticated`)가 열 수 있는 라우트를 정합니다.
- `/`에서는 `BottomNav`가 내부 state로 `Match`, `Player`, `Me` 화면을 전환합니다.
- 상단 + 메뉴는 `설정`과 `경기 기록` 시트를 엽니다.

## 기술 스택

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 5
- **Routing**: react-router-dom v6
- **UI**: HeroUI 3, react-icons
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Alias**: `@/` → `src/`

## 구조 가이드

- `src/components/`
  - 재사용 UI와 레이아웃 컴포넌트
  - 예: `BottomNav.tsx`
- `src/context/`
  - 인증/세션 상태
  - `AuthContext.tsx`가 Supabase 세션 구독, `/api/me` 검증, `status`·`player`, 비밀번호 변경, `logout` 담당
- `src/pages/`
  - 화면 단위 컴포넌트
  - 현재 `Login`, `Match`, `Player`, `Me`, `Home`
- 타입은 반드시 `@pkpkdupr/shared/*`에서 import합니다.

## 현재 UX / 상태 관리 규칙

- 앱 폭은 모바일 프레임 기준 `max-w-[430px]`를 유지합니다.
- 로그인은 관리자가 발급한 아이디·비밀번호로 합니다. `lib/supabase.ts`의 `signInWithUsername`이 `toInternalEmail(아이디)`로 `supabase.auth.signInWithPassword`를 호출합니다. 내부 이메일은 화면에 보이지 않습니다.
- 세션 저장·토큰 갱신은 supabase-js가 맡습니다. 세션이 바뀌면 `/api/me`로 회원을 확인하고, `isFirstLogin`이 true면 `/force-change-password`만 엽니다.
- 비밀번호 변경은 `supabase.auth.updateUser({ password })`로 하며 현재 비밀번호는 묻지 않습니다. 강제 변경은 이어서 `POST /api/me/password-changed`까지 성공해야 끝납니다.
- `/api/me`가 403 `ACCOUNT_NOT_LINKED`면 로그아웃하고 로그인 화면에 안내합니다. 401·`SESSION_INVALID`만 로그아웃하고, 일시 오류(`SESSION_UNAVAILABLE`, 네트워크)는 세션을 유지한 채 재시도합니다.
- `Match`, `Player`, `Me`는 아직 플레이스홀더 성격이 강하므로, 기능 추가 시 탭 상태와 실제 라우트 분리가 필요한지 먼저 판단합니다.

## 라우팅 규칙

- 전역 URL 라우트가 필요한 화면만 `App.tsx`의 `<Routes>`에 추가합니다.
- 탭 내부 화면처럼 URL이 꼭 필요하지 않은 경우에는 `BottomNav` 내부 상태 전환을 유지해도 됩니다.
- 새 URL path는 영문 소문자 + 케밥 케이스를 기본으로 사용합니다.

## API 연동 규칙

- Vite dev server는 `/api`를 `http://localhost:4000`으로 프록시합니다.
- 프런트 코드에서는 절대 호스트를 하드코딩하지 말고 `/api/...`만 사용합니다.
- API 호출은 `lib/api.ts`의 `apiFetch`로 해서 Supabase access token을 붙입니다. 사용자 정보는 `/api/me`를 사용합니다.
- 공유 타입과 실제 API 응답 간 불일치가 생기면 `packages/shared`와 `apps/api`를 먼저 같이 수정합니다.

## 코드 컨벤션

1. **파일명**
   - 컴포넌트: PascalCase
   - 유틸/헬퍼: camelCase
2. **import 순서**
   - React
   - third-party
   - shared package
   - local (`@/...`, `./...`)
3. **스타일**
   - 세미콜론 유지
   - 기존 파일의 4-space 스타일을 우선 존중
4. **컴포넌트**
   - Functional component 사용
   - 복잡한 props는 명시적 interface/type로 분리

## 스타일링 규칙

- CSS 파일 상단에는 `@import "tailwindcss";`를 사용합니다.
- Tailwind v4 기준이라 별도 `tailwind.config.*` 없이 Vite 플러그인으로 동작합니다.
- 모바일 중심 화면이므로 고정 폭/하단 탭/오버레이가 깨지지 않게 확인합니다.
- HeroUI를 사용할 때도 기존 Tailwind 클래스 기반 레이아웃 규칙과 충돌하지 않게 유지합니다.

# Frontend (apps/web) 개발 규칙

## 현재 역할

- 일반 사용자용 웹 앱입니다.
- 엔트리 라우트는 `/`, `/login`, `/force-change-password`(첫 로그인·비밀번호 초기화 직후)입니다. `AuthContext`의 `status`(`signedOut`·`mustChangePassword`·`authenticated`)가 열 수 있는 라우트를 정합니다.
- `/`에서는 `BottomNav`가 내부 state로 홈(`Home`)·일정(`Schedule`)·랭킹(`Ranking`)·나(`Me`) 4탭을 전환합니다. 시작 탭은 홈이고, 한 번 연 탭은 숨겨도 마운트를 유지합니다(keep-alive).
- 하단 바는 떠 있는 유리 알약 4탭과 66px 원형 + 버튼입니다. + 메뉴(`새로 만들기`)는 `경기 기록`과 `세션 만들기`만 엽니다. 설정(로그아웃 포함)은 나 탭에서 `openSettings()`로 엽니다.
- 내가 든 진행 중 경기가 있으면(세션 밖 경기 포함) 홈 외 탭에서 하단 바 위에 미니바(본문을 누르면 경기 상세, 버튼은 `점수 입력`)가, 홈 탭에서 진행 중 세션에 참여하지 않았으면 같은 자리에 참여 알림 바가 뜹니다. `BottomNav`가 이 표시에 맞춰 `--app-bottom-dock-height`를 갱신하므로 하단 고정 UI와 여백은 이 변수를 기준으로 잡습니다. 하단 토스트(`SystemToast`)가 떠 있는 동안은 그 높이를 `--app-bottom-toast-height`로 알리며, 탭 패널 하단 여백이 이 값을 더합니다. 미니바·알림 바·토스트는 아래에서 올라오며 등장하고 가라앉으며 퇴장하는데, 퇴장이 끝날 때까지 마지막 내용을 남기는 처리는 `hooks/usePresence.ts`가 맡습니다. 두 변수는 퇴장을 기다리지 않고 표시 조건이 바뀌는 즉시 갱신하며, 토스트는 `bottom`을 바 없는 기본 높이에 두고 바 높이 차이를 transform으로 옮깁니다.

## 기술 스택

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 5
- **Routing**: react-router-dom v6
- **UI**: HeroUI 3, react-icons
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Alias**: `@/` → `src/`

## 구조 가이드

- `src/pages/`
  - 탭 페이지: `Home.tsx`(홈. 진행 중 세션이 있으면 맨 위에 일정 탭 `LiveSessionCard`에서 버튼만 뺀 블루 카드(오른쪽 끝 LIVE, "N명 참여"를 누르면 경기 중인 선수를 잠근 참여자 시트)를 둔다. 진행 중 세션이 없으면 다가오는 세션마다 블루 카드를 두고 가로로 넘기는 `home/NextSessionCarousel`(다음 카드가 오른쪽에 살짝 보이고 카드 단위로 멈춤, 넘기기는 `touch-pan-y` 트랙에서 직접 처리해 한 번에 한 장만·카드 폭 30% 이상 끌거나 60px 이상 빠르게 튕겨야 넘어감(`carouselPosition`의 `getSwipeTargetIndex`), 아래 위치 점은 10개까지·넘으면 "n / N", 어느 카드에서든 참여하기·참여 취소). 진행 중 경기는 경기마다 가로 vs 카드로, `home/LiveMatchCard`의 내 경기 `MyLiveMatchCard`는 테두리·"내 경기" 칩·점수 입력 버튼과 경기 상세 같은 랠리 팀 줄(`RallyTeamRow`)이 있고 남의 경기 `LiveMatchCard`는 없다)·`Schedule.tsx`(일정: 탭 머리 없이 월 달력 `schedule/MonthCalendar`(이전 달·"2026년 11월"(누르면 이번 달·오늘)·다음 달, 오늘은 `pk-hl` 바탕·고른 날은 블루 원, 세션 날은 블루 점+참여 인원·기록만 있는 날은 회색 점, 내 것이면 속 찬 점)과 고른 날 카드. `GET /api/schedule` 한 달 응답으로 `lib/schedule.ts`의 `buildScheduleDayMarks`·`getScheduleDayEntries`가 표시·카드를 정한다. 카드는 세션 먼저(진행 중 세션 `LiveSessionCard`(버튼은 진행 화면 보기 → 홈 탭뿐, 참여·참여 취소는 진행 화면에서), 끝나지 않은 세션 `UpcomingSessionCard`(참여하기·참여 취소), 끝난 세션 `RecordSessionCard`(`openSessionReport`)), 그 뒤 세션 없는 경기 `RecordMatchCard`(경기 상세), 아무것도 없으면 `EmptyDayCard`(세션 만들기 달력 범위(오늘부터 3주) 안이면 그 날짜로 `openCreateSession`, 지난 날·범위 밖은 문구만))·`Ranking.tsx`(랭킹)·`Me.tsx`(나). props 없이 컨텍스트로 데이터를 받습니다.
  - 그 밖의 전역 라우트: `Login.tsx`, `ForceChangePassword.tsx`
- `src/components/`
  - `BottomNav.tsx`: 4탭 keep-alive 셸, 하단 바(`BottomDock.tsx`)와 + 메뉴, 전역 화면 래퍼 렌더, 진행 중 경기 미니바·참여 알림 바
  - 전역 화면 래퍼: `match/`(경기 상세, 진행 중 경기 랠리 팀 줄 `RallyTeamRow`(`LiveMatchRally.tsx`, 아바타 쌍·네트 칸·랠리를 그리고 이름은 호출부가 그림, 홈 내 경기 카드도 씀, 예정 경기면 vs 글자만, 화면이 안 보이면 멈춤, 공·패들·충격선은 `index.css`의 `pk-rally-*`, 움직임 줄이기면 공이 네트 위에 멈춤)), `profile/`(회원 프로필·경기 목록, 나 탭과 같이 쓰는 머리 `ProfileHeader`. 사진을 불러온 아바타를 누르면 그 자리에서 가운데 240px 원으로 커지는 확대 보기 `AvatarZoomViewer`(누르기·아래로 끌기·Escape·뒤로가기로 닫힘)), `records/`(세션 상세 `SessionReportDrawer`와 그 위 평점 변화 전체 `SessionRatingChangesScreen`), `record/`(경기 기록 시트, 완료 단계에서 내 새 업적을 화면 전체 축하 연출 `AchievementCelebration`으로 띄우고 닫으면 확인 처리), `session/`(세션 만들기(날짜 칩·시작·종료 시각 칩 `SessionSchedulePicker`)·참여자 편집), `settings/`(설정·비밀번호 변경·프로필 사진 조정 `AvatarCropScreen`(고른 사진을 끌어 옮기고 핀치로 1~4배, 두 번 탭 2배↔1배, 원 안을 512px JPEG로 잘라 저장. 좌표 계산은 `utils/avatarCrop.ts`)·상태메시지 편집)
  - 탭 전용 조각: `home/`, `schedule/`, `records/`(세션 리포트 조각 `SessionReportParts`는 일정 탭·세션 상세·홈이 같이 씀, 끝난 세션·세션 없는 경기 카드 `RecordCards`), `ranking/`. 세션 블루 카드 틀·참여 버튼 `session/SessionBlueCard`(오른쪽 위 피클볼 장식 `session/PickleballIllustration`, 첫 줄은 종류 칩 "정기"/"회원"과 남은 날 `getSessionDDayLabel`("D-1"·오늘이면 "D-Day"), 참여 중이면 "✓ 참여 중 … 취소" 버튼 하나)는 홈 다음 세션·진행 중 세션 카드와 일정 탭 세션 카드가 같이 씀
  - `ui/`: 새 디자인 공통 컴포넌트. 새 화면은 여기 것을 먼저 씁니다.
    - `Button.tsx`(`PkButton`, variant `primary`·`soft`·`outline`·`ghost`), `Card.tsx`, `SegmentedControl.tsx`, `Headers.tsx`(`TabHeader`·`DetailHeader`), `Form.tsx`(`TextField`), `Section.tsx`(`ListRow`·`SectionLabel`·`TextLink`), `SheetTitle.tsx`, `ConfirmDialog.tsx`(시트 위 가운데 확인 창. 바텀시트를 겹쳐 쌓지 않을 때 쓰고, 연 쪽이 `useLayerDepth` kind `dialog`로 뒤로가기에 묶는다)
    - `MatchRow.tsx`(`MatchRow`), `PlayerAvatar.tsx`(`PlayerAvatar`·`TeamAvatars`), `Delta.tsx`(`RatingDelta`·`RankChange`), `RankBadge.tsx`, `Badges.tsx`(`LivePill`·`HighlightBadge`), `StatusMessageChip.tsx`, `StateMessage.tsx`(빈 상태 `empty`·불러오기 실패 `error`(항상 "다시 시도") 문구, size `panel` 탭·화면 전체·`inline` 카드·목록·시트 안), `CountUpText.tsx`(카운트업 숫자의 자리 폭을 최종 내용으로 고정), `SheenOverlay.tsx`(한 번 지나가는 흰 빛, 부모 `relative`·`overflow-hidden` 필요), `Icons.tsx`, `cx.ts`
  - `profile/UnseenAchievementCelebration.tsx`: `BottomNav`가 렌더. 전역 화면·바텀시트·+ 메뉴가 하나도 열려 있지 않을 때 앱 진입·`dataVersion` 변경·앱 복귀(visibilitychange)·열린 화면이 모두 닫힐 때 `GET /api/me/achievements/unseen`을 조회해, 아직 보지 않은 내 업적(남이 입력한 경기·세션 지배자·관리자 정정 포함)을 `AchievementCelebration`으로 한 장씩 띄우고 닫으면 `POST /api/me/achievements/seen`. 미확인 조회(`fetchUnseenAchievements`)는 진행 중인 확인 처리 요청이 끝난 뒤 보내 방금 본 업적이 다시 뜨지 않는다
  - 공용 레이어·상태: `BottomSheet.tsx`, `PushScreen.tsx`, `SkeletonBlock.tsx`, `TabPanelStatus.tsx`, `HoldToConfirmButton.tsx`, `SystemToast.tsx`, `OfflineBanner.tsx`, `PwaInstallPrompt.tsx`, `PwaUpdatePrompt.tsx`
- `src/context/`
  - `AuthContext.tsx`: Supabase 세션 구독, `/api/me` 검증, `status`·`player`, 비밀번호 변경, `logout`
  - `TabNavigationContext.tsx`: 탭(`TabKey`: `home`·`schedule`·`ranking`·`me`)·깊이 스택(`pushDepth`/`closeDepth`, 브라우저 뒤로가기 연동)·스크롤 복원·당겨서 새로고침 등록
  - `AppNavigationContext.tsx`: `useAppNavigation()`으로 전역 화면 열기(`openMatchDetail`, `openMemberProfile`(내 id면 나 탭), `openRecordMatch`, `openCreateSession`(`dateKey`로 날짜를 골라 둔 채 열고, 만든 뒤 `onCreated`를 부름. + 메뉴는 홈 탭으로, 일정 탭은 만든 날로 옮김), `openSettings`, `openSessionReport`(지금 탭 위에 세션 상세 화면), `openAchievementDetail`(업적 상세 시트, 경기 기록 시트보다 위 레이어)), `notifyDataChanged`·`dataVersion`, 전역 화면 레이어 번호 `GLOBAL_LAYER`
  - `LiveSessionContext.tsx`: `useLiveSession()`으로 오늘 진행 중 세션·그 경기, 세션과 상관없는 진행 중 경기(`GET /api/matches/in-progress`)와 그중 내 경기
  - `SystemNoticeContext.tsx`: `useSystemNotice().showSaveFailure({ onRetry })`로 저장 실패 토스트(네트워크 오류에만, 서버 4xx·5xx는 화면 인라인), `showToast({ message, actionLabel?, onAction?, durationMs? })`로 하단 바 위 알약 토스트(기본 5초, 동작 글자 하나)
  - `AppUpdateContext.tsx`: `useAppUpdate()`로 PWA 업데이트 확인·적용 상태
  - `ScreenVisibilityContext.tsx`: `useIsScreenVisible()`로 안쪽 화면이 지금 보이는지. 탭 패널(선택됨 && 탭 셸이 PushScreen에 덮이지 않음)과 PushScreen 본문(열림 && 활성 && 덮이지 않음)이 제공하고, 제공자 밖(바텀시트 등)은 언제나 보임
- `src/hooks/`: `useSheetDrag.ts`(바텀시트 끌어 닫기·`prefersReducedMotion`), `useCountUp.ts`(화면이 보일 때마다 숫자 카운트업), `usePlayOnShow.ts`(화면이 보일 때마다 CSS 애니메이션 한 번 재생), `useLayerDepth.ts`, `usePullToRefresh.ts`, `usePlayers.ts`, `useOnlineStatus.ts`, `useStartedMatchToast.ts`, `useMinuteClock.ts`(1분마다 다시 그리는 현재 시각)
- `src/types/match.ts`: API JSON 응답 기준 경기 타입(`MatchInfo`, `MatchListResponse`)과 `getTeamResultScores`
- `src/lib/`: API 호출(`api.ts`)·Supabase 클라이언트·도메인별 요청 함수·포맷터·오류 판정과 화면 문구(`errors.ts`의 `isNetworkError`·`getUserErrorMessage`, 불러오기 실패는 `err.message` 대신 이 문구), `src/utils/`: 평점(`dupr.ts`)·아바타 유틸
- 도메인 타입은 `@pkpkdupr/shared/*`에서 import합니다. 웹 전용 응답 형태만 `src/types/`에 둡니다.

## 현재 UX / 상태 관리 규칙

- 앱 폭은 모바일 프레임 기준 `max-w-[430px]`를 유지합니다.
- 로그인은 관리자가 발급한 아이디·비밀번호로 합니다. `lib/supabase.ts`의 `signInWithUsername`이 `toInternalEmail(아이디)`로 `supabase.auth.signInWithPassword`를 호출합니다. 내부 이메일은 화면에 보이지 않습니다.
- 세션 저장·토큰 갱신은 supabase-js가 맡습니다. 세션이 바뀌면 `/api/me`로 회원을 확인하고, `isFirstLogin`이 true면 `/force-change-password`만 엽니다.
- 비밀번호 변경은 `supabase.auth.updateUser({ password })`로 하며 현재 비밀번호는 묻지 않습니다. 강제 변경은 이어서 `POST /api/me/password-changed`까지 성공해야 끝납니다.
- `/api/me`가 403 `ACCOUNT_NOT_LINKED`면 로그아웃하고 로그인 화면에 안내합니다. 401·`SESSION_INVALID`만 로그아웃하고, 일시 오류(`SESSION_UNAVAILABLE`, 네트워크)는 세션을 유지한 채 재시도합니다.
- 전역 화면(경기 상세·회원 프로필·세션 상세·경기 기록 시트·세션 만들기·설정)은 `BottomNav`가 렌더하는 래퍼(`components/{match,profile,records,record,session,settings}/`)이며, 열려 있는 동안 연 탭에 깊이를 쌓아 브라우저 뒤로가기로 닫힙니다. 탭 페이지는 래퍼를 직접 렌더하지 말고 `useAppNavigation()`으로 엽니다.
- 보는 화면(경기 상세·회원 프로필·회원 경기 전체·세션 상세·세션 평점 변화 전체·설정·비밀번호 변경)은 `PushScreen`으로 엽니다. 하단 바(탭바·미니바·알림 바·+ 버튼)까지 덮고, 오른쪽에서 들어오며 뒤 화면(탭 셸 또는 아래 화면)은 왼쪽으로 30% 밀려 어두워집니다(320ms, 움직임 줄이기면 없음). 헤더(‹ 뒤로·제목·`headerRight`)는 `PushScreen`이 그리고, 버튼은 `actions`로 탭바 자리 하단 고정 바에 둡니다. 돌아가기는 ‹ 버튼과 기기 뒤로가기뿐이며(가장자리 끌기 없음) 맨 위 화면 하나씩 닫힙니다. 경기 상세·회원 프로필·세션 상세는 화면 위에 계속 쌓을 수 있습니다(`BottomNav`의 화면 스택). 짧은 입력은 바텀시트로 하며, 화면에서 연 시트는 `GLOBAL_LAYER.sheet` 이상 레이어로 그 화면 위에 뜹니다.
- `?matchId=` 딥링크는 시작할 때 `openMatchDetail`로 경기 상세를 엽니다.
- 홈 화면 추가 안내(`PwaInstallPrompt`)는 `BottomNav`가 렌더하며, 설치 안 된 모바일 브라우저에서 홈 탭이 보이고 전역 화면·메뉴가 하나도 열려 있지 않을 때만 뜹니다. 업데이트 감지와 무관하게 유지하고 저장 실패 알림이 떠 있는 동안만 숨깁니다. 닫으면 KST 날짜를 `pkpkdupr:install-prompt-dismissed-date`에 저장해 그날만 숨깁니다.

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
- 색·둥글기·글자 크기는 `src/index.css` `@theme`의 `pk-*` 토큰만 씁니다(예: `bg-pk-primary`, `text-pk-sub`, `rounded-pk-lg`, `text-pk-15`, `font-num`). 16진수 색을 클래스에 직접 쓰지 않습니다.
- 기본 클래스에 className prop을 합칠 때는 `components/ui/cx.ts`의 `cx`를 씁니다. tailwind-merge 기반이라 충돌하는 클래스는 뒤에 온 것만 남으므로 넘겨받은 className을 뒤에 둡니다. `!` 접두(important)로 우회하지 않습니다.
- `@theme`에 `pk-*` 토큰(색·둥글기·글자 크기)을 추가하거나 바꾸면 `cx.ts`의 tailwind-merge 토큰 등록도 함께 고칩니다. 빠지면 `text-pk-15`와 `text-pk-ink`처럼 접두가 같은 클래스를 같은 종류로 오인하거나 충돌을 못 정리합니다.
- 모션 곡선은 `@theme`의 `ease-pk-move`(이동·전환)와 `ease-pk-pop`(튀어나오는 등장) 두 개를 씁니다. arbitrary `ease-[cubic-bezier(...)]`를 새로 쓰지 않습니다.
- 공용 애니메이션은 `index.css`의 `animate-pk-*`(`fade-in`·`fade-up`·`fade-out`·`pop`·`draw`·`sheen`·`ping`·`spin-slow`·`rise-in`·`sink-out`·`wobble`, 업적 축하 전용 `celebrate-pop`·`rays-pulse`·`slide-away`)를 재사용합니다. 모두 fill-mode both이고 지연·길이는 inline style `animationDelay`·`animationDuration`으로 덮어씁니다. `animate-pk-draw`는 요소에 `pathLength="1"`이 필요합니다. transform·opacity만 움직이고 height·top·width·left는 애니메이션하지 않습니다. 새 keyframes는 `@theme`에 `pk-` 접두로 추가하고 `cx.ts` 등록도 함께 고칩니다.
- 여러 요소가 맞물려 끝없이 도는 장식(`pk-flame-aura`, 진행 중 경기 랠리 `pk-rally-*`)은 예외로 `index.css` utilities의 컴포넌트 클래스와 파일 끝 keyframes로 두고, 움직임 줄이기도 그 클래스의 `@media (prefers-reduced-motion: reduce)`에서 처리합니다.
- 움직임 줄이기는 소비처에서 `motion-reduce:`(`motion-reduce:animate-none`, `motion-reduce:transition-none`, 장식 요소는 `motion-reduce:hidden`)로 끄고 최종 상태를 바로 보입니다.
- 화면 등장 연출(CSS 애니메이션·숫자 카운트업)은 화면이 보이게 될 때마다(처음 마운트 포함) 처음부터 한 번 재생합니다. 보임은 `context/ScreenVisibilityContext.tsx` 기준이고, 같은 보임 안의 `dataVersion` 재조회·리렌더·바텀시트 열고 닫기로는 다시 재생하지 않으며, 숨김 중이나 콘텐츠 준비 전(`isReady` false)에는 진행하지 않습니다. CSS 애니메이션은 `hooks/usePlayOnShow.ts`의 `isPlaying`일 때만 클래스를 붙이고 가장 늦게 끝나는 요소(자식에 다른 애니메이션이 없는 요소)의 `onAnimationEnd`에 `finish`를 겁니다. 무한 반복(`ping`·`spin-slow`)은 끝나지 않으므로 `usePlayOnShow`에 쓰지 않습니다. 숫자 카운트업은 `hooks/useCountUp.ts`의 `useCountUp`(움직임 줄이기면 바로 최종 값)을 쓰고, 세는 동안 자릿수가 바뀌어 주변이 흔들리면 `ui/CountUpText.tsx`로 폭을 최종 값에 고정합니다.
- Barlow Condensed는 600·700 굵기만 로드하므로 `font-num`에는 `font-bold` 이하만 씁니다.

## 디자인 규칙

- 아래는 구현 규칙이고, 화면별 결정·다시 제안하지 않는 안·시안 작업 방식은 `docs/design.md`(루트 기준)를 함께 따릅니다.
- 기본색은 블루 `pk-primary`(#2346a8)입니다. 버튼은 모두 블루 계열(채움, 연한 `pk-primary-soft` 바탕, `pk-primary-line` 테두리)이며 하이라이트 색을 버튼에 쓰지 않습니다. 시트 하단 왼쪽의 글자 너비만 한 작은 보조 버튼(취소·이전·다시 고르기·경기 시작)은 `soft`(`pk-primary-soft` 바탕·`pk-primary` 글자)입니다. 색 있는 버튼은 누를 수 있고 회색(`pk-neutral`)은 비활성이라는 구분을 지키기 위해, 보조 버튼에 회색 바탕을 쓰지 않습니다.
- 테두리가 필요한 곳(진행 중인 내 경기 카드, 테두리 버튼)은 옅은 파랑 `pk-primary-line`입니다.
- 하이라이트 `pk-hl`(앰버 #ffb627)은 테두리 없이 LIVE 표시와 오늘의 급상승에만 씁니다. 예외로 경기 삭제 버튼의 길게 누르기 채움 앞 끝 선에 씁니다. 평점 추세선 끝점은 블루 점입니다.
- 랭킹 1~3위는 금·은·동(`pk-gold`·`pk-silver`·`pk-bronze`) 원입니다. 상승은 `pk-up`, 하락은 모두 `pk-down`, 보합은 회색입니다. 빨강(`pk-down`) 채움 버튼은 경기 삭제 확인 시트의 "길게 눌러 삭제"(`HoldToConfirmButton` `danger`, 1초)뿐입니다.
- 평점 없음은 "–"로 표기하고 NR 글자·알약을 쓰지 않습니다(`formatRating`도 값이 없으면 "–"). 랭킹의 평점 없는 회원 줄은 순위·평점 모두 "–", 세션 평점 변화 줄은 세션 후 평점이 없으면 평점 부분 없이 승패만, 내 변동 카드는 큰 "–" 하나만(변화 표시 없음) 보입니다. 처음 평점을 받은 회원도 다른 회원처럼 시작 평점 3.000 → 새 평점과 3.000 기준 변화량으로 보이며 NEW 같은 별도 표시는 붙이지 않습니다(평점 로그·세션 리포트의 이전 평점에 3.0이 들어 있음). 세션 전 평점이 없는 경우(첫 평점이 공식 DUPR 조정)만 새 평점만 보이고 변화는 "–"입니다. 팀 평균 등 평균 표시는 NR을 3.0으로 칩니다.
- 카드에는 테두리가 없습니다. 둥글기는 12/20/999만, 글자 크기는 12/13/15/17/22/26만 씁니다.
- Barlow Condensed(`font-num`)는 화면당 주인공 큰 숫자 하나에만 쓰고, 본문은 Pretendard입니다.
- 경기 행은 팀 아바타 쌍을 넣고 이긴 쪽만 강조합니다(A·B팀 색 구분·승 배지 없음). 줄 맨 위 메타 줄에 시간을 두고 내 경기면 시간 뒤에 " · 내 경기" 글자만 붙으며(바탕 강조 없음), 시간 열은 따로 없고, 코트 번호는 어디에도 표시하지 않습니다.
- 바텀시트는 고정 높이(화면의 약 3/4)이고 헤더·하단 버튼은 고정, 가운데만 스크롤합니다. 그랩바·헤더(위 56px) 또는 맨 위에서 시작한 본문을 아래로 끌어 닫을 수 있고(`hooks/useSheetDrag.ts`), 키보드가 열려 있는 동안은 하단 버튼(`BottomSheet.Footer`)이 숨습니다(`App.tsx`의 `<html data-keyboard-open>`). 열림 판정은 `lib/keyboardViewport.ts`로, 입력칸 포커스 중 보이는 높이가 포커스 없을 때보다 150px 이상 줄었는지로 봅니다(안드로이드 `resizes-content`는 레이아웃도 같이 줄어 `innerHeight` 차이로는 판정할 수 없습니다). 탭 셸 하단 바(탭바·+ 버튼·미니바·알림 바)와 `PushScreen` 하단 고정 바도 같은 기준(`app-keyboard-hidden`)으로 숨습니다. 새 경기 기록은 나를 첫 자리에 넣어 열고(내가 진행 중 경기에 있으면 비움), 선수 목록 맨 위에는 항상 내가 옵니다. 경기 저장은 1초 길게 누르기(`HOLD_TO_CONFIRM_DURATION_MS`)입니다.
- 다크 테마는 만들지 않습니다.
- 홈·나 탭은 탭 제목 머리(`TabHeader`) 없이 첫 콘텐츠로 시작하고, `TabHeader`는 랭킹 탭만 씁니다. 일정 탭은 달력 카드로 시작합니다. 홈은 진행 중 세션이 있으면 그 세션의 블루 카드(`SessionBlueCard`, 버튼 없음)로 시작합니다.

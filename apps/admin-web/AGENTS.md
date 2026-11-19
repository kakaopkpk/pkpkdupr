# admin-web 가이드

관리자 화면(`apps/admin-web`) 디자인·구조 규칙이다. 루트 `AGENTS.md`와 함께 따른다.

## 구조

- 로그인 뒤 화면은 `components/layout/AdminLayout.tsx`(왼쪽 사이드바 + 본문)가 감싼다. 메뉴는 홈 / 회원 / 경기 / 세션 / 평점이고 라우트는 `/`, `/members`, `/matches`, `/sessions`, `/ratings`다. 모르는 경로는 `/`로 보낸다.
- 화면은 메뉴별 폴더 `src/pages/<메뉴>/`(`home`·`members`·`matches`·`sessions`·`ratings`)에 두고, 진입 파일은 `<Name>Page.tsx`(기본 export)다. 화면 전용 컴포넌트·계산은 같은 폴더에 둔다. 로그인 화면은 `src/pages/Login.tsx`, 로그인 상태는 `src/context/AuthContext.tsx`다.
- 공통 UI는 `src/components/ui/`, 레이아웃은 `src/components/layout/`에 둔다. 웹(`apps/web`)의 `components/ui`는 모바일 전제라 가져오지 않고, 토큰 값만 맞춘 어드민 전용 컴포넌트를 쓴다.
- 다른 화면으로 보내는 링크는 `lib/adminRoutes.ts`의 `membersPath`·`matchesPath`·`sessionsPath`·`ratingsPath`로 만들고, 받는 화면은 `parse*Params`로 읽는다. 쿼리 키를 직접 쓰지 않는다.
- 날짜·시각·평점 표시는 `lib/format.ts`(KST 기준)를 쓴다.
- 세션 종류 이름·색(정기 블루 채움, 회원 세션 흰 바탕 블루 테두리, 대회 `pk-ink` 채움)은 `pages/sessions/sessionKind.ts`에서만 정한다. 세션 만들기·수정(`SessionFormDialog`)에서 종류를 고른다.
- 대회 세션 상세 패널에는 "대진" 칸이 있다.
  - 라운드별로 예정·진행 중·끝난 경기를 보이고, 라운드와 두 팀(세션 참여자 중)을 골라 예정 경기를 만든다(`POST /api/admin/match-sessions/:sessionId/bracket-matches`). 끝난 세션에서는 만들지 않는다.
  - 대진 경기 삭제는 경기 삭제(`DELETE /api/admin/matches/:matchId`)를 쓴다.
  - 오늘·미래 대회 세션 패널(`UpcomingSessionPanel`)의 `TournamentBracketSection`이 맡는다. 예정 경기만 지우고, 만들기는 `AddBracketMatchDialog`(점수 칸 없는 `MatchLineupEditor`, 후보는 세션 참여자)다.
- 끝난 대회 세션 상세 패널에는 "최종 순위" 칸이 있다.
  - 1~3위마다 그 대회 참여자 중 1명 이상을 `PlayerPicker`로 고른다(개인·2인·4인 팀 모두). 한 사람은 한 순위에만 넣는다.
  - 저장은 통째로 바꾸는 `PUT /api/admin/match-sessions/:sessionId/placements`이고, 고른 순서가 저장되어 첫 사람이 대표다.
  - 지난 대회 세션 패널(`PastSessionPanel`)의 `TournamentPlacementsSection`이 맡고, 초기값은 세션 상세(`MatchSessionDetail.placements`)에서 읽는다.
- API는 `src/api/`의 도메인별 클라이언트 함수(`players`·`matches`·`sessions`·`ratings`, 공통 처리 `client.ts`)로 부른다. 화면에서 `apiFetch`(`lib/api.ts`)·`fetch`를 직접 부르지 않는다.

## 디자인 규칙

- PC 전용(폭 1280px 이상)이다. 폰 레이아웃을 만들지 않는다.
- 색·둥글기·글자 크기는 `src/index.css`의 `pk-*` 토큰만 쓴다(값은 `apps/web/src/index.css`와 같다). raw Tailwind 팔레트 색(`gray-*`·`slate-*`·`blue-*` 등)과 하드코딩 색을 쓰지 않는다. 토큰을 추가하면 `components/ui/cx.ts` 목록도 고친다. HeroUI를 쓰지 않는다.
- 둥글기는 12(`rounded-pk-sm`) / 20(`rounded-pk-lg`) / 999(`rounded-full`)만 쓴다. 예외로 둥근 틀 안쪽에 여백을 두고 끼운 칸(`SegmentedControl` 선택 칸 9px)은 바깥 둥글기에서 여백을 뺀 값을 쓴다.
- 글자 크기는 `text-pk-12/13/15/17/22/26`만 쓴다.
- 글꼴은 본문 Pretendard, 숫자 Barlow Condensed(`font-num`)다. `font-num`은 28px 이상 큰 숫자(홈 요약 숫자, 평점 타일 등)에만 쓰고, 표 숫자는 15px `tabular-nums`다.
- 화면은 목록 + 오른쪽 상세 패널(`ListWithPanel`·`DetailPanel`) 구조다. 표 안에 입력창을 두지 않는다. 아무것도 고르지 않으면 패널을 닫고 목록이 전체 폭이 된다. 고른 줄은 `pk-primary-soft` 바탕이다.
- 버튼(`Button`)은 블루만 쓴다. 높이 40px, 12px 둥글기, 13px 굵은 글자.
  - 기본 `primary`(블루 채움), 보조 `soft`(`pk-primary-soft` 바탕), 위험 작업 `outline`(흰 바탕·`pk-primary-line` 테두리), 덜 중요한 동작 `ghost`.
  - 위험 작업은 outline 버튼 → `ConfirmDialog`의 블루 채움 버튼으로 실행한다. 빨강 버튼은 쓰지 않는다.
- 상태 칩(`Chip`)은 회색(`pk-divider` 바탕·`pk-sub` 글자)이다. 블루 바탕은 누를 수 있는 것에만 쓴다.
- 입력칸(`TextInput`·`SearchField`)은 높이 40px, 테두리 없음, `pk-bg` 바탕, 15px 글자다. 회원 고르기는 `PlayerPicker`를 쓴다.
- 세그먼트(`SegmentedControl`)는 `pk-neutral` 바탕 3px 안쪽, 선택 칸 흰 바탕·`pk-ink` 글자다. 켜고 끄는 필터는 `ToggleChip`(흰 알약, 켜지면 블루 계열)이다.
- 표: 머리 12px 600 `pk-sub`(정렬은 `SortHeader`), 칸 패딩 12px, 본문 15px, 줄 사이 `pk-divider` 1px 선.
- 카드(`Card`): 흰 바탕, 20px 둥글기, 테두리 없음, 패딩 20px. 카드 제목 17px 700. 페이지 제목은 `PageHeader`(26px)다.
- 상승은 `pk-up`, 하락은 `pk-down`(`RatingDelta`)이다. 평점 없음은 "–"(`formatRating`)이며 NR 글자를 쓰지 않는다.
- 아바타(`PlayerAvatar`)는 아이디 첫 글자 대문자, 흰 글자, 블루 계열 원이다.
- 용어는 앱과 같다: 평점(레이팅 아님)·경기(매치 아님)·아이디(Username 아님)·남/여·신뢰도(Confidence 아님).
- 결과 알림은 하단 토스트(`useToast().showToast`), 입력 오류(4xx)는 패널·대화상자 안 문구(`InlineError`)다.
- 대화상자는 `Dialog`·`ConfirmDialog`를 쓴다(포커스 가둠, Esc·바깥 클릭으로 닫힘, `ConfirmDialog`는 진행 중 잠금과 오류 표시).

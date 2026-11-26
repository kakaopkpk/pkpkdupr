# apps/api API 계약

루트 `AGENTS.md`의 아키텍처·도메인 규칙과 함께 따릅니다. API 경로·요청·응답·상태 코드를 바꾸면 이 문서의 해당 엔드포인트 항목을 같은 PR에서 고칩니다. 엔드포인트 하나를 항목 하나로 쓰고, 조건·예외는 하위 항목으로 나눕니다.

## 상태

- `GET /api/health`
- `GET /api/ping`

## 예약 작업

- `POST /api/cron/regular-sessions`
  - 헤더 `x-cron-secret`을 함수 secret `CRON_SECRET`과 비교한다. 없거나 틀리면 401, `CRON_SECRET` 미설정이면 503.
  - 응답은 `RegularSessionsCronResponse`이고, 응답 전에 다가오는 세션 전부의 구글 캘린더 일정을 다시 쓴다.
  - GitHub Actions `regular-sessions-cron.yml`이 매일 KST 04:00에 부른다.

## 인증·프로필

- 로그인과 비밀번호 변경은 클라이언트가 Supabase Auth로 직접 합니다.
- `GET /api/me`
  - 웹·어드민이 앱을 열거나 앱으로 돌아올 때 부르므로, 마지막 기록에서 5분이 지났으면 앱 진입 시각 `players.last_active_at`을 갱신한다. 기록은 응답을 기다리게 하지 않고, 실패해도 응답은 그대로다
- `POST /api/me/password-changed`: 첫 로그인 비밀번호 변경 완료
- `PATCH /api/me/profile`
- avatar API

## 플레이어

- `GET /api/players`: active만
- 프로필 요약 `GET /api/players/:playerId/profile-summary`
  - 회원 정보 `player`(비활성 회원 포함, 없는 회원 404)
  - 승패·평점 변화·최근 7일 경기 수와 그 승패(`last7DaysWins`·`last7DaysLosses`)
  - 파트너 궁합(같은 팀 3경기 이상)
  - 천적(맞대결 3경기 이상·진 비율 50% 이상, 둘 다 조건에 맞는 회원 전부)
  - 요청자 기준 분류별 상대 전적과 그 경기들에서 바뀐 요청자 평점 합 `headToHead[분류].ratingDelta`
  - 업적 진행 상태 `achievements`(아래 "업적")
  - 지금 연승 수 `winStreak`(아래 "랭킹"과 같은 규칙)
  - 분류별 시즌 최고 평점 `peakRating`(`buildPeakRating`)
    - 시즌 구분이 아직 없어 시즌 1 = 전체 기록이다.
    - 그 분류 평점이 바뀐 평점 변경 로그(`delta[분류] ≠ 0`)의 `nextRating`과 지금 평점 중 최댓값이고, 지금 평점이 없는 분류는 null이다.

## 경기

- `GET /api/matches`: `playerId`와 함께 `category=singles|doubles`로 분류 필터, 대진 예정 경기(`scheduled`) 제외
  - `playerId`가 있으면 경기마다 그 회원의 평점 변경 로그 `ratingChanges`(없으면 빈 배열)를 붙인다. 프로필 요약 `matches`도 같다. 웹 한 사람의 경기 목록이 경기별 평점 변화로 쓴다.
- 경기 목록 정렬: `GET /api/matches`·`GET /api/match-feed`·세션 경기 목록은 기록 시각(`getMatchRecordedAt`, 완료 경기는 점수를 입력한 `completedAt`, 그 밖은 `matchStartsAt`) 최신순
- 경기 기록 `POST /api/matches`: 직접 기록한 경기는 특수 매치가 아니라 `specialMatchCelebration`은 null
- 수정 `PUT /api/matches/:matchId`
  - 관리자는 24시간 검사 없이 고친다.
  - 관리자 전용 `sessionId`(문자열이면 그 세션으로 옮기고 null이면 세션에서 뺌)·`matchStartsAt`(완료 경기면 `completedAt`도 같은 만큼 옮김)으로 세션·경기 시각을 바꾼다. 회원이 이 둘을 보내면 403.
  - 선택적 `expectedUpdatedAt`이 서버 `updatedAt`과 다르면 409.
  - 대진 예정 경기(`scheduled`)에 점수를 넣으면 진행 중 경기 첫 점수와 같은 규칙으로 completed가 되고, 수정 기록(`match_edit_logs`)은 남기지 않는다.
  - 대진 예정 경기에 바로 점수를 넣는 것은 관리자만 한다. 회원이면 409, `POST /api/matches/:matchId/start`로 시작한 뒤 넣는다.
  - 이미 completed인 경기를 고치면 같은 트랜잭션에서 수정 전·후 스냅샷을 `match_edit_logs`에 남긴다(관리자 수정 포함). 진행 중 경기의 첫 점수 입력과 종류·이름·장소·팀·점수·세션·경기 시각이 그대로인 저장은 남기지 않는다.
  - 특수 매치(`specialMatch`)는 처음 completed가 되거나(첫 점수·관리자 정정) completed 경기를 고칠 때마다(승패가 같아도) 평점 반영·재계산 뒤 `SpecialMatchService.settleSpecialMatch`로 `outcome`을 정해 저장한다(`updated_at`은 그대로). 규칙은 루트 `AGENTS.md` "특수 매치".
    - 평점 잠금 밖에서 반영 직후 랭킹을 다시 읽어 정한다. 판정이 실패해도 응답은 200이고 결과는 그대로 둔다.
    - 결과가 null로 남은 completed 경기도 다음 수정 때 채운다(승패가 안 갈리면 그대로 null). 바뀐 결과는 저장하되 큰 연출은 결과가 처음 정해질 때만 싣는다.
    - 팀별 선수 구성이 바뀌는 저장은 `specialMatch`를 null로 지운다(팀 안 순서만 바뀌면 그대로).
  - 응답 `RecordedMatchResponse.specialMatchCelebration`은 결과가 이번 저장으로 처음 `rival_overtaken`·`streak_stopped`·`champions_won`으로 정해졌을 때만 큰 연출 데이터(`SpecialMatchCelebration`)이고, 그 밖은 null이다. 기록한 회원이 이긴 팀인지와 상관없이 싣는다.
- 삭제 `DELETE /api/matches/:matchId`
  - `isMatchRecordDeletable`, 이미 지워졌으면 404.
  - 선택적 `expectedUpdatedAt`이 서버 `updatedAt`과 다르면 409.
- 경기 상세 `GET /api/matches/:matchId`: 응답 `MatchDetailResponse`(경기·`ratingChanges`·이 경기로 받은 업적 `achievements`, 아래 "업적")
- 경기 응답(상세·세션 경기 목록 등)의 `session`은 `id`·`name`·`date`·`location`에 더해 `kind`·`startTime`·`endTime`(위 세션 응답과 같은 값)을 담는다. 웹이 서버 start 검증과 같은 `isSessionOnToday`로 "경기 시작" 노출을 판정하는 데 쓴다.
- 세션과 상관없는 진행 중 경기 시작 `POST /api/matches/start`
  - 요청 `sessionId`가 오늘 회원 세션이면 그 세션, 아니면 기록과 같은 시간 규칙을 따른다.
  - 선수가 이미 진행 중 경기에 있으면 409 "<아이디>님이 다른 경기 중이에요".
  - 확인·생성은 advisory 잠금으로 직렬화한다.
  - 같은 멤버로 한 판 더의 `rematchOfMatchId`를 주면 `judgeRematchSpecialMatch`로 리벤지를 판정해 `specialMatch`에 저장한다. 원래 경기가 없거나·완료 전이거나·승패가 안 갈렸거나·멤버가 다르면 null로 시작한다.
- 대진 예정 경기 시작 `POST /api/matches/:matchId/start`: 200 `Match`
  - 활성 회원 누구나. `status`를 created로, `matchStartsAt`을 시작 시각으로 바꾼다.
  - 경기 없음 404, 예정 경기가 아니면 409, 세션이 오늘 세션이 아니면 409.
  - 선수가 이미 진행 중 경기에 있으면 409 "<아이디>님이 다른 경기 중이에요".
  - `POST /api/matches/start`와 같은 advisory 잠금으로 직렬화한다.
- 진행 중 경기 전부 `GET /api/matches/in-progress`: 응답 `InProgressMatchesResponse`
  - `/api/matches/:matchId`보다 먼저 등록, 대진 예정 경기 제외.
  - `winStreaks`는 참가자 중 지금 연승(랭킹 `winStreak`과 같은 규칙)이 `WIN_STREAK_MIN` 이상인 정회원의 선수 id → 연승 수이고, 없으면 빈 객체다.
  - 연승은 완료 경기 결과만 읽어 센다. 못 읽으면 `winStreaks`만 빈 객체로 응답하고, 진행 중 경기가 없으면 읽지 않는다.
- `GET /api/match-feed`: 대진 예정 경기 제외
- 세션 조회 API

## 세션

- 오늘 세션 `GET /api/match-sessions/today`: 전날 시작해 자정을 넘긴 회원 세션도 끝나기 전까지 오늘 세션이다(`isSessionOnToday`).
- 다가오는 세션 `GET /api/match-sessions/upcoming`
  - 끝나기 전(`getSessionEndsAt`, 종료 시각이 있으면 종료 1시간 뒤 자동 완료) 오늘·미래 세션, 날짜 키 오름차순·같은 날은 정기 세션 먼저.
  - 조회 때 공휴일·정기 쉬는 날을 건너뛴 다음 정기 회차를 find-or-create.
- 오늘 정기 세션 열기 `POST /api/match-sessions/regular/today`: 정기 요일 22시 전만, 오늘이 공휴일·정기 쉬는 날이면 409
- 회원 세션 생성 `POST /api/match-sessions`
  - `dateKey` 생략 시 오늘, 과거 날짜 400.
  - 시작·종료 시각 `startTime`·`endTime`("HH:MM" KST)은 함께 주거나 함께 생략한다. 형식 오류·두 시각이 같으면 400.
  - 종료 < 시작이면 다음 날 종료.
  - 오늘 세션의 시작 시각이 지금보다 이르면 400.
  - 세션 날짜는 시작 시각의 날짜이고 세션 시각(`date`)은 시작 시각과 상관없이 그날 00:00 KST라, 같은 날 같은 이름은 409.
- 세션 응답의 `startTime`·`endTime`은 정기 세션이면 18:00~21:00, 시각 없이 만든 회원 세션이면 null
- 세션 응답의 `completedAt`은 회원이 세션을 완료한 시각이고, 완료 전이면 null
- 세션 완료 `POST /api/match-sessions/:sessionId/complete`: 200 `MatchSessionDetail`(대회 세션이면 `placements` 포함)
  - 활성 회원 누구나, 완료할 수 있는 시간(`isSessionCompletable`, 종료 10분 전~종료 1시간 뒤 자동 완료, 정기 20:50~22:00) 안의 완료 전 세션만 `completed_at`을 지금으로 쓴다.
  - 이미 완료된 세션이면 처음 완료 시각 그대로 200(동시에 눌러도 한 번만 쓴다).
  - 그 시간이 아니거나 시각 없는 회원·대회 세션이면 409, 없으면 404, id 형식 오류 400.
- 세션 응답 `MatchSessionDetail`(상세·일정·오늘·다가오는 세션·참여자 변경)에는 대회 세션만 최종 순위 `placements`가 붙는다.
  - 1~3위 오름차순이고 입력 전이면 빈 배열이다. 순위마다 고른 순서의 선수(첫 선수가 대표, 비활성 회원 포함)와 대진 승패 `record`(`countTournamentUnitRecord`, 셀 경기가 없으면 null).
- 상세 `GET /api/match-sessions/:sessionId`
- 세션 경기 `GET /api/match-sessions/:sessionId/matches`: 대진 예정 경기(`scheduled`, `round` 포함)도 포함
- 점수 없이 진행 중 경기 시작 `POST /api/match-sessions/:sessionId/matches`: `POST /api/matches/start`와 같은 처리, 오늘 세션만, 이미 진행 중인 선수 포함 시 409, 선수 자동 참여
  - 추천 카드의 `recommendedSpecialKind`를 주면 지금 그 경기 종류 랭킹·연승으로 `judgeRecommendedSpecialMatch`를 다시 판정해 유형이 같을 때만 `specialMatch`에 저장하고, 다르거나 리벤지·모르는 값이면 null로 시작한다(요청은 실패하지 않는다).
- 복식 추천 매칭 `GET /api/match-sessions/:sessionId/recommendations?courts=N&reroll=R`
  - 오늘 세션만, courts 기본 3·1~4로 자름.
  - `reroll`은 다시 추천 횟수(기본 0)이고 0 이상 정수가 아니면 400 "reroll은 0 이상 정수여야 합니다.". 옛 `rank` 쿼리는 읽지 않는다(보내도 400이 아니고 결과에 영향 없음).
  - reroll이 10(`MATCHMAKING_REROLL_CYCLE`)을 넘으면 `((reroll - 1) mod 10) + 1`로 순환한다.
  - 탐색 난수 seed는 세션 id와 완료 경기 수(`getMatchmakingSeed`)이고 다시 추천 단계별 난수는 seed와 단계 번호로 만든다. 같은 상황·같은 reroll이면 누구에게나 같은 결과.
  - 선발은 오늘 경기 수 오름차순이고, 같은 경기 수끼리만 단계별 난수로 순서를 정한다(1판 차이도 뒤집히지 않는다).
  - 대진 감점은 코트마다 팀 평균 차·같은 팀 반복·맞대결 반복·코트 평점 폭의 합이다(`MATCHMAKING_PENALTY_WEIGHTS`).
  - 같은 팀·맞대결 반복은 오늘 그 쌍이 함께한 완료 경기마다 0.5^k(`MATCHMAKING_REPEAT_DECAY`)를 더한다. k는 그 경기 뒤 두 사람이 각각 뛴 완료 경기 수 중 작은 값이고, 맞대결은 맞은편 사람 대 사람 쌍마다 센다.
  - 감쇠가 경기 순서를 쓰므로 세션 완료 경기를 완료 시각 오름차순으로 넘긴다.
  - 응답 코트 `repeatedPartnerPairs`·`repeatedOpponentPairs`는 감쇠와 상관없이 오늘 한 번이라도 같은 팀·맞대결이었던 쌍이다.
  - 후보는 최저 감점 + 5(`MATCHMAKING_CANDIDATE_PENALTY_MARGIN`) 이내 대진뿐이다.
  - reroll 0은 후보 중 감점이 가장 낮은 대진(같으면 대진 키 순 첫 번째)이다.
  - reroll 1 이상은 직전 대진을 빼고, 직전 대진과 같은 코트(두 팀 구성이 같은 코트) 수가 가장 적은 후보 중 무작위로 고른다.
    - 직전 대진은 서버가 같은 입력으로 다시 계산한 reroll − 1 결과다. 그래서 한 요청은 0단계부터 차례로 최대 11회 계산한다.
    - 후보가 직전 대진 하나뿐이면 그 대진을 돌려준다(여유폭 밖으로 가지 않는다).
  - 응답 `reroll`(순환을 반영해 적용한 값)·`candidateCount`(고른 대진이 속한 단계의 후보 수, 대진이 없으면 0).
  - 진행 중 경기 선수 제외.
  - 게스트는 팀 나누기·응답 팀 `averageRating` 모두 2.5(`MATCHMAKING_GUEST_RATING`)로 치고, 응답 선수 `doublesRating`은 null이다.
  - 팀 나누기는 NR 정회원을 게스트를 뺀 참여자 평점 중앙값(전원 NR이면 3.5)으로 대체하고, 응답 팀 `averageRating`은 NR 정회원을 3.0으로 친 표시용 평균.
  - 대진마다 코트를 복식 랭킹·연승·성별로 `judgeRecommendedSpecialMatch` 판정해, 가산점(`SPECIAL_MATCH_RECOMMENDATION_BONUS`, 최강자전 2, 라이벌전 1.5, 연승 매치·리벤지·남복·여복 매치 0)이 가장 큰 코트 하나의 가산점만 대진 감점에서 뺀다. 리벤지는 만들지 않는다.
  - 네 명 성별이 모두 같은 코트(남복·여복, 성별 없는 게스트 제외)는 코트마다 2(`MATCHMAKING_SAME_GENDER_COURT_BONUS`)를 감점에서 뺀다. 랭킹 원천을 못 읽어도 적용한다.
  - 후보 줄 세우기·여유폭은 가산점을 뺀 감점으로 한다.
  - 응답 코트 `specialMatch`는 코트 하나만 판정 결과(`outcome` null)이고 나머지 코트는 null이다. 가산점 코트(가장 큰 코트, 같으면 앞 코트)가 있으면 그 코트, 없으면 앞 연승 매치 코트, 그것도 없으면 앞 남복·여복 매치 코트다.
  - 응답 선수(`RecommendationPlayer`)에 복식 랭킹 순위 `doublesRank`(랭킹에 없으면 null)와 지금 연승 수 `winStreak`(랭킹과 같은 규칙).
  - 랭킹 원천을 못 읽으면 특수 유형 가산점 없이(남복·여복 가산점은 그대로) 추천하고, 코트 `specialMatch`는 모두 null, 선수 `doublesRank`는 null·`winStreak`는 0이다.
- 참여자 한 명씩 추가 `POST /api/match-sessions/:sessionId/participants`·삭제 `DELETE /api/match-sessions/:sessionId/participants/:playerId`
  - 활성 회원 누구나·대리 가능(게스트는 본인만), 오늘·미래 세션만(지난 세션 403), 멱등.
- 게스트 추가 `POST /api/match-sessions/:sessionId/guests` `{ username }`
  - 그 아이디로 게스트를 만들고 세션 참여자로 넣어 201 `Player`.
  - 같은 아이디로 Auth 계정(임시 비밀번호 `ADMIN_ISSUED_PASSWORD`, 첫 로그인 비밀번호 변경 강제)을 함께 만든다. DB 저장이 실패하면 만든 Auth 사용자를 지운다.
  - 세션 규칙은 참여자 추가와 같다.
  - `isValidUsername` 실패 400, 대소문자 무시 중복(같은 이메일 Auth 사용자 포함) 409.
  - 추가한 회원·세션을 저장한다.
- 게스트 세션의 쓰기 제한: 아래 요청은 로그인한 게스트면 403(`FORBIDDEN`, `GUEST_FORBIDDEN_MESSAGE`)이다.
  - `POST /api/matches`, `POST /api/matches/start`, `POST /api/matches/:matchId/start`, `PUT·DELETE /api/matches/:matchId`
  - `POST /api/match-sessions`, `POST /api/match-sessions/regular/today`, `POST /api/match-sessions/:sessionId/matches`, `POST /api/match-sessions/:sessionId/complete`, `POST /api/match-sessions/:sessionId/guests`
  - 참여자 추가·삭제는 본인(`playerId`가 자기 id)만 되고 다른 회원이면 403이다.

## 랭킹·세션 리포트

스냅샷 저장 없이 평점 변경 로그로 조회 시 계산합니다.

- 랭킹 `GET /api/rankings?category=doubles|singles|achievements`
  - 기본 doubles, 게스트 제외.
  - 순위·완료 경기 수·가장 최근 세션 시작 직전 대비 순위 변동 `rankChange`, NR 회원은 `unrated`.
  - 회원(`player`)에 상태메시지 `statusMessage`·`statusMessageBackgroundColor` 포함.
  - 세 분류 모두 줄마다 지금 연승 수 `winStreak`(`unrated` 포함). 완료 경기(게스트가 낀 경기 포함)를 단식·복식 합쳐 마지막 경기부터 세고, 승패가 안 갈린 경기는 끊는다(`packages/shared/src/streak.ts`).
  - 완료 경기 수 `matchCount`도 게스트가 낀 경기를 센다. 순위 변동 기준 세션만 평점 반영 경기가 있는 세션으로 고른다.
  - achievements면 업적 점수 순위 `AchievementRankingResponse`: 활성 정회원 전원, 점수 내림차순 → 그 점수에 먼저 도달한 순 → 아이디 순, 0점은 맨 아래, 순위 변동 없음.
- 세션 기록 목록 `GET /api/session-reports?limit=&playerId=`: 완료 경기가 있는 세션 최신순, limit 기본 20·최대 100, 지금 웹은 쓰지 않음
- 기록 목록 `GET /api/records?limit=&cursor=&playerId=`
  - 지금 웹은 쓰지 않음. 응답 `RecordsResponse` `{ items, nextCursor }`.
  - 완료 경기가 있는 세션 줄 `kind: 'session'`과 세션 없는 완료 경기 줄 `kind: 'match'`를 세션 `date`·경기 `completedAt` 내림차순, 같으면 id 내림차순으로 섞는다.
  - 세션 줄의 요청자 줄 `mine`은 세션 리포트 players의 요청자 줄과 같고, 안 뛰었으면 null, 업적 제외.
  - limit 규칙은 세션 기록 목록과 같다.
  - `cursor`는 `nextCursor`를 그대로 넘기며 형식 오류 400, 더 없으면 `nextCursor` null.
  - `playerId`는 그 회원이 뛴 세션·경기만.
  - 공개 Match hydrate는 페이지 경기만.
- 일정 탭 월별 조회 `GET /api/schedule?month=YYYY-MM`
  - 응답 `ScheduleMonthResponse`, month 형식 오류 400.
  - `sessions`: 세션 날짜 키가 그 달(KST)인 세션. 참여자·끝남 여부 `isEnded`(`getSessionEndsAt` 지남) 포함, 끝난 세션은 완료 경기가 있는 세션만, 날짜 키 오름차순·같은 날 정기 먼저.
  - `records`: 정렬 시각이 그 달인 기록 줄. 기록 목록 항목과 같은 형태·순서, 요청자 기준 `mine`.
- 홈 소식 피드 `GET /api/news-feed?cursor=`
  - 홈(진행 중 세션이 없을 때)의 "소식" 피드가 사용.
  - 응답 `NewsFeedResponse` `{ items, nextCursor }`(`packages/shared/src/newsFeed.ts`). 저장 없이 요청마다 계산한다.
  - `cursor`는 `nextCursor`(세션 `date` ms 정수 문자열)를 그대로 넘기며 형식 오류 400, 첫 페이지는 생략.
  - 페이지: 완료 경기가 있는 세션 중 남은(cursor보다 이른) 세션의 가장 최근 `date`부터 28일 전까지(포함)의 세션 전부. 더 오래된 세션이 남으면 `nextCursor`는 이 페이지 가장 오래된 세션 `date`, 없으면 null.
  - 새 회원 항목 `kind: 'newMember'`: 지금 활성 정회원마다 하나, 시각은 `getPlayerJoinedAt`(승급 회원은 `promotedAt`).
    - 시각이 이 페이지 가장 오래된 세션 `date` 이상, cursor 미만인 페이지에 나온다.
    - 첫 페이지는 위 끝(cursor), 마지막 페이지는 아래 끝이 없다.
  - `items`는 시각(세션 `date`·`joinedAt`) 내림차순, 같으면 세션 먼저, 세션끼리는 id 내림차순.
  - 세션 항목의 `session`·`mine`(요청자 줄, 안 뛰었으면 null)·`topRiser`는 세션 리포트와 같은 값이다.
  - 세션 항목 `lines`는 지금 활성 정회원만, 칭찬 → 랭킹 → 연승 → 업적 순이다.
  - 랭킹 줄: 세션 참가자 중 복식 `rankAfter` ≤ 3이고 `rankBefore`가 null이거나 더 큰 회원, 순위 오름차순. `rankChange`는 `rankBefore - rankAfter`(`rankBefore` null이면 null).
  - 연승 줄: 그 세션에서 경기(게스트가 낀 경기 포함)를 뛰었고, 세션 마지막 완료 경기까지 센 연승(랭킹 `winStreak` 규칙)이 `WIN_STREAK_MIN` 이상인 회원. 연승 내림차순 → 아이디 순.
  - 칭찬 줄(`kind: 'praise'`): 칭찬 마감(`closed`) 뒤 칭찬을 5개 이상 받은 후보, 후보 순서. `lines` 맨 앞이다.
    - 이 세션으로 받은 칭찬 업적이 업적 줄에 보이는 회원은 칭찬 줄 대신 업적 줄만 나온다.
  - 업적 줄: 세션 리포트 `achievements` 중에서 최대 3개(`NEWS_FEED_ACHIEVEMENT_LINE_LIMIT`).
    - 업적 점수 내림차순 → 업적 이름 가나다순 → 아이디 순으로 앞에서부터 고른다.
    - 예외로 `topRiser`가 이 세션으로 받은 '세션 지배자'(`dominator-1`) 업적은 지배자 줄과 겹쳐 뺀다. '세션 왕'(`dominator-10`) 이상 단계는 그대로 둔다.
- 세션 리포트 `GET /api/session-reports/:sessionId`: 선수별 경기·승패와 복식 평점·순위 전후, 최대 상승자 `topRiser`
  - `winStreaks`: 참가자 중 정회원의 선수 id → 세션 마지막 완료 경기까지 센 연승(랭킹 `winStreak` 규칙, 지난 세션부터 누적). 0이면 넣지 않는다. 웹 진행 중 세션 연승이 쓴다.
- 세션 줄(`MatchSessionHistoryItem`)의 `startTime`은 정기 세션 "18:00", 시각 없는 회원 세션 null

## 세션 칭찬

후보·자격·마감 규칙은 `docs/product.md` "세션 칭찬", 계산은 `packages/shared/src/sessionPraise.ts`와 `services/SessionPraiseService.ts`입니다. 칭찬은 `session_praises`(세션·보낸 회원당 한 줄, 바꾸거나 취소 불가)에 저장하고 후보는 저장 없이 조회 때 계산합니다.

- 칭찬 조회 `GET /api/match-sessions/:sessionId/praise`: 응답 `SessionPraiseResponse`
  - `status`는 세션 끝 시각(`getSessionEndsAt`) 전 `upcoming`, 그 뒤 1시간 `open`, 그 뒤 `closed`.
  - `candidates`는 점수 순 최대 3명(지금 활성 정회원만)과 지금 받은 칭찬 수 `praiseCount`. 끝나기 전 세션과 `SESSION_PRAISE_START` 전에 끝난 세션은 빈 배열이다.
    - 후보마다 분류 `category`와 값 `value`이고, 연승 수문장만 저지 횟수 `streakBreaks`가 붙는다(`value`는 끊은 가장 긴 연승).
  - 후보 계산은 세션 완료 경기 전체(게스트가 낀 평점 미반영 경기 포함)로 하고, 세션 지배자·평점 변화·순위는 세션 리포트와 같다.
    - 언더독만 평점 반영 경기로 세고, 경기 직전 평점은 세션 참가자 평점 변경 로그의 `previousRating`(업적 언더독과 같은 입력)이다.
    - 복수자는 완료 경기 요약의 특수 매치 결과 `specialMatchOutcome`(`special_match.outcome`)이 `revenge_success`인 경기로 센다.
  - `myTargetPlayerId`는 요청자가 칭찬한 회원(안 했으면 null). id 형식 오류 400, 없는 세션 404.
- 칭찬하기 `POST /api/match-sessions/:sessionId/praise` `{ targetPlayerId }`: 200 `SessionPraiseResponse`(저장 반영)
  - 활성 회원 누구나(그 세션에서 경기하지 않았어도), 자기 자신도 된다.
  - `open`이 아니거나 후보가 없으면 409, 후보가 아니면 400, 이미 칭찬했으면 409.
- 팝업 대기 `GET /api/me/session-praises/pending`: 응답 `PendingSessionPraisesResponse`
  - 요청자가 참여자이고 `open`이며 아직 칭찬하지 않았고 후보가 2명 이상인 세션, 세션 끝 시각 최신순.

## 업적

저장 없이 완료 경기로 조회 시 계산합니다. 정의·계산은 `packages/shared/src/achievements.ts`입니다.

- 게스트가 낀 완료 경기도 센다. 평점 업적의 복식 경기 수·평점과 언더독만 평점 반영 경기로 센다.
- 게스트 본인은 어느 응답에서도 업적을 받지 않는다(`newAchievements`·`achievementPoints`·`achievements`·holders 수, 게스트 프로필은 모두 미획득·진행도 0).
- 점수
  - 업적 점수는 정의의 `points`(10·25·50·100점)이다.
  - 회원 점수는 받은 업적 점수 합(`sumAchievementPoints`, 만점 `ACHIEVEMENT_MAX_POINTS`)이라 업적을 잃으면 점수도 빠진다.
- 집계 시작 시각
  - 진행도 지표별 `METRIC_COUNT_START`로 정한다.
  - 경기 수·승 수·출석은 이관 경기를 포함한 전체 기록을 센다.
  - 나머지 지표는 업적 기준 시각 `ACHIEVEMENT_COUNT_START`(2026-11-17 00:00 KST, `achievementCountStart.ts`) 뒤 완료 경기만 센다.
  - 새 지표를 쓰는 업적을 추가하면 그 지표는 추가 배포일 00:00 KST부터 센다.
  - 언더독·연승 저지·환영 인사·개근상·천적 지표는 `SECOND_ACHIEVEMENT_SET_COUNT_START`(2026-11-18 00:00 KST)부터 센다.
  - 대회 업적 지표는 `TOURNAMENT_ACHIEVEMENT_COUNT_START`(2026-11-24 00:00 KST)부터 센다. 순위 업적은 받은 경기의 완료 시각으로 본다.
  - 기존 지표에 단계만 늘리는 업적(예: 1000경기 다음 5000경기)은 그 지표의 시작 시각을 따른다.
  - 기존 업적의 조건 수정은 원래 시작 시각부터 다시 계산한다.
  - 업적 기준 시각 전 경기로 받은 업적은 받은 업적으로 치지만 세션 리포트·경기 상세 `achievements`와 `newAchievements`에는 나오지 않는다(`isEarnedByCountedMatch`).
- 응답에 나오는 곳
  - 프로필 요약의 `achievements`: 56개 진행 상태, 평점 업적은 평점 반영 복식 경기 수 `ratedDoublesMatches` 포함. 랭킹 원천(전체 완료 경기·평점 로그)으로 계산하고, 원천을 못 읽으면 그 회원 경기로만 계산하며 연승 저지·환영 인사·개근상·무패 세션·세션 지배자는 받지 않은 상태로 둔다.
  - 경기 기록·수정 응답의 `newAchievements`(이 저장으로 참가자 전원이 새로 받은 업적)와 `achievementPoints`(새 업적을 받은 참가자별 지금 업적 점수 합). 새 업적은 전체 완료 경기·전원의 평점 로그로 계산한다.
  - 세션 리포트의 `achievements`: 그 세션 경기로 받은 업적.
  - 경기 상세의 `achievements`: 그 경기로 참가자 전원이 받은 업적(세션 리포트와 같은 규칙, 세션 없는 경기 포함). 완료 경기가 아니면 빈 배열이고, 계산이 실패해도 빈 배열로 응답한다.
- 업적별 받은 활성 회원 수 `GET /api/achievements/holders`
- 축하 연출 확인
  - 확인 여부만 `player_seen_achievements`에 업적별 확인 당시 획득 경기로 저장한다.
  - 미확인 업적 `GET /api/me/achievements/unseen`: 응답에 요청자 업적 점수 합 `points`, 확인 기록이 없거나 기록의 획득 경기가 지금과 다르면 미확인, 받은 시각 → 업적 정의 순서.
  - 확인 처리 `POST /api/me/achievements/seen` `{ achievements: [{ achievementId, earnedMatchId }] }`: 멱등, 204.
  - 업적을 잃었다가 다른 경기로 다시 받으면 다시 미확인이 된다.
- 무패 세션·세션 지배자는 만료된 세션(종료 시각이 아니라 빈 세션 만료 시각이 지난 세션, 회원이 세션을 완료했으면 완료 시각, `findEndedSessions`)에서만 받는다.
  - 진행 중이거나 아직 만료되지 않은 세션은 이후 경기로 결과가 바뀔 수 있어 세지 않는다.
  - `newAchievements`에는 나오지 않고, 세션이 만료된 뒤 미확인 업적으로 축하한다.
- 무패 세션은 만료된 세션의 모든 경기가 전승이고 4경기 이상일 때 받으며, 받은 경기는 전승 4번째 경기다.
- 다른 회원 기록이 필요한 업적(연승 저지·환영 인사·개근상)이 있어, 업적 계산에는 그 회원 경기가 아니라 동호회 전체 완료 경기를 넘긴다.
- 언더독: 경기 직전 상대 팀 평균 평점이 우리 팀보다 0.3 이상 높은데 이긴 경기다.
  - 경기 직전 평점은 그 경기 평점 변경 로그의 `previousRating`(경기 분류 평점, 업적 입력 `ratingBefore`)이고, 로그가 없는 선수는 3.0으로 친다.
- 연승 저지: 경기 직전 3연승 이상이던 상대(상대 팀 중 누구든)를 이긴 경기다. 상대 연승은 전체 기록으로 랭킹 연승과 같은 규칙으로 센다.
- 환영 인사: 같은 팀 파트너의 첫 완료 경기(게스트가 낀 경기 포함)에 함께 뛴 경기다(승패 무관).
- 개근상: 경기가 열린 정기 세션 회차에 8번 연달아 경기한 것이다.
  - 정기 세션 여부는 완료 경기 요약의 `regularSession`(업적 입력 `session.regular`)이다.
  - 경기가 열린 정기 회차에 빠지면 1부터 다시 세고, 진행도는 최고 연속 참여 수다.
- 천적: 같은 상대 한 명에게 10번 이긴 것이다.
- 세션 지배자 업적은 만료된 세션의 `topRiser`로 세며, 그 회원의 세션 마지막 경기로 받는다.
- 칭찬 업적(이쁨받기·이 구역 사랑둥이)은 한 세션에서 칭찬을 5개(`SESSION_PRAISE_HIGHLIGHT_MIN`) 이상 받은 세션 수로 센다.
  - 받은 시각은 5번째 칭찬 시각, 받은 경기는 그 세션에서 그 회원의 마지막 완료 경기(게스트가 낀 경기 포함)다. 그 세션에 경기가 없으면 세지 않는다.
  - 칭찬 기록은 `findEndedSessions`가 세션 원천의 `praises`로 업적 입력(`praisedSessionsByPlayerId`)에 붙인다.
  - `newAchievements`에는 나오지 않고 미확인 업적으로 축하한다.
- 대회 업적
  - 출사표는 대회 세션에서 한 첫 완료 경기로 받는다. 대회 여부는 완료 경기 요약의 `tournamentSession`(업적 입력 `session.tournament`)이다.
  - 포디움(3위 이내)·우승(1위)·3관왕(우승 3번)은 지금 대회 세션인 세션의 최종 순위(`match_session_placements`)로 센다. 종류가 바뀌어 남은 순위 행은 세지 않는다.
  - 순위 업적은 순위 단위의 선수마다 받고, 받은 경기는 그 대회에서 그 회원의 마지막 완료 경기(받은 시각은 그 경기 완료 시각)다. 그 대회에 경기가 없으면 세지 않는다.
  - 순위는 `findEndedSessions`가 세션 원천의 `placements`로 업적 입력(`placedSessionsByPlayerId`)에 붙인다. 세션 만료 여부는 보지 않는다.
  - 순위 업적은 `newAchievements`에 나오지 않고 미확인 업적으로 축하한다.
- 평점 업적
  - 높은 평점 3.0·3.5·4.0·4.5(수면 위로·구름 위 산책·성층권·궤도 진입)와 낮은 평점 2.5·2.0 이하(심해 탐사·마리아나 해구) 6개다.
  - 평점 반영 복식 경기가 10경기(`RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES`, 업적 기준 시각 전 경기 포함) 이상이 된 뒤의 복식 경기 직후 복식 평점(그 경기의 평점 변경 로그, 경기 업적 입력의 `doublesRatingAfter`)만 센다.
  - 높은 평점은 처음 기준 이상, 낮은 평점은 처음 기준 이하가 된 경기로 받고, 그 뒤 평점이 바뀌어도 유지된다(재계산하면 다시 쓴 로그를 따른다).
  - 평점 업적만은 업적 기준 시각 시점 평점(기준 시각 전 마지막 평점 반영 복식 경기 직후 평점, 그 전 최고치·최저치는 보지 않음)에서 시작해, 그때 이미 10경기와 기준을 채웠으면 그 경기로 받는다. 이 업적은 세션 리포트 `achievements`에 나오지 않는다.

## 데이터 변경 신호

- `/api/` 아래 GET·HEAD·OPTIONS가 아닌 요청이 2xx로 끝나면 `middleware/dataChangeSignal.ts`가 응답 뒤(`finish`) 바뀐 데이터 종류를 보낸다. 저장소 메서드가 아니라 이 미들웨어 한 곳에서 보내며 관리자 쓰기도 포함한다.
- 전송은 `services/DataChangeSignal.ts`가 Realtime REST broadcast(서비스 키, private 채널 `data-sync`, 이벤트 `changed`, payload `{ kinds }`)로 한다.
  - 응답을 막지 않고 Edge는 `EdgeRuntime.waitUntil`에 건다. 실패하면 한 번 다시 보낸 뒤 로그만 남긴다.
  - `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`가 없으면(테스트 등) 보내지 않는다.
  - GET 안에서 일어나는 변경(`cleanupExpired` 등)은 보내지 않는다.
- 경로 표(`resolveDataChangeKinds`, 위에서 처음 맞는 줄). 표에 없는 쓰기 경로는 모든 종류를 보내므로 새 쓰기 라우트를 추가하면 표에 줄을 넣는다.
  - 보내지 않음: `POST /api/me/password-changed`, `POST /api/me/achievements/seen`, `POST /api/admin/players/:playerId/official-dupr/preview`
  - `players`: `PATCH /api/me/profile`, `/api/me/avatar`, `POST /api/admin/register`, 그 밖의 `/api/admin/players*`(성별·아이디·비밀번호 초기화·삭제)
  - `players`·`ratings`·`achievements`: `PATCH /api/admin/players/:playerId/status`, `POST /api/admin/players/:playerId/promote`
  - `sessions`·`matches`(경기 시작): `POST /api/matches/start`, `POST /api/matches/:matchId/start`, `POST /api/match-sessions/:sessionId/matches`
  - `sessions`·`players`: `POST /api/match-sessions/:sessionId/guests`
  - `sessions`·`achievements`(세션 지배자·무패 세션 확정): `POST /api/match-sessions/:sessionId/complete`
  - `sessions`·`achievements`(칭찬 수·칭찬 업적): `POST /api/match-sessions/:sessionId/praise`
  - `sessions`: 그 밖의 `/api/match-sessions*`, `/api/cron/*`, `/api/admin/regular-session-skips*`
  - `sessions`·`achievements`(순위 업적): `PUT /api/admin/match-sessions/:sessionId/placements`
  - `sessions`·`matches`: `POST /api/admin/match-sessions/:sessionId/bracket-matches`
  - `sessions`·`matches`·`ratings`·`achievements`: 그 밖의 `/api/matches*`, `/api/admin/matches*`, 그 밖의 `/api/admin/match-sessions*`(세션 종류·날짜가 경기 응답의 세션 정보와 개근상·순위 변동 기준에 쓰임)
  - `matches`·`ratings`·`achievements`: `POST /api/admin/ratings/recalculate`, `POST /api/admin/players/:playerId/official-dupr`

## 관리자

전부 관리자 권한이 필요합니다.

### 회원

- 목록 `GET /api/admin/players`: 항목 `AdminPlayer`에 다음을 포함
  - 게스트 추가 정보 `guestAddedInfo`(정회원 null)
  - 평점 미반영 경기 수 `ratingExcludedMatchCount`
  - 첫 로그인 비밀번호 변경 전 `isFirstLogin`
  - 로그인 계정 여부 `hasLoginAccount`
  - 경기 행 수 `matchCount`, 가장 늦은 경기 시각 `lastMatchStartsAt`
  - 마지막 앱 진입 시각 `lastActiveAt`(`GET /api/me` 기록, 들어온 적 없으면 null)
- 경기 없는 회원 삭제 `DELETE /api/admin/players/:playerId`
- 성별·상태 변경 `PATCH /api/admin/players/:playerId/gender|status`
- 생성·상태 감사 로그 `GET /api/admin/player-creation-logs`·`player-status-logs`
- 회원 추가 `POST /api/admin/register`
- 비밀번호 초기화 `POST /api/admin/players/:playerId/password-reset`: 게스트도 되고, 계정이 없으면 새로 만들어 연결한다
- 아이디 변경 `PATCH /api/admin/players/:playerId/username`
- 게스트 정회원 승급 `POST /api/admin/players/:playerId/promote`
  - `{ gender }` 필수. 성별을 저장하고 응답 `AdminPromoteGuestResponse`(`player`·`initialPassword`)를 돌려준다.
  - 게스트 때 받은 계정이 있으면 아이디·비밀번호·첫 로그인 상태를 그대로 두고 `initialPassword`는 null이다.
  - 계정이 없으면 새로 발급하고(`initialPassword` `123qwe`) 첫 로그인 비밀번호 변경을 강제한다. 이때 아이디가 로그인 형식이 아니면 400.
  - 게스트 아님 409, 없는 회원 404, 성별 오류 400.
  - 승급 전 `ratingExcluded` 경기는 계속 미반영.
  - 성공하면 승급 시각을 `promotedAt`에 저장하고 응답 `player`와 회원 목록·`GET /api/players`가 내려준다. 승급 기록 전 회원은 null.
- 회원 추가·게스트 추가·승급·비밀번호 초기화의 임시 비밀번호는 `123qwe`(`ADMIN_ISSUED_PASSWORD`) 고정이다.

### 경기

- 전체 목록 `GET /api/admin/matches`: 대진 예정 경기 포함
- 일괄 등록 `POST /api/admin/matches/batch`: 세션은 `sessionId`로만 지정하고 그 세션 참여자로 선수를 넣는다. `session` 입력을 보내면 400 "세션은 sessionId로 지정해 주세요."
- 세션 연결 `PATCH /api/admin/matches/bulk-metadata` `{ matchIds, sessionId }`: 세션에 연결하면 선수를 참여자로 넣고, null로 빼면 참여자는 그대로
- 관리자 삭제 `DELETE /api/admin/matches/:matchId`
- 삭제 기록 `GET /api/admin/match-deletion-logs`: 지운 시각 내림차순
- 수정 기록 `GET /api/admin/match-edit-logs`: 응답 `AdminMatchEditLogsResponse`(수정 전·후 경기 스냅샷 `before`·`after`, 고친 회원 아이디), 고친 시각 내림차순
- 경기 정정은 `PUT /api/matches/:matchId`를 같이 쓴다.

### 세션

- 목록 `GET /api/admin/match-sessions`
- 만들기 `POST /api/admin/match-sessions` `{ kind, name, location, dateKey?, startTime?, endTime? }`: 응답 `ManagedMatchSession`
  - 회원·대회 세션은 회원 세션 생성과 같은 규칙이다.
  - 정기 세션은 그 날짜의 직접 만든 정기 세션(18:00~21:00, 보낸 시각 무시, `autoCreated` false)이 된다. 정기 요일(월·목)이 아니면 400, 이미 그날 정기 세션이 있거나 공휴일이면 409.
  - 정기 쉬는 날에도 만들고 쉬는 날 기록은 그대로 둔다.
- 수정 `PATCH /api/admin/match-sessions/:sessionId` `{ name?, location?, kind?, dateKey?, startTime?, endTime? }`
  - 이름·장소·종류는 지난 세션을 포함한 모든 세션에서 고친다.
  - 날짜·시각은 오늘·미래의 정기가 아닌 세션(바꾼 뒤 종류 기준)만, 아니면 409. 경기가 있는 세션은 날짜 409.
  - 날짜·시각이 실제로 바뀌면 완료 시각을 지운다.
  - 정기로 바꾸면 그날 직접 만든 정기 세션이 된다. 월·목이 아니면 400, 이미 있거나 공휴일이면 409.
  - 종류를 바꾸면 완료 시각을 지운다.
  - 직접 만든 정기에서 바꾸면 18:00~21:00 시각이 남고, 정기 쉬는 날은 생기지 않는다.
  - 자동 정기 세션(`autoCreated`)의 종류를 바꾸면 409.
  - 종류 변경과 나머지 필드는 한 트랜잭션으로 반영한다.
- 삭제 `DELETE /api/admin/match-sessions/:sessionId`: 오늘·미래 자동 정기 세션을 지우면 그 날짜가 정기 쉬는 날로 남고, 직접 만든 정기 세션은 남지 않음
- 대진 예정 경기 만들기 `POST /api/admin/match-sessions/:sessionId/bracket-matches` `{ round, teams }`: 201 `Match`
  - 대회 세션에 `status` scheduled·`source` admin_created·`round`인 점수 없는 경기 하나를 만든다. 팀 선수는 세션 참여자로 넣는다.
  - 세션 없음 404, 대회 세션이 아니거나 끝난 세션이면 409, 라운드·팀 오류 400.
- 최종 순위 바꾸기 `PUT /api/admin/match-sessions/:sessionId/placements` `{ placements: [{ place, playerIds }] }`: 200 `MatchSessionDetail`
  - 통째로 바꾼다(빈 배열이면 순위 없음). `playerIds` 순서를 저장하고 첫 선수가 대표다.
  - 세션 없음 404, 대회 세션이 아니면 409. 게스트 참여자도 넣을 수 있고 시각 제한은 없다.
  - 400: 1~3위 밖, 같은 순위 중복, 빈 선수, 세션 참여자 아님, 한 사람이 두 순위.

### 쉬는 날

- 목록 `GET /api/admin/regular-session-skips`: 공휴일 `holiday`·정기 쉬는 날 `canceled`
- 정기 쉬는 날 지정 `POST /api/admin/regular-session-skips` `{ dateKey }`: 201 `{ dateKey, reason: "canceled" }`
  - 오늘·미래 월·목만(아니면 400), 이미 쉬는 날이면 409.
  - 그날 자동 정기 세션은 참여자와 함께 지우고(경기가 있으면 409), 직접 만든 정기 세션은 그대로 둔다.
- 정기 쉬는 날 해제 `DELETE /api/admin/regular-session-skips/:dateKey`
  - 공휴일·지난 날짜는 409.
  - 응답 `session`은 그 자리에서 만든 자동 정기 세션(그날 직접 만든 정기 세션이 있으면 그 세션, 오늘 22시 이후면 null).

### 평점

- 전체 재계산 `POST /api/admin/ratings/recalculate`
- 공식 DUPR 미리보기 `POST /api/admin/players/:playerId/official-dupr/preview`
- 공식 DUPR 반영 `POST /api/admin/players/:playerId/official-dupr`

### 진단

- `GET /api/admin/diagnostics/timestamp-units`

# 옛 서비스(MySQL) 데이터 이관

원작자 서비스(v0.12.7, MySQL)의 mysqldump 파일로 Supabase DB를 **완전히 비운 뒤 다시 채웁니다.** 대상 DB에 있던 회원·경기·세션·Auth 사용자는 모두 사라집니다. 스크립트는 `apps/api/scripts/import-mysql-dump/`, 실행은 루트의 `pnpm db:import-mysql`입니다.

## 스크립트가 하는 일

`--execute`로 실행하면 아래 순서로 진행합니다. 옵션이 없으면 dry-run이라 덤프를 읽어 넣을 행 수와 정기 세션 변환 결과, 대상 DB의 현재 행 수만 출력합니다.

1. **비우기·이관(한 트랜잭션)**: `public` 앱 테이블을 모두 `TRUNCATE`하고 덤프 행을 지금 스키마로 바꿔 넣습니다. 실패하면 대상 DB는 그대로입니다. 스크립트가 모르는 테이블이 public에 있으면 쓰기 전에 멈춥니다.
2. **평점 재계산**: 관리자 '평점 재계산'과 같은 경로(`AuthService.recalculateDuprRatings`, 경기별 로그 포함)로 평점·경기별 평점 로그·경기 전 평점 스냅샷을 처음부터 다시 만듭니다.
3. **Auth 정리·계정 발급**: 기존 Auth 사용자를 모두 지우고, active 정회원마다 `toInternalEmail(아이디)` 계정을 공통 초기 비밀번호로 만들어 연결합니다. `is_first_login = true`라 첫 로그인 때 비밀번호를 바꿔야 합니다.
4. **캘린더 정리**: 지운 세션의 구글 캘린더 일정을 지웁니다(캘린더 설정이 있을 때만). 유지한 정기 세션(아래 `--keep-upcoming-regular-sessions`)의 일정은 지우지 않습니다.
5. **검증**: 테이블별 행 수, 덤프 평점과 재계산 평점의 차이, 계정 연결 수를 출력하고 `verify.md`로 남깁니다.

### 데이터 변환 규칙

- `players`: `password_hash`는 버리고 `avatar_url`·`auth_user_id`는 null입니다. 아바타 파일은 옮기지 않으므로 회원이 새로 올립니다. 부트스트랩 관리자 계정(`creation_source = 'bootstrap'`)은 경기 생성자·로그 작성자로 참조되므로 지우지 않고 inactive로 옮깁니다.
- `player_admins`: `--admin <아이디>`로 준 회원만 넣습니다. 비운 뒤 admin-web에 들어갈 관리자이므로 실행 모드에서는 필수입니다.
- `matches`: `mode`와 자동 합의 컬럼은 버리고 `rating_excluded = false`입니다. 옛 2선승 경기는 게임마다 단판 경기 하나로 쪼개 넣습니다. 규칙은 마이그레이션 `20261117120000_split_multi_score_matches.sql`과 같습니다(첫 게임은 원래 id, k번째 게임은 `M` + md5(`<원래 id>:game:<k>`) 16진수 7자, 시작 +(k-1)×10분·완료와 결과 입력 +(k-1)초).
- 정기 세션
  - 옛 "M/D 정기운동" 세션은 지금 정기 세션으로 바꿉니다. id는 유지하고, 이름은 요일별 이름(`getRegularSessionName`), 장소는 야탑초등학교, 시각은 그날 18:00 KST, `regular_date_key`를 채웁니다.
  - 세션 없이 기록된 경기 중 KST 월·목 18:00~22:00에 시작한 경기는 그날 정기 세션으로 묶습니다(`20261111070332_regular_sessions.sql` backfill과 같은 규칙). 새로 만드는 정기 세션 id는 날짜에서 정하므로 다시 돌려도 같습니다.
  - 그 밖의 세션(대회·행사)은 이름 그대로 일반 세션으로 옮깁니다.
  - 세션 경기의 선수는 모두 그 세션 참여자로 넣습니다.
- 평점 로그: 덤프의 경기별 로그(`match_completed`)와 재계산 요약 로그(`manual_recalculation`)는 옮기지 않고 재계산이 다시 만듭니다. 공식 DUPR 조정 로그(`official_dupr_adjustment_logs`)와 그 영향 로그(`official_adjustment_recalculation`, 프로필 차트가 씀)는 옮깁니다.
- 앞으로의 정기 세션(`--keep-upcoming-regular-sessions`): 비우기 직전(같은 트랜잭션) 대상 DB의 오늘(KST) 이후 정기 세션을 같은 id·날짜·이름의 빈 정기 세션으로 다시 넣습니다. 구글 캘린더 일정 id가 세션 id에서 나오므로, 서비스 계정 키 없이도 기존 일정을 그대로 이어 쓰고 예약 작업이 같은 날 일정을 하나 더 만들지 않습니다. 참여자는 지운 회원을 가리키므로 옮기지 않습니다. 덤프에 같은 날짜의 정기 세션이 있으면 덤프 쪽을 씁니다.
- 옮기지 않는 테이블: `match_result_approvals`(지금 스키마에 없음), 차트 캐시 `player_rating_chart_points`·`player_rating_chart_projections`(조회 때 다시 만듦), `__pkpkdupr_migrations`.

## 준비물

- 덤프 파일. `password_hash`가 들어 있으므로 저장소 밖에 두고, 이관이 끝나면 지웁니다.
- 대상 DB 접속 문자열 `DATABASE_URL`. 운영은 Supabase 대시보드 → Connect → **Session pooler** 문자열에 DB 비밀번호를 넣고 `?sslmode=require`를 붙입니다.
- `SUPABASE_URL`(`https://<project-ref>.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY`(대시보드 → Project Settings → API Keys, 또는 `pnpm exec supabase projects api-keys --project-ref <ref>`)
- `IMPORT_INITIAL_PASSWORD`: 공통 초기 비밀번호. 6자 이상이고 영문과 숫자를 모두 넣습니다. 셸 기록·커밋·로그·이슈에 남기지 않습니다(예: `read -rs IMPORT_INITIAL_PASSWORD; export IMPORT_INITIAL_PASSWORD`).
- (선택) `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID`: 함수 secret과 같은 값. 없으면 4단계를 건너뛰고 지운 세션 목록 파일만 남깁니다.

스크립트가 쓰는 보고 파일(`plan.json`, `wiped-sessions.json`, `verify.md`)은 `--out-dir`(기본 OS 임시 디렉터리의 `pkpkdupr-import-<시각>`)에 권한 600으로 남습니다. 비밀번호와 해시는 들어가지 않습니다.

## 전환 절차

월·목 18~22시(KST) 정기 세션 시간에는 운영에서 실행하지 않습니다.

1. **공지·입력 중지**: 회원에게 이관 시간 동안 앱을 쓰지 말라고 알립니다. 이관 뒤 지금 로그인은 모두 풀립니다.
2. **백업**: `docs/backup-restore.md`의 수동 실행으로 운영 DB(앱 테이블과 로그인 계정)를 백업하고 성공을 확인합니다.

   ```bash
   gh workflow run db-backup.yml --repo kakaopkpk/pkpkdupr-backup
   gh run list --workflow db-backup.yml --repo kakaopkpk/pkpkdupr-backup --limit 1
   ```

3. **dry-run**: 넣을 행 수와 정기 세션 변환 결과, 운영 DB의 현재 행 수를 확인합니다.

   ```bash
   export DATABASE_URL='postgresql://postgres.<project-ref>:<DB 비밀번호>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require'
   pnpm db:import-mysql --dump ~/Downloads/pkpkdupr-dump.sql --admin <관리자 아이디>
   ```

4. **실행**: 대상 확인 값은 Supabase면 프로젝트 ref, 아니면 DB 호스트입니다. `SUPABASE_URL`의 프로젝트가 `DATABASE_URL`과 다르면 멈춥니다.

   ```bash
   export SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service role key>
   read -rs IMPORT_INITIAL_PASSWORD; export IMPORT_INITIAL_PASSWORD
   pnpm db:import-mysql --dump ~/Downloads/pkpkdupr-dump.sql --admin <관리자 아이디> \
     --keep-upcoming-regular-sessions --execute --confirm-target <project-ref>
   ```

   - 계정 발급 도중 멈췄으면 `--issue-accounts --confirm-target <project-ref>`로 발급만 다시 합니다. 이미 연결된 회원은 건너뜁니다.
   - 검증만 다시 보려면 실행 때와 같은 `--admin`을 붙여 `--verify`(쓰기 없음)로 돌립니다. 덤프 밖 정기 세션(유지분·이관 뒤 예약 작업분)은 `match_sessions` 기대값에 따로 더합니다.

5. **검증 확인**: 출력과 `verify.md`에서 행 수가 모두 "같음"인지, 활성 회원 평점 차이가 기준(0.01) 안인지, active 회원이 모두 계정에 연결됐는지 봅니다. 평점 차이의 원인은 아래 "덤프 평점과 재계산 평점"을 참고합니다.
6. **캘린더**: 캘린더 env 없이 실행했다면 `wiped-sessions.json`의 세션 중 유지하지 않은 세션의 일정(지난 세션 등)이 캘린더에 남습니다. 필요하면 캘린더에서 지웁니다. 유지한 정기 세션 일정의 참석 표기는 그 세션 참여자가 처음 바뀔 때 새 값으로 다시 써집니다. 일정 id는 `pks` + 세션 id UTF-8 바이트의 16진수입니다(`toCalendarEventId`).
7. **정기 세션 만들기**: 예약 작업을 바로 한 번 돌려 앞으로 28일의 정기 세션·공휴일·캘린더 일정을 다시 만듭니다.

   ```bash
   gh workflow run regular-sessions-cron.yml --repo kakaopkpk/pkpkdupr
   ```

8. **로그인 확인**: 관리자 아이디와 공통 초기 비밀번호로 web에 로그인해 비밀번호 변경 화면이 뜨는지, 바꾼 뒤 admin-web에 들어가지는지 확인합니다.
9. **안내**: 회원에게 아이디(옛 서비스와 같음)와 공통 초기 비밀번호를 전달하고, 첫 로그인 때 비밀번호를 바꾸고 아바타를 다시 올려 달라고 공지합니다.
10. **정리**: 덤프 파일과 `--out-dir`의 보고 파일을 지웁니다. 셸의 `IMPORT_INITIAL_PASSWORD`도 `unset`합니다.

## 알아 둘 점

- **덤프 평점과 재계산 평점**: 옛 서비스의 평점은 경기마다 증분 반영된 값이고, 덤프의 경기별 로그도 한 번의 재생 결과가 아닙니다(같은 회원 로그 사이에 이어지지 않는 곳이 있음). 재계산은 완료 시각 순으로 처음부터 다시 재생하므로 경기별 로그 값은 많이 달라질 수 있지만, 최종 평점은 거의 같습니다. 같은 완료 시각인 경기(관리자 일괄 등록)는 재생 순서가 옛 서비스와 다를 수 있습니다.
- **경기 없는 지난 세션**: 경기가 없는 세션은 만료 시각이 지나면 첫 조회 때 정리되므로, 덤프의 경기 없는 지난 세션은 이관 직후 앱을 쓰면 사라집니다.
- **업적**: 업적 확인 기록(`player_seen_achievements`)이 비어 있으므로 회원은 첫 로그인 때 그동안 받은 업적을 축하 화면으로 봅니다.
- **inactive·아이디 형식**: inactive 회원과 아이디 형식(`isValidUsername`)이 맞지 않는 회원에게는 계정을 만들지 않습니다. 필요하면 admin-web에서 활성화·아이디 변경 뒤 "비밀번호 초기화"로 발급합니다.

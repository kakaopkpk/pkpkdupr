# DB 일시정지 방지와 암호화 백업

Supabase 무료 플랜은 일주일 가까이 DB 활동이 없으면 프로젝트를 일시정지하고, 백업을 제공하지 않습니다. GitHub Actions 예약 작업 두 개로 보완합니다.

| workflow | 주기 | 하는 일 |
| --- | --- | --- |
| `.github/workflows/db-keepalive.yml` | 3일마다(UTC 18:17) + 수동 | 운영 DB에서 `players` 수를 조회한다. 실패하면 workflow가 실패해 org 알림으로 드러난다 |
| `.github/workflows/db-backup.yml` | 매일 1회(UTC 18:23, KST 03:23) + 수동 | `pg_dump` → `gzip` → `age` 암호화 → 비공개 저장소 `kakaopkpk/pkpkdupr-backup`의 `backups/YYYY-MM-DD.sql.gz.age`로 push. 30일 지난 파일은 삭제한다 |

- 백업 대상은 `public` 스키마(앱 데이터 13개 테이블)입니다. Supabase가 관리하는 `auth`·`storage` 스키마는 포함하지 않습니다.
- 덤프 평문은 파이프로만 흘러 디스크·로그·artifact에 남지 않습니다. 저장소에는 암호화된 파일만 올라갑니다.
- `pg_dump` 클라이언트 메이저 버전은 `db-backup.yml`의 `PG_MAJOR`이며 `supabase/config.toml`의 `[db] major_version`과 같게 유지합니다. Supabase 프로젝트의 Postgres 메이저가 바뀌면 둘을 함께 올립니다.
- 파일명 날짜는 UTC 기준입니다.

## 사전 준비 (사람이 한 번 하는 일)

### 1. 백업 저장소 만들기

1. `kakaopkpk` org에 **비공개** 저장소 `pkpkdupr-backup`을 만든다. 기본 브랜치가 있어야 하므로 README 등으로 초기 커밋을 만들어 둔다.
2. 백업이 쌓이는 저장소이므로 접근 권한은 운영진으로 최소화한다.

### 2. age 키 쌍 만들기

운영진 한 명이 로컬에서 만든다. (`brew install age` 또는 `apt install age`)

```bash
age-keygen -o pkpkdupr-backup-key.txt
# Public key: age1...   ← 이 값이 공개키
```

- **공개키**(`age1...`)만 GitHub에 등록한다. 개인키 파일(`pkpkdupr-backup-key.txt`)은 저장소·채팅·이슈에 절대 올리지 않는다.
- 개인키는 **운영진 2명 이상**이 각자 비밀번호 관리자 등 안전한 곳에 보관한다. 개인키를 잃으면 모든 백업을 복호화할 수 없다.
- 개인키 보관자가 바뀌면 새 키 쌍을 만들고 공개키 variable을 교체한다. 교체 전에 만든 백업은 이전 개인키로만 복호화되므로, 이전 개인키도 백업 보존 기간(30일) 동안 유지한다.
- 공개키 등록: `pkpkdupr` 저장소 Settings → Secrets and variables → Actions → **Variables** → `BACKUP_AGE_PUBLIC_KEY`.

### 3. Deploy key 등록

push는 개인 토큰 없이 백업 저장소 단위의 Deploy key로 합니다. 특정 사람의 계정에 묶이지 않아 운영자가 바뀌어도 계속 동작합니다.

```bash
ssh-keygen -t ed25519 -N "" -C "pkpkdupr-backup-deploy" -f ./backup-deploy-key
```

1. `backup-deploy-key.pub` 내용을 `pkpkdupr-backup` 저장소 Settings → Deploy keys → Add deploy key에 등록하고 **Allow write access**를 켠다.
2. `backup-deploy-key`(개인키) 전체 내용을 `pkpkdupr` 저장소 Settings → Secrets and variables → Actions → **Secrets** → `BACKUP_DEPLOY_KEY`에 등록한다.
3. 로컬에 만든 `backup-deploy-key*` 파일은 삭제한다.

### 4. DB 접속 문자열 등록

`pkpkdupr` 저장소 Secrets에 `SUPABASE_DB_URL`을 등록한다. keepalive와 backup이 같이 쓴다.

- Supabase 대시보드 → Connect → **Session pooler** 접속 문자열을 쓴다. Direct connection은 IPv6 전용이라 IPv4만 지원하는 GitHub Actions 러너에서 접속되지 않는다.
- 비밀번호 자리 표시자(`[YOUR-PASSWORD]`)를 실제 DB 비밀번호로 바꿔 넣는다. 비밀번호에 특수문자가 있으면 URL 인코딩한다.

### 등록 요약

| 종류 | 이름 | 위치 | 값 |
| --- | --- | --- | --- |
| Variable | `BACKUP_AGE_PUBLIC_KEY` | `pkpkdupr` | age 공개키(`age1...`) |
| Secret | `BACKUP_DEPLOY_KEY` | `pkpkdupr` | deploy key 개인키 전체 |
| Secret | `SUPABASE_DB_URL` | `pkpkdupr` | Session pooler 접속 문자열 |

## 수동 실행

`pkpkdupr` 저장소 → Actions → `db-backup`(또는 `db-keepalive`) → **Run workflow**.

```bash
gh workflow run db-backup.yml --repo kakaopkpk/pkpkdupr
gh workflow run db-keepalive.yml --repo kakaopkpk/pkpkdupr
gh run list --workflow db-backup.yml --repo kakaopkpk/pkpkdupr --limit 5
```

처음 설정한 직후에는 두 workflow를 수동으로 한 번씩 실행해 성공을 확인한다. 같은 날 다시 실행하면 그날 파일을 덮어쓴다.

## 복원 절차

복원에는 `age`, `gunzip`, `psql`(복원 대상과 같은 Postgres 17 이상)이 필요하다. 덤프에 Postgres 17 설정이 들어 있어 더 낮은 버전에는 복원되지 않는다.

### 1. 백업 파일 받기

```bash
git clone git@github.com:kakaopkpk/pkpkdupr-backup.git
ls pkpkdupr-backup/backups/
```

### 2. 복호화 후 복원

복원 대상은 **비어 있는** `public` 스키마여야 한다. 새 Supabase 프로젝트(마이그레이션을 적용하지 않은 상태) 또는 로컬 Postgres를 쓴다. 덤프에 들어 있는 `public` 스키마 생성 구문은 이미 존재하는 스키마와 충돌하므로 `sed`로 제거한다.

```bash
# 대상 DB 접속 문자열(새 Supabase 프로젝트의 Session pooler 또는 로컬 Postgres)
TARGET_DB_URL="postgresql://postgres:<password>@127.0.0.1:5432/postgres"

age --decrypt -i pkpkdupr-backup-key.txt pkpkdupr-backup/backups/2026-01-01.sql.gz.age \
  | gunzip \
  | sed -e '/^CREATE SCHEMA public;$/d' -e '/^COMMENT ON SCHEMA public /d' \
  | psql "$TARGET_DB_URL" --set ON_ERROR_STOP=1
```

- 로컬 Postgres에 새 DB를 만들어 시험할 때: `createdb restore_test` 후 `postgresql://.../restore_test`를 대상으로 한다.
- `--no-owner --no-privileges`로 덤프했으므로 테이블 소유자는 접속한 사용자가 되고 별도 role 없이 복원된다. RLS 활성화(정책 없음)는 그대로 복원된다.
- 새 Supabase 프로젝트로 옮기는 경우 복원 뒤 `SUPABASE_DB_URL` secret, 앱의 DB 연결 설정, Auth·Storage 설정을 새 프로젝트 기준으로 바꾼다. `auth`·`storage` 데이터는 이 백업에 없다.

### 3. 확인

```bash
psql "$TARGET_DB_URL" -c "SELECT count(*) FROM players"
psql "$TARGET_DB_URL" -c "\dt"   # public 테이블 13개
```

## 주의

- **예약 작업 비활성화**: 공개 저장소는 60일 동안 저장소 활동이 없으면 GitHub가 예약 workflow를 자동으로 끈다. Actions 탭에 비활성화 안내가 보이면 workflow를 다시 활성화한다.
- **실패 알림**: 두 workflow 모두 실패하면 workflow 실패로 드러난다. 백업이 며칠째 올라오지 않으면 `pkpkdupr-backup`의 `backups/` 최신 파일 날짜를 확인한다.
- **보존 기간**: 30일이 지난 파일은 트리에서 지우지만 git 히스토리에는 남는다(암호화된 상태). 저장소가 커지면 히스토리를 정리한다.
- **복원 시험**: 개인키로 실제 복호화·복원이 되는지 분기마다 한 번 확인한다.

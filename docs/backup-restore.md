# DB 일시정지 방지와 암호화 백업

Supabase 무료 플랜은 일주일 가까이 DB 활동이 없으면 프로젝트를 일시정지하고, 백업을 제공하지 않습니다. GitHub Actions 예약 작업 두 개로 보완합니다.

| workflow | 위치 | 주기 | 하는 일 |
| --- | --- | --- | --- |
| `db-keepalive.yml` | 이 저장소 | 3일마다(UTC 18:17) + 수동 | 운영 DB에서 `players` 수를 조회한다. 실패하면 workflow가 실패로 표시된다(알림 대상은 아래 "주의" 참고) |
| `db-backup.yml` | 비공개 저장소 [`kakaopkpk/pkpkdupr-backup`](https://github.com/kakaopkpk/pkpkdupr-backup) | 매일 1회(UTC 18:23, KST 03:23) + 수동 | `pg_dump` → `gzip` → `age` 암호화 → 그 저장소 `backups/`에 커밋. 30일 지난 파일은 삭제한다 |

백업 workflow는 백업 저장소 안에서 돌고 기본 `GITHUB_TOKEN`으로 자기 저장소에 push합니다. `kakaopkpk` 조직은 deploy key를 막아 두었으므로 저장소 사이 push 키를 쓰지 않습니다.

하루 백업은 파일 두 개입니다.

| 파일 | 내용 |
| --- | --- |
| `backups/YYYY-MM-DD.sql.gz.age` | `public` 스키마 전체(`supabase/migrations/`로 만든 앱 테이블의 구조와 데이터) |
| `backups/YYYY-MM-DD.auth.sql.gz.age` | 로그인 계정 `auth.users`·`auth.identities`의 데이터만. 구조는 Supabase가 관리한다 |

- `storage`(아바타 파일)는 백업하지 않습니다. 잃으면 회원이 다시 올립니다.
- 덤프 평문은 파이프로만 흘러 디스크·로그·artifact에 남지 않습니다. 저장소에는 암호화된 파일만 올라갑니다.
- 파일명 날짜는 UTC 기준입니다. 같은 날 다시 실행하면 그날 파일을 덮어씁니다.
- `pg_dump` 클라이언트 메이저 버전은 백업 저장소 `db-backup.yml`의 `PG_MAJOR`이며 이 저장소 `supabase/config.toml`의 `[db] major_version`과 같게 유지합니다. Supabase 프로젝트의 Postgres 메이저가 바뀌면 둘을 함께 올립니다.

## 설정

백업 저장소(`kakaopkpk/pkpkdupr-backup`) Settings → Secrets and variables → Actions에 둡니다. 접근 권한은 운영진으로 최소화합니다.

| 종류 | 이름 | 값 |
| --- | --- | --- |
| Secret | `SUPABASE_DB_URL` | Supabase 대시보드 → Connect → **Session pooler** 접속 문자열. 비밀번호 자리 표시자를 실제 DB 비밀번호로 바꾸고(특수문자는 URL 인코딩) 끝에 `?sslmode=require`를 붙인다 |
| Variable | `BACKUP_AGE_PUBLIC_KEY` | age 공개키(`age1...`) |

- Session pooler를 쓰는 이유: Direct connection은 IPv6 전용이라 IPv4만 지원하는 GitHub Actions 러너에서 접속되지 않습니다.
- `sslmode=require`를 붙이는 이유: 지정하지 않으면 libpq 기본값(`prefer`)이라 TLS가 거부될 때 평문 연결로 내려갈 수 있습니다.
- 운영 DB 비밀번호를 바꾸면 이 저장소의 `SUPABASE_DB_URL`·`SUPABASE_DB_PASSWORD`(keepalive·배포용)와 백업 저장소의 `SUPABASE_DB_URL`을 함께 바꿉니다.

### age 키 쌍

운영진 한 명이 로컬에서 만듭니다(`brew install age` 또는 `apt install age`).

```bash
age-keygen -o pkpkdupr-backup-key.txt
# Public key: age1...   ← 이 값이 공개키
```

- **공개키**(`age1...`)만 백업 저장소 variable `BACKUP_AGE_PUBLIC_KEY`에 등록합니다. 개인키 파일은 저장소·채팅·이슈에 절대 올리지 않습니다.
- 개인키는 **운영진 2명 이상**이 각자 비밀번호 관리자 등 안전한 곳에 보관합니다. 개인키를 잃으면 모든 백업을 복호화할 수 없습니다.
- 개인키 보관자가 바뀌면 새 키 쌍을 만들고 공개키 variable을 교체합니다. 교체 전에 만든 백업은 이전 개인키로만 복호화되므로, 이전 개인키도 백업 보존 기간(30일) 동안 유지합니다.

## 수동 실행

```bash
gh workflow run db-backup.yml --repo kakaopkpk/pkpkdupr-backup
gh run list --workflow db-backup.yml --repo kakaopkpk/pkpkdupr-backup --limit 5
gh workflow run db-keepalive.yml --repo kakaopkpk/pkpkdupr
```

## 복원 절차

복원에는 `age`, `gunzip`, `psql`(Postgres 17 이상)이 필요합니다. 덤프에 Postgres 17 설정이 들어 있어 더 낮은 버전에는 복원되지 않습니다.

복원 대상은 **Supabase 프로젝트**입니다. `players.auth_user_id`가 `auth.users`를 가리키는 외래 키라서, auth 스키마가 없는 일반 Postgres에는 public 덤프가 끝까지 들어가지 않습니다.

### 1. 백업 파일 받기

```bash
git clone git@github.com:kakaopkpk/pkpkdupr-backup.git
ls pkpkdupr-backup/backups/
```

### 2. 대상 준비

- 새 Supabase 프로젝트: 마이그레이션을 적용하지 않은 상태로 둡니다. `public` 스키마가 비어 있어야 합니다.
- 기존 프로젝트를 되돌릴 때(마이그레이션이 적용된 로컬 Supabase 스택 포함): 먼저 그 시점 백업을 하나 더 받아 둔 뒤, 로그인 계정과 `public`의 테이블을 지웁니다. 되돌릴 수 없는 작업이므로 대상을 두 번 확인합니다. `public` 스키마 자체는 지우지 않습니다. Supabase가 스키마에 걸어 둔 역할별 권한(`anon`·`authenticated`·`service_role`)이 함께 사라지고, 덤프는 `--no-privileges`라서 복원해도 돌아오지 않기 때문입니다.

  ```sql
  -- players 등 auth.users를 가리키는 public 테이블도 함께 비워진다
  TRUNCATE auth.users CASCADE;
  DO $$
  DECLARE t record;
  BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('DROP TABLE public.%I CASCADE', t.tablename);
    END LOOP;
  END
  $$;
  ```

### 3. 복호화 후 복원 (Auth → public 순서)

```bash
# 대상 DB 접속 문자열(Session pooler 또는 로컬 Supabase)
TARGET_DB_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
DAY=2026-01-01

# 1) 로그인 계정. public의 외래 키가 이 사용자들을 가리키므로 먼저 넣는다
age --decrypt -i pkpkdupr-backup-key.txt "pkpkdupr-backup/backups/${DAY}.auth.sql.gz.age" \
  | gunzip \
  | psql "$TARGET_DB_URL" --set ON_ERROR_STOP=1

# 2) 앱 테이블. 덤프의 public 스키마 생성 구문은 이미 있는 스키마와 충돌하므로 sed로 지운다
age --decrypt -i pkpkdupr-backup-key.txt "pkpkdupr-backup/backups/${DAY}.sql.gz.age" \
  | gunzip \
  | sed -e '/^CREATE SCHEMA public;$/d' -e '/^COMMENT ON SCHEMA public /d' \
  | psql "$TARGET_DB_URL" --set ON_ERROR_STOP=1
```

- `--no-owner --no-privileges`로 덤프했으므로 테이블 소유자는 접속한 사용자가 되고 별도 role 없이 복원됩니다. RLS 활성화(정책 없음)는 그대로 복원됩니다.
- 새 Supabase 프로젝트로 옮기는 경우 복원 뒤 `SUPABASE_DB_URL` secret(두 저장소), 앱의 DB 연결 설정, Auth·Storage 설정을 새 프로젝트 기준으로 바꿉니다. 복원한 계정은 비밀번호 해시째 들어오므로 회원은 같은 비밀번호로 로그인합니다.

### 4. 확인

```bash
psql "$TARGET_DB_URL" -c "SELECT count(*) FROM players"
psql "$TARGET_DB_URL" -c "SELECT count(*) FROM players WHERE auth_user_id IS NOT NULL"
psql "$TARGET_DB_URL" -c "\dt"   # supabase/migrations/의 테이블이 모두 있는지 확인
```

### 복원 시험

로컬 Supabase 스택(`pnpm db:start`, Docker 필요)을 대상으로 합니다. 로컬 DB에는 마이그레이션이 이미 적용돼 있으므로 2단계는 "기존 프로젝트를 되돌릴 때"를 따르고, 이어서 3~4단계를 합니다. 접속 문자열은 `postgresql://postgres:postgres@127.0.0.1:54322/postgres`입니다. 시험 뒤 `pnpm db:reset`으로 로컬 DB를 되돌립니다.

## 주의

- **예약 작업 비활성화**: 공개 저장소(이 저장소)는 60일 동안 저장소 활동이 없으면 GitHub가 예약 workflow를 자동으로 끈다. Actions 탭에 비활성화 안내가 보이면 workflow를 다시 활성화한다. 백업 저장소는 매일 커밋하므로 해당하지 않는다.
- **실패 알림**: workflow가 실패하면 Actions에 실패로 표시된다. GitHub는 예약 workflow 실패 알림을 그 workflow의 cron을 마지막으로 수정한(또는 다시 활성화한) 사용자에게만 보내며, 개인 알림 설정을 따른다. 그 외 운영진은 자동 알림을 받지 않으므로 Actions 탭을 주기적으로 확인한다. 백업이 며칠째 올라오지 않으면 `pkpkdupr-backup`의 `backups/` 최신 파일 날짜를 확인한다.
- **보존 기간**: 30일이 지난 파일은 트리에서 지우지만 git 히스토리에는 남는다(암호화된 상태). 저장소가 커지면 히스토리를 정리한다.
- **복원 시험**: 개인키로 실제 복호화·복원이 되는지 분기마다 한 번 확인한다.

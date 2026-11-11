# pkpkdupr

동호회 안에서만 쓰는 피클볼 경기 기록·랭킹(DUPR 유사 평점) 서비스입니다.

| 화면 | 주소 |
| --- | --- |
| 회원용 web (PWA) | https://kakaopkpk.github.io/pkpkdupr/ |
| 관리자 admin | https://kakaopkpk.github.io/pkpkdupr/admin/ |

## 구성

- **GitHub** (`kakaopkpk` 조직): 소스 코드, GitHub Pages(web·admin 정적 호스팅), GitHub Actions(배포·DB 유지 작업)
- **Supabase** (프로젝트 ref `uvybzkypmbllmpgzmvmr`): Postgres DB, 로그인(Auth), 프로필 이미지(Storage), API(Edge Function `api`)
- 로그인은 관리자가 발급한 아이디·비밀번호만 씁니다. 공개 가입은 막혀 있습니다.
- 모두 무료 플랜입니다. 결제 수단은 등록하지 않습니다.

| 워크플로 | 하는 일 |
| --- | --- |
| `ci.yml` | PR·main push 때 빌드와 테스트 |
| `supabase-deploy.yml` | main push 때 DB 마이그레이션과 API 함수 배포 |
| `pages.yml` | main push 때 web·admin 빌드와 Pages 배포 |
| `db-keepalive.yml` | 3일마다 DB에 접속해 무료 프로젝트 일시정지를 막음 |
| `db-backup.yml` | 매일 암호화 백업. 백업 키를 설정하지 않아 **Actions 탭에서 Disable해 둔 상태**입니다. [docs/backup-restore.md](docs/backup-restore.md)대로 백업 저장소와 키(`BACKUP_DEPLOY_KEY`, `BACKUP_AGE_PUBLIC_KEY`)를 설정한 뒤 Actions → db-backup → **Enable workflow**로 켭니다. |

자세한 문서:

- [docs/deploy.md](docs/deploy.md): Supabase·GitHub 설정값, 첫 관리자 등록, 배포 절차
- [docs/backup-restore.md](docs/backup-restore.md): 일시정지 방지, 백업과 복구
- [docs/dev-environment.md](docs/dev-environment.md): 로컬 개발 환경
- [AGENTS.md](AGENTS.md): 코드 구조와 작업 규칙

## 관리자 이관

운영자가 바뀔 때 할 일입니다. 서비스는 **GitHub 조직**, **Supabase 조직**, **앱 안의 관리자 권한** 세 곳에 운영자가 묶여 있습니다. 세 곳 모두 새 운영자를 추가한 뒤, 정상 동작을 확인하고 나서 이전 운영자를 뺍니다.

> 한 사람에게만 권한이 있으면 그 사람이 연락이 끊겼을 때 서비스를 넘길 방법이 없습니다. GitHub와 Supabase 모두 **오너를 항상 2명 이상** 둡니다. 공용 계정을 만들어 공유하는 것은 GitHub 약관 위반이니 쓰지 않습니다.

### 1. GitHub 조직 (`kakaopkpk`)

1. 조직 **Settings → People → Invite member**로 새 운영자를 초대하고, Role을 **Owner**로 줍니다.
2. 새 운영자가 초대를 수락하면 저장소, Pages, Actions secrets·variables가 모두 그대로 넘어옵니다. 따로 옮길 것은 없습니다.
3. 이전 운영자를 빼는 것은 아래 2~4를 마친 뒤에 합니다.

> **조직이나 저장소를 다른 곳으로 옮기거나 이름을 바꾸면** Pages 주소(`https://<조직>.github.io/<저장소>/`)가 바뀝니다. 그때는 아래 [주소가 바뀔 때](#주소가-바뀔-때)를 함께 처리합니다. 주소가 바뀌면 회원들이 설치한 PWA도 새 주소로 다시 설치해야 하므로, 가능하면 조직과 저장소 이름은 그대로 둡니다.

### 2. Supabase

둘 중 하나를 고릅니다.

- **A. 같은 조직에 멤버 추가 (권장)**: Supabase 대시보드 → 조직 **Settings → Team → Invite**로 새 운영자를 **Owner**로 초대합니다. 프로젝트와 설정은 그대로입니다.
- **B. 프로젝트를 새 운영자의 조직으로 옮기기**: 프로젝트 **Settings → General → Transfer project**. 옮기는 사람이 두 조직 모두의 Owner여야 합니다. 받는 조직이 무료 프로젝트 개수 제한에 걸려 있으면 옮겨지지 않습니다.

어느 쪽이든 project ref와 주소(`https://uvybzkypmbllmpgzmvmr.supabase.co`)는 바뀌지 않습니다. 그래서 앱 설정과 회원 데이터는 그대로입니다.

### 3. 개인에게 묶인 값 교체

GitHub Actions secret 중에는 이전 운영자 개인 계정에 묶인 값이 있습니다. 저장소 **Settings → Secrets and variables → Actions**에서 교체합니다.

| secret | 교체 방법 | 필수 |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | **새 운영자**가 Supabase 대시보드 우측 상단 계정 → **Access Tokens**에서 새 토큰을 만들어 넣습니다. 이전 운영자의 토큰은 그 사람이 Supabase에서 빠지면 더 이상 동작하지 않습니다. | 예 |
| `SUPABASE_DB_PASSWORD` | 이전 운영자가 DB 비밀번호를 알고 있으므로 바꾸는 것을 권장합니다. 프로젝트 **Database → Settings → Reset database password**로 바꾼 뒤 이 값과 아래 `SUPABASE_DB_URL`을 함께 고칩니다. 비밀번호는 영문·숫자만 쓰면 URL이 깨지지 않습니다. | 권장 |
| `SUPABASE_DB_URL` | Session pooler 접속 문자열에 새 비밀번호를 넣은 값입니다. 현재 프로젝트 기준으로는 `postgresql://postgres.uvybzkypmbllmpgzmvmr:<DB 비밀번호>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require`입니다. 호스트는 대시보드 **Connect** 화면에서 확인할 수 있습니다. | DB 비밀번호를 바꿨으면 예 |
| `BACKUP_DEPLOY_KEY` | 백업을 켜 둔 경우에만 해당합니다. [docs/backup-restore.md](docs/backup-restore.md)대로 새로 만듭니다. 백업 복호화 키(age 개인키)도 새 운영자에게 안전하게 넘깁니다. | 백업 사용 시 |

Supabase 함수 secret(`CORS_ALLOWED_ORIGINS` 등)은 프로젝트에 저장되어 있습니다. 그래서 운영자가 바뀌어도 그대로 둡니다.

API 함수는 DB에 접속할 때 Supabase가 자동으로 넣어 주는 접속 주소를 씁니다. 그래서 DB 비밀번호를 바꿔도 함수 쪽은 고칠 것이 없습니다. 다만 함수 secret `DATABASE_URL`을 따로 설정해 두었다면 사정이 다릅니다. 이때는 그 값에도 새 비밀번호를 넣어야 하고, 넣지 않으면 API가 DB에 접속하지 못합니다. 어느 경우든 아래 5의 로그인 확인으로 API의 DB 접속을 함께 점검합니다.

### 4. 앱 관리자 권한

admin 화면에 들어갈 수 있는 사람은 `player_admins` 테이블에 등록된 회원입니다. Supabase 대시보드 **SQL Editor**에서 실행합니다.

```sql
-- 관리자 추가 (해당 회원 계정이 이미 있어야 합니다. 없으면 admin에서 회원 추가부터 합니다)
INSERT INTO player_admins (player_id, created_at)
SELECT id, extract(epoch FROM now())::bigint
FROM players
WHERE lower(username) = lower('<새 관리자 아이디>')
ON CONFLICT (player_id) DO NOTHING;

-- 관리자 제거
DELETE FROM player_admins
WHERE player_id = (SELECT id FROM players WHERE lower(username) = lower('<이전 관리자 아이디>'));
```

관리자가 한 명도 없는 상태에서 처음 만드는 방법은 [docs/deploy.md](docs/deploy.md)의 "5. 첫 관리자 등록"을 따릅니다.

### 5. 확인 후 이전 운영자 제거

1. GitHub **Actions** 탭에서 `supabase-deploy`, `pages`, `db-keepalive`를 각각 **Run workflow**로 한 번씩 실행해 모두 성공하는지 봅니다. 새 토큰과 비밀번호가 제대로 들어갔는지 여기서 확인됩니다.
2. 새 운영자가 web과 admin에 로그인되는지 확인합니다.
3. 이전 운영자를 앱 관리자(위 4), Supabase 조직, GitHub 조직 순서로 뺍니다. 오너가 2명 이상 남는지 확인합니다.

### 주소가 바뀔 때

GitHub 조직이나 저장소 이름이 바뀌어 Pages 주소가 달라졌을 때만 합니다.

1. 함수 secret `CORS_ALLOWED_ORIGINS`를 새 origin(예: `https://<새 조직>.github.io`)으로 바꿉니다. 바꾸지 않으면 web·admin에서 API 호출이 막힙니다.

   ```bash
   pnpm exec supabase secrets set --project-ref uvybzkypmbllmpgzmvmr CORS_ALLOWED_ORIGINS='https://<새 조직>.github.io'
   ```

2. Supabase 대시보드 **Authentication → URL Configuration**에서 Site URL을 새 주소로 바꿉니다. 아이디·비밀번호 로그인은 리다이렉트를 쓰지 않아 Redirect URLs는 비워 둬도 됩니다. 값이 들어 있으면 새 주소로 맞춥니다. 자세한 설명은 [docs/deploy.md](docs/deploy.md)의 "Supabase Auth URL"에 있습니다.
3. 새 저장소 Settings → Pages에서 **Source: GitHub Actions**를 고릅니다. 그리고 Actions variables가 그대로 있는지 확인합니다.
   - `pages.yml` 빌드용: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `supabase-deploy.yml`용: `SUPABASE_PROJECT_REF`

   Pages 경로(`/<저장소>/`)는 `pages.yml`이 저장소 이름에서 자동으로 정합니다.
4. 백업을 쓰고 있다면 `.github/workflows/db-backup.yml`의 `BACKUP_REPO`(`kakaopkpk/pkpkdupr-backup`)를 새 조직의 백업 저장소로 바꿉니다.
5. 이 README와 [docs/deploy.md](docs/deploy.md)에 적힌 주소를 새 주소로 고칩니다.

# pkpkdupr 개발 환경

로컬 개발은 `docker-compose.dev.yml`이 띄우는 Docker MySQL과 Adminer를 사용합니다. 기존 SQLite 파일은 데이터 이관용 원본으로만 유지합니다.

## 실행

```bash
pnpm dev                 # MySQL 준비 후 web/admin/api 실행
pnpm db:migrate          # @pkpkdupr/db 기준 스키마 마이그레이션만 실행
pnpm dev:db              # MySQL만 기동
pnpm dev:db:down         # MySQL 중지
pnpm dev:db-browser      # Adminer 기동 (http://localhost:3301/)
pnpm dev:db-browser:down
```

`pnpm dev`는 다음 환경 변수를 api에 주입합니다. api는 시작 시 스키마를 초기화하고 개발 mock 데이터를 넣습니다.

```text
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=pkpkdupr
DB_USER=pkpkdupr
DB_PASSWORD=<MYSQL_PASSWORD>
ENABLE_DEV_MOCK_DATA=true
```

## 구조

```text
apps/web :8080 ── /api ──> apps/api :4000
                                 │ 함수 호출
                                 ▼
                     packages/db (@pkpkdupr/db)
                                 │ mysql2 + Drizzle
                                 ▼
                         MySQL 9.7 :3306
                                 ▲
                     Adminer :3301 (read-only viewer account)
```

Vite는 `/api`, `/uploads`, `/db`를 각각 API 또는 Adminer 개발 서비스로 프록시합니다.

## Adminer

- 직접 접근: `http://localhost:3301/`
- Vite 경유 접근: `http://localhost:8080/db/`
- 서버는 `mysql`, 데이터베이스는 `pkpkdupr`를 입력합니다.
- 조회에는 `MYSQL_VIEWER_USER` / `MYSQL_VIEWER_PASSWORD`(기본값 `pkpkdupr_viewer` / `change-viewer-me`)를 사용합니다. 이 계정은 `SELECT`, `SHOW VIEW` 권한만 가집니다.
- MySQL 계정 값은 루트 `.env`로 덮어쓸 수 있습니다(`MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `MYSQL_VIEWER_USER`, `MYSQL_VIEWER_PASSWORD`). 미설정이면 `docker-compose.dev.yml`의 기본값을 씁니다.

## SQLite 데이터 이관

이관 명령은 원본 SQLite를 변경하지 않으며 대상 MySQL이 비어 있지 않으면 실패합니다.

```bash
DB_PASSWORD=<MYSQL_PASSWORD> \
SQLITE_SOURCE_URL=file:$PWD/data/db/db.sqlite \
  pnpm db:import-sqlite
```

이관은 선수, 경기, 점수, 참가자, 세션, 승인, 평점 변동·감사 로그를 복사하고 테이블별 행 수와 Unix 초 단위 timestamp를 검증합니다.

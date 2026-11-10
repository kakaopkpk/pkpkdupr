#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source ./.env
  set +a
fi

# 로컬 Supabase 스택(Docker 필요)을 띄운다. 이미 떠 있으면 그대로 둔다.
pnpm exec supabase start
# 스택이 이미 떠 있던 경우에도 새로 추가된 마이그레이션을 적용한다.
pnpm exec supabase migration up --local

# dev mock 데이터를 시딩하므로 .env 값과 무관하게 항상 로컬 Supabase DB에 연결한다.
export ENABLE_DEV_MOCK_DATA=true
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# 아바타 업로드가 로컬 Storage를 쓰도록 로컬 스택의 API 주소와 service role key를 넘긴다.
LOCAL_SUPABASE_ENV="$(pnpm exec supabase status -o env 2>/dev/null || true)"
read_local_supabase_env() {
  printf '%s\n' "${LOCAL_SUPABASE_ENV}" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -n 1
}
export SUPABASE_URL="$(read_local_supabase_env API_URL)"
export SUPABASE_SERVICE_ROLE_KEY="$(read_local_supabase_env SERVICE_ROLE_KEY)"

exec pnpm -r --parallel dev

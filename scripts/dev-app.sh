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

# api가 로컬 스택을 쓰도록 주소와 키를 넘긴다.
# anon key는 Supabase Auth access token 확인에, service role key는 아바타 업로드(로컬 Storage)에 쓴다.
LOCAL_SUPABASE_ENV="$(pnpm exec supabase status -o env 2>/dev/null || true)"
read_local_supabase_env() {
  printf '%s\n' "${LOCAL_SUPABASE_ENV}" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -n 1
}
export SUPABASE_URL="$(read_local_supabase_env API_URL)"
export SUPABASE_ANON_KEY="$(read_local_supabase_env ANON_KEY)"
export SUPABASE_SERVICE_ROLE_KEY="$(read_local_supabase_env SERVICE_ROLE_KEY)"
export ALLOWED_EMAIL_DOMAIN="${ALLOWED_EMAIL_DOMAIN:-kakaocorp.com}"
# web·admin-web(Vite)도 같은 로컬 Supabase Auth로 로그인한다. 브라우저에는 anon key만 넘긴다.
export VITE_SUPABASE_URL="${SUPABASE_URL}"
export VITE_SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}"
export VITE_ALLOWED_EMAIL_DOMAIN="${ALLOWED_EMAIL_DOMAIN}"
# 로컬 전용 값. 운영 QR_TOTP_SECRET은 함수 secret으로 따로 넣는다.
export QR_TOTP_SECRET="${QR_TOTP_SECRET:-local-dev-qr-totp-secret}"

exec pnpm -r --parallel dev

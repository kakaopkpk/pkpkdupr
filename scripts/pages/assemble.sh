#!/usr/bin/env bash
# GitHub Pages 산출물을 만든다: 루트=web, admin/=admin-web, 루트 404.html.
# 사용: PAGES_BASE_PATH=/pkpkdupr/ bash scripts/pages/assemble.sh [출력 디렉터리]
# VITE_API_BASE_URL·VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY는 호출 환경에서 넘긴다.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out_dir="${1:-$repo_root/.pages-dist}"

base_path="${PAGES_BASE_PATH:?PAGES_BASE_PATH가 필요합니다 (예: /pkpkdupr/)}"
base_path="/${base_path#/}"
base_path="${base_path%/}/"

missing=()
for name in VITE_API_BASE_URL VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do
  if [ -z "${!name:-}" ]; then
    missing+=("$name")
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "다음 env가 필요합니다: ${missing[*]}" >&2
  exit 1
fi

cd "$repo_root"
VITE_BASE_PATH="$base_path" pnpm --filter @pkpkdupr/web build
VITE_BASE_PATH="${base_path}admin/" pnpm --filter @pkpkdupr/admin-web build

rm -rf "$out_dir"
mkdir -p "$out_dir/admin"
cp -R apps/web/dist/. "$out_dir/"
cp -R apps/admin-web/dist/. "$out_dir/admin/"
sed "s|__PAGES_BASE_PATH__|${base_path}|g" scripts/pages/404.html > "$out_dir/404.html"

echo "Pages 산출물: $out_dir (base $base_path)"

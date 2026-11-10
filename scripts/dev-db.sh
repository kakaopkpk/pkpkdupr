#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

docker compose -f docker-compose.dev.yml up -d mysql

for _ in $(seq 1 60); do
  if docker compose -f docker-compose.dev.yml exec -T mysql sh -ec \
    'mysqladmin ping -h localhost -uroot -p"${MYSQL_ROOT_PASSWORD}" --silent' >/dev/null 2>&1; then
    echo "✅ 개발 MySQL이 준비되었습니다."
    exit 0
  fi
  sleep 1
done

echo "❌ 개발 MySQL 준비 시간이 초과되었습니다." >&2
exit 1

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ADDR=$(docker compose logs deployer 2>/dev/null | grep REGISTRY_ADDRESS | tail -n1 | awk -F= '{print $2}')
if [[ -z "${ADDR:-}" ]]; then
  echo "Could not find REGISTRY_ADDRESS in deployer logs. Is the deployer container running and did it complete?" >&2
  exit 1
fi

echo "Detected REGISTRY_ADDRESS=$ADDR"
echo "Recreating backend and frontend with this env..."

REGISTRY_ADDRESS=$ADDR docker compose up -d --no-deps --build backend frontend

echo "Done. Frontend: http://localhost:3000  Backend: http://localhost:4000"

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${VERIFIER_PRIVATE_KEY:-}" ]]; then
  echo "Usage: VERIFIER_PRIVATE_KEY=<hex> ./bin/set-verifier.sh [VERIFIER_PUBLIC]" >&2
  exit 1
fi

PUB="${1:-}"
if [[ -z "$PUB" ]]; then
  # Derive public address via node + ethers in the root container context
  PUB=$(docker compose run --rm backend sh -lc "node -e 'const {Wallet}=require(\"ethers\"); const pk=process.env.VERIFIER_PRIVATE_KEY; console.log(new Wallet(pk).address);'" | tr -d '\r')
fi

echo "Whitelisting verifier $PUB and restarting backend with provided key..."
VERIFIER_PUBLIC=$PUB docker compose up -d --no-deps --build deployer

REG=$(docker compose logs deployer | grep REGISTRY_ADDRESS | tail -n1 | awk -F= '{print $2}')
REGISTRY_ADDRESS=$REG VERIFIER_PRIVATE_KEY=$VERIFIER_PRIVATE_KEY docker compose up -d --no-deps --build backend

echo "Done. REGISTRY_ADDRESS=$REG"

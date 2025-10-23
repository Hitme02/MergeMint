#!/usr/bin/env bash
# Minimal helper to compile and run Hardhat tests locally.
# Usage:
#   ./scripts/verify-local.sh

set -euo pipefail

echo "Compiling contracts..."
npx hardhat compile

echo "Running tests..."
npx hardhat test

echo "All good ✅"

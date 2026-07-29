#!/usr/bin/env bash
# One-shot Local Mail core token-store smoke (sqlite + optional keychain)
set -euo pipefail

CORE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$CORE_DIR"

# Prefer nvm Node 22 if available
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null || nvm use 22.23.1 >/dev/null || true
fi

echo "node: $(node -v 2>/dev/null || echo missing)"
echo "cwd:  $CORE_DIR"

echo "→ npm install"
npm install

echo "→ npm run typecheck"
npm run typecheck
TYPECHECK_STATUS=$?

echo "→ token-store smoke (tsx)"
npx tsx scripts/token-store-smoke.ts
SMOKE_STATUS=$?

echo
echo "=== Final ==="
if [[ $TYPECHECK_STATUS -eq 0 ]]; then
  echo "typecheck: PASS"
else
  echo "typecheck: FAIL"
fi
if [[ $SMOKE_STATUS -eq 0 ]]; then
  echo "smoke driver: PASS (see sqlite/keychain lines above)"
else
  echo "smoke driver: FAIL"
fi

exit $(( TYPECHECK_STATUS != 0 || SMOKE_STATUS != 0 ? 1 : 0 ))

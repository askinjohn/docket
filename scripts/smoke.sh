#!/usr/bin/env bash
# Local Mail smoke checks (core must be running)
set -euo pipefail
BASE="${LOCAL_MAIL_CORE_URL:-http://127.0.0.1:8787}"

echo "→ GET $BASE/health"
curl -sf "$BASE/health" | head -c 400
echo
echo "→ GET $BASE/auth/status"
curl -sf "$BASE/auth/status"
echo
echo "→ GET $BASE/mcp/tools"
curl -sf "$BASE/mcp/tools" | head -c 300
echo
echo "OK smoke"

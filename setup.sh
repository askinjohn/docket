#!/usr/bin/env bash
# Interactive setup wizard (optional).
# Prefer one-command: ./up.sh
# This script only configures; use ./up.sh or ./start.sh to run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

NONINTERACTIVE=0
[[ "${1:-}" == "--yes" || "${1:-}" == "-y" || "${LOCAL_MAIL_NONINTERACTIVE:-}" == "1" ]] && NONINTERACTIVE=1

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           Local Mail — setup                     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "For zero prompts, run instead:"
echo "  ./up.sh"
echo ""

if [[ "$NONINTERACTIVE" -eq 1 ]]; then
  exec bash "$ROOT/up.sh" --no-open
fi

ask_yn() {
  local prompt="$1"
  local default="${2:-y}"
  local reply
  if [[ "$default" == "y" ]]; then
    read -r -p "$prompt [Y/n]: " reply || true
    reply=${reply:-y}
  else
    read -r -p "$prompt [y/N]: " reply || true
    reply=${reply:-n}
  fi
  [[ "$reply" =~ ^[Yy]$ ]]
}

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  [[ -f "$ROOT/.nvmrc" ]] && nvm use || nvm use 22 2>/dev/null || true
fi

command -v node >/dev/null || { echo "Need Node ≥ 22"; exit 1; }
command -v npm >/dev/null || { echo "Need npm"; exit 1; }

echo "📥 Installing packages…"
npm --prefix apps/web install
npm --prefix apps/core install
npm --prefix apps/desktop install

CORE_ENV="apps/core/.env"
if [[ ! -f "$CORE_ENV" ]]; then
  cp apps/core/.env.example "$CORE_ENV" 2>/dev/null || true
  [[ -f "$CORE_ENV" ]] || cat >"$CORE_ENV" <<'EOF'
LOCAL_MAIL_CORE_HOST=127.0.0.1
LOCAL_MAIL_CORE_PORT=8787
LOCAL_MAIL_WEB_ORIGIN=http://127.0.0.1:4300
LOCAL_MAIL_TOKEN_STORE=sqlite
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://127.0.0.1:8787/auth/gmail/callback
EOF
fi

echo ""
echo "OAuth (optional now — can edit apps/core/.env later):"
read -r -p "Google CLIENT ID: " client_id || true
read -r -p "Google CLIENT SECRET: " client_secret || true
if [[ -n "${client_id}" ]]; then
  awk -v v="$client_id" '
    BEGIN{d=0} /^GOOGLE_CLIENT_ID=/ {print "GOOGLE_CLIENT_ID=" v; d=1; next} {print}
    END{if(!d) print "GOOGLE_CLIENT_ID=" v}
  ' "$CORE_ENV" >"$CORE_ENV.tmp" && mv "$CORE_ENV.tmp" "$CORE_ENV"
fi
if [[ -n "${client_secret}" ]]; then
  awk -v v="$client_secret" '
    BEGIN{d=0} /^GOOGLE_CLIENT_SECRET=/ {print "GOOGLE_CLIENT_SECRET=" v; d=1; next} {print}
    END{if(!d) print "GOOGLE_CLIENT_SECRET=" v}
  ' "$CORE_ENV" >"$CORE_ENV.tmp" && mv "$CORE_ENV.tmp" "$CORE_ENV"
fi

if ask_yn "Use Keychain for OAuth tokens (Mac)?" "n"; then
  npm --prefix apps/core install keytar 2>/dev/null || true
  awk '
    BEGIN{d=0} /^LOCAL_MAIL_TOKEN_STORE=/ {print "LOCAL_MAIL_TOKEN_STORE=keychain"; d=1; next} {print}
    END{if(!d) print "LOCAL_MAIL_TOKEN_STORE=keychain"}
  ' "$CORE_ENV" >"$CORE_ENV.tmp" && mv "$CORE_ENV.tmp" "$CORE_ENV"
fi

echo ""
echo "✅ Setup done. Start with:"
echo "  ./up.sh"
echo "  ./up.sh --desktop"
echo ""
if ask_yn "Start Local Mail now?" "y"; then
  exec bash "$ROOT/up.sh"
fi

#!/usr/bin/env bash
# Local Mail — one command after clone:
#   ./up.sh
# Installs deps (if needed), ensures .env exists, starts core + UI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="${LOCAL_MAIL_UI:-browser}" # browser | desktop
OPEN_BROWSER=1
FORCE_INSTALL=0

for arg in "$@"; do
  case "$arg" in
    --desktop|-d) MODE="desktop" ;;
    --browser|-b) MODE="browser" ;;
    --no-open) OPEN_BROWSER=0 ;;
    --reinstall) FORCE_INSTALL=1 ;;
    --help|-h)
      cat <<'EOF'
Local Mail — one-shot install + run

  ./up.sh                 Install (if needed) + core + browser UI
  ./up.sh --desktop       Same, but Tauri Dock window
  ./up.sh --reinstall     Force npm install again
  ./up.sh --no-open       Don't open the browser

Optional env before running:
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ./up.sh
  LOCAL_MAIL_TOKEN_STORE=keychain ./up.sh

After start: open Connect Gmail in the app (or add OAuth keys to apps/core/.env).
EOF
      exit 0
      ;;
  esac
done

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  if [[ -f "$ROOT/.nvmrc" ]]; then
    nvm install >/dev/null 2>&1 || true
    nvm use >/dev/null 2>&1 || true
  else
    nvm use 22 >/dev/null 2>&1 || true
  fi
fi

die() { echo "❌ $*" >&2; exit 1; }

command -v node >/dev/null || die "Node.js required (https://nodejs.org or nvm). Need Node ≥ 22."
command -v npm >/dev/null || die "npm required (comes with Node)."

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
[[ "$NODE_MAJOR" -ge 22 ]] || die "Node $(node -v) is too old. Use Node ≥ 22 (nvm install 22 && nvm use 22)."

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     Local Mail — one-command install & run       ║"
echo "╚══════════════════════════════════════════════════╝"
echo "Node $(node -v) · mode=$MODE"
echo ""

# ── Install (skip if already done) ───────────────────────────────────
need_install=0
[[ "$FORCE_INSTALL" -eq 1 ]] && need_install=1
[[ ! -d apps/web/node_modules ]] && need_install=1
[[ ! -d apps/core/node_modules ]] && need_install=1
[[ ! -d apps/desktop/node_modules ]] && need_install=1

if [[ "$need_install" -eq 1 ]]; then
  echo "📥 Installing dependencies (first run can take a few minutes)…"
  npm --prefix apps/web install
  npm --prefix apps/core install
  npm --prefix apps/desktop install
  echo "✅ Packages installed"
else
  echo "✅ Dependencies already present (use --reinstall to refresh)"
fi

# ── .env (never overwrite secrets) ───────────────────────────────────
CORE_ENV="apps/core/.env"

# Set or replace a KEY=value line in .env
env_set() {
  local key="$1"
  local val="$2"
  local file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    awk -v k="$key" -v v="$val" '
      BEGIN { d=0 }
      index($0, k "=") == 1 { print k "=" v; d=1; next }
      { print }
      END { if (!d) print k "=" v }
    ' "$file" >"${file}.tmp" && mv "${file}.tmp" "$file"
  else
    echo "${key}=${val}" >>"$file"
  fi
}

env_get() {
  local key="$1"
  local file="$2"
  local line
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -1 || true)"
  echo "${line#${key}=}"
}

if [[ ! -f "$CORE_ENV" ]]; then
  echo "📝 Creating apps/core/.env from template…"
  if [[ -f apps/core/.env.example ]]; then
    cp apps/core/.env.example "$CORE_ENV"
  else
    cat >"$CORE_ENV" <<'EOF'
LOCAL_MAIL_CORE_HOST=127.0.0.1
LOCAL_MAIL_CORE_PORT=8787
LOCAL_MAIL_WEB_ORIGIN=http://127.0.0.1:4300
LOCAL_MAIL_TOKEN_STORE=sqlite
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://127.0.0.1:8787/auth/gmail/callback
EOF
  fi
  echo "✅ Wrote $CORE_ENV"
else
  echo "✅ Using existing $CORE_ENV"
fi

# Env vars override file (CI / power users)
[[ -n "${GOOGLE_CLIENT_ID:-}" ]] && env_set GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID" "$CORE_ENV"
[[ -n "${GOOGLE_CLIENT_SECRET:-}" ]] && env_set GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET" "$CORE_ENV"
[[ -n "${LOCAL_MAIL_TOKEN_STORE:-}" ]] && env_set LOCAL_MAIL_TOKEN_STORE "$LOCAL_MAIL_TOKEN_STORE" "$CORE_ENV"

# Ensure redirect URI is set
if [[ -z "$(env_get GOOGLE_REDIRECT_URI "$CORE_ENV")" ]]; then
  env_set GOOGLE_REDIRECT_URI "http://127.0.0.1:8787/auth/gmail/callback" "$CORE_ENV"
fi

# ── Prompt for OAuth if missing (interactive terminal) ───────────────
CURRENT_ID="$(env_get GOOGLE_CLIENT_ID "$CORE_ENV")"
CURRENT_SECRET="$(env_get GOOGLE_CLIENT_SECRET "$CORE_ENV")"

if [[ -z "$CURRENT_ID" || -z "$CURRENT_SECRET" ]]; then
  if [[ -t 0 ]]; then
    echo ""
    echo "══════════════════════════════════════════════════"
    echo "🔐 Google OAuth (required for Connect Gmail)"
    echo "══════════════════════════════════════════════════"
    echo "Create an OAuth client in Google Cloud Console:"
    echo "  https://console.cloud.google.com/apis/credentials"
    echo "  Type: Desktop app (or Web) · enable Gmail API"
    echo "  Redirect URI must be exactly:"
    echo "    http://127.0.0.1:8787/auth/gmail/callback"
    echo "  Details: docs/GMAIL_SETUP.md"
    echo ""
    if [[ -z "$CURRENT_ID" ]]; then
      read -r -p "Paste GOOGLE_CLIENT_ID: " CURRENT_ID || true
    else
      echo "CLIENT_ID already set (leaving as-is)."
    fi
    if [[ -z "$CURRENT_SECRET" ]]; then
      # -s hides secret as you type
      read -r -s -p "Paste GOOGLE_CLIENT_SECRET: " CURRENT_SECRET || true
      echo ""
    else
      echo "CLIENT_SECRET already set (leaving as-is)."
    fi
    [[ -n "${CURRENT_ID:-}" ]] && env_set GOOGLE_CLIENT_ID "$CURRENT_ID" "$CORE_ENV"
    [[ -n "${CURRENT_SECRET:-}" ]] && env_set GOOGLE_CLIENT_SECRET "$CURRENT_SECRET" "$CORE_ENV"
    echo "✅ Saved OAuth credentials to $CORE_ENV"
  else
    echo ""
    echo "⚠️  No TTY — cannot prompt for OAuth. Set in apps/core/.env or:"
    echo "   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… ./up.sh"
    echo ""
  fi
else
  echo "✅ Google OAuth credentials present in .env"
fi

# Optional token store prompt on first interactive run if still default empty store preference
if [[ -t 0 ]] && [[ -z "${LOCAL_MAIL_TOKEN_STORE:-}" ]]; then
  STORE="$(env_get LOCAL_MAIL_TOKEN_STORE "$CORE_ENV")"
  if [[ -z "$STORE" || "$STORE" == "sqlite" ]]; then
    # Only ask once-ish: if sqlite and interactive, offer keychain on Mac
    if [[ "$(uname -s)" == "Darwin" ]]; then
      read -r -p "Store OAuth tokens in macOS Keychain? [y/N]: " want_kc || true
      if [[ "${want_kc:-n}" =~ ^[Yy]$ ]]; then
        env_set LOCAL_MAIL_TOKEN_STORE keychain "$CORE_ENV"
        echo "🔐 Installing keytar…"
        npm --prefix apps/core install keytar 2>/dev/null || {
          echo "⚠️  keytar failed — keeping sqlite"
          env_set LOCAL_MAIL_TOKEN_STORE sqlite "$CORE_ENV"
        }
      fi
    fi
  fi
fi

# Install keytar if .env already says keychain
if grep -q '^LOCAL_MAIL_TOKEN_STORE=keychain' "$CORE_ENV" 2>/dev/null; then
  if [[ ! -d apps/core/node_modules/keytar ]]; then
    echo "🔐 Installing keytar for Keychain token store…"
    npm --prefix apps/core install keytar 2>/dev/null || {
      echo "⚠️  keytar failed — set LOCAL_MAIL_TOKEN_STORE=sqlite if Connect fails"
    }
  fi
fi

FINAL_ID="$(env_get GOOGLE_CLIENT_ID "$CORE_ENV")"
FINAL_SECRET="$(env_get GOOGLE_CLIENT_SECRET "$CORE_ENV")"
if [[ -z "$FINAL_ID" || -z "$FINAL_SECRET" ]]; then
  echo ""
  echo "⚠️  OAuth still incomplete — app will start, but Connect Gmail needs keys in apps/core/.env"
  echo ""
fi

# ── Run via start.sh ─────────────────────────────────────────────────
chmod +x "$ROOT/start.sh" 2>/dev/null || true
ARGS=()
if [[ "$MODE" == "desktop" ]]; then
  ARGS+=(--desktop)
else
  ARGS+=(--browser)
fi
[[ "$OPEN_BROWSER" -eq 0 ]] && ARGS+=(--no-open)

echo "▶ Starting Local Mail…"
exec bash "$ROOT/start.sh" "${ARGS[@]}"

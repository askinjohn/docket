#!/usr/bin/env bash
# Build Docket.app (core inside the bundle) and open it.
#   ./app.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

SKIP_BUILD=0
FORCE_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --open-only|--skip-build) SKIP_BUILD=1 ;;
    --reinstall) FORCE_INSTALL=1 ;;
    --help|-h)
      cat <<'EOF'
Docket — build the Mac app and open it

  ./app.sh              Install deps if needed, tauri build, open Docket.app
  ./app.sh --open-only  Open an already-built .app (no rebuild)
  ./app.sh --reinstall  npm install, then build and open

The .app starts core on 127.0.0.1:8787. OAuth: apps/core/.env or ~/.docket/.env
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

command -v node >/dev/null || die "Node.js required (nvm). Need Node ≥ 22."
command -v npm >/dev/null || die "npm required."
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
[[ "$NODE_MAJOR" -ge 22 ]] || die "Node $(node -v) is too old. nvm install 22 && nvm use 22"

APP="$ROOT/apps/desktop/src-tauri/target/release/bundle/macos/Docket.app"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  command -v rustc >/dev/null || die "Rust required for the Dock app (https://rustup.rs)."
  command -v cargo >/dev/null || die "cargo required (install Rust via rustup)."

  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║     Docket — build Mac app & open                ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo "Node $(node -v) · rustc $(rustc --version 2>/dev/null | awk '{print $2}')"
  echo ""

  need_install=0
  [[ "$FORCE_INSTALL" -eq 1 ]] && need_install=1
  [[ ! -d apps/web/node_modules ]] && need_install=1
  [[ ! -d apps/core/node_modules ]] && need_install=1
  [[ ! -d apps/desktop/node_modules ]] && need_install=1

  if [[ "$need_install" -eq 1 ]]; then
    echo "📥 Installing dependencies…"
    npm --prefix apps/web install
    npm --prefix apps/core install
    npm --prefix apps/desktop install
    echo "✅ Packages installed"
  else
    echo "✅ Dependencies already present"
  fi

  CORE_ENV="apps/core/.env"
  if [[ ! -f "$CORE_ENV" ]]; then
    if [[ -f apps/core/.env.example ]]; then
      cp apps/core/.env.example "$CORE_ENV"
      echo "📝 Wrote $CORE_ENV from example — add GOOGLE_CLIENT_ID / SECRET for Gmail"
    fi
  fi

  echo "▶ Building Docket.app (web + staged core + Tauri)…"
  echo "   This can take several minutes the first time."
  npm --prefix apps/desktop run build
  echo "✅ Build finished"
else
  [[ -d "$APP" ]] || die "No app at $APP — run ./app.sh without --open-only"
fi

[[ -d "$APP" ]] || die "Build succeeded but $APP is missing"

if command -v xattr >/dev/null; then
  xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
fi

echo "▶ Opening $APP"
open "$APP"
echo ""
echo "Docket.app starts core on http://127.0.0.1:8787 if needed."
echo "Logs: ~/.docket/core.log"
echo "Health: http://127.0.0.1:8787/health"

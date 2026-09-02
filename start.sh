#!/usr/bin/env bash
# Start Docket: ensure core on :8787, then browser UI or Tauri Dock.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="browser"
OPEN_BROWSER=1
for arg in "$@"; do
  case "$arg" in
    --desktop|-d) MODE="desktop" ;;
    --browser|-b) MODE="browser" ;;
    --no-open) OPEN_BROWSER=0 ;;
    --help|-h)
      echo "Usage: ./start.sh [--browser|--desktop] [--no-open]"
      echo "  --browser   Core + Angular on :4300 (default)"
      echo "  --desktop   Core + Tauri Dock (tauri dev)"
      echo "  --no-open   Don't open browser automatically"
      exit 0
      ;;
  esac
done

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  [[ -f "$ROOT/.nvmrc" ]] && nvm use >/dev/null 2>&1 || nvm use 22 >/dev/null 2>&1 || true
fi

if [[ ! -f "$ROOT/apps/core/.env" ]]; then
  echo "❌ apps/core/.env missing. Run ./setup.sh first."
  exit 1
fi

cleanup() {
  echo ""
  echo "Stopping Docket…"
  if [[ -n "${CORE_PID:-}" ]] && kill -0 "$CORE_PID" 2>/dev/null; then
    kill "$CORE_PID" 2>/dev/null || true
    wait "$CORE_PID" 2>/dev/null || true
  fi
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  # desktop:dev is foreground; no WEB_PID
}
trap cleanup EXIT INT TERM

core_up() {
  curl -sf http://127.0.0.1:8787/health >/dev/null 2>&1
}

echo "▶ Docket ($MODE)"

# ── Core ─────────────────────────────────────────────────────────────
if core_up; then
  echo "✅ Core already on http://127.0.0.1:8787"
else
  echo "▶ Starting core…"
  npm --prefix apps/core run start &
  CORE_PID=$!
  for _ in $(seq 1 60); do
    if core_up; then
      echo "✅ Core ready"
      break
    fi
    if ! kill -0 "$CORE_PID" 2>/dev/null; then
      echo "❌ Core exited early"
      exit 1
    fi
    sleep 0.25
  done
  if ! core_up; then
    echo "❌ Core did not become healthy on :8787"
    exit 1
  fi
fi

# ── UI ───────────────────────────────────────────────────────────────
if [[ "$MODE" == "desktop" ]]; then
  echo "▶ Starting Dock shell (tauri dev)…"
  echo "   (starts Angular on :4300 if needed)"
  npm --prefix apps/desktop run dev
  # when tauri exits, trap cleans core if we started it
else
  echo "▶ Starting web UI on http://127.0.0.1:4300 …"
  npm --prefix apps/web start -- --host 127.0.0.1 --port 4300 &
  WEB_PID=$!
  for _ in $(seq 1 80); do
    if curl -sf http://127.0.0.1:4300 >/dev/null 2>&1; then
      echo "✅ UI ready"
      break
    fi
    sleep 0.25
  done
  if [[ "$OPEN_BROWSER" -eq 1 ]]; then
    if command -v open >/dev/null 2>&1; then
      open "http://127.0.0.1:4300"
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "http://127.0.0.1:4300"
    fi
  fi
  echo ""
  echo "Docket running:"
  echo "  UI   http://127.0.0.1:4300"
  echo "  Core http://127.0.0.1:8787/health"
  echo "Press Ctrl+C to stop."
  wait "$WEB_PID"
fi

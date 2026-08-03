#!/usr/bin/env bash
# Install a user LaunchAgent that runs Local Mail daily summary each morning.
# Requires: core dependencies installed; Gmail already connected at least once.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$ROOT/apps/core"
LABEL="dev.localmail.daily-summary"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/.local-mail/logs"
mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

NODE="$(command -v node)"
NPX="$(command -v npx)"
if [[ -z "$NODE" || -z "$NPX" ]]; then
  echo "node/npx not found in PATH" >&2
  exit 1
fi

# Resolve tsx via core package
TSX="$CORE/node_modules/.bin/tsx"
if [[ ! -x "$TSX" ]]; then
  echo "Installing core deps…"
  npm --prefix "$CORE" install
fi

RUNNER="$ROOT/scripts/run-daily-summary.mjs"
chmod +x "$RUNNER"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE}</string>
    <string>${RUNNER}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>15</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/daily-summary.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/daily-summary.err</string>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed ${PLIST}"
echo "Runs daily at 08:15 — log: ${LOG_DIR}/daily-summary.log"
echo "Unload: launchctl bootout gui/\$(id -u)/${LABEL}"

#!/usr/bin/env bash
# Copy apps/core (no secrets) into src-tauri/resources/core for the .app bundle.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CORE="$(cd "$HERE/../../core" && pwd)"
DEST="$HERE/resources/core"
rm -rf "$DEST"
mkdir -p "$DEST"
if [[ ! -d "$CORE/node_modules" ]]; then
  echo "▶ Installing apps/core deps for bundle…"
  npm --prefix "$CORE" install
fi
rsync -a \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'memory-bank' \
  --exclude '*.test.ts' \
  --exclude '*.spec.ts' \
  "$CORE/src" \
  "$CORE/package.json" \
  "$CORE/package-lock.json" \
  "$CORE/tsconfig.json" \
  "$CORE/node_modules" \
  "$DEST/"
echo "✅ Staged core at $DEST"

# 2026-09-11 — Packaged .app starts core

## What changed

`tauri build` stages `apps/core` (no `.env`) into `src-tauri/resources/core`. The Dock app spawns Node+tsx on `127.0.0.1:8787` if the port is free. Finder launches still find nvm/Homebrew Node. `DOCKET_ENV_FILE` / `~/.docket/.env` / repo `apps/core/.env` for OAuth.

## Key files

- `src-tauri/src/lib.rs`
- `src-tauri/stage-core.sh`
- `src-tauri/tauri.conf.json`
- `apps/core/src/config.ts`

## Follow-ups

- Unsigned Gatekeeper
- Embed Node so a foreign Mac does not need nvm

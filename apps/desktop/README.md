# Local Mail — Desktop (Tauri)

Mac Dock app shell. Embeds the **Angular** UI and starts the **local core** (Gmail/SQLite API on `127.0.0.1:8787`) when needed.

## Prerequisites

- Node.js ≥ 22.22.3 (`nvm use` from repo root)
- Rust (`rustup`) — [https://rustup.rs](https://rustup.rs)
- Xcode CLT on macOS (`xcode-select --install`)
- `apps/web` and `apps/core` dependencies installed

```bash
cd ../..
npm run install:all
cd apps/desktop && npm install
```

## Dev (Dock window + hot reload UI)

```bash
# From repo root
npm run desktop:dev

# Or
cd apps/desktop && npm run dev
```

This will:

1. Start Angular on `http://127.0.0.1:4200` (if not already)
2. Open a **Local Mail** native window loading that UI
3. Spawn `apps/core` if port **8787** is free

**Tip:** If something already uses port 4200 or 8787, stop the old process first, or leave core running — Tauri reuses an existing core.

## Production build (`.app`)

```bash
npm run desktop:build
# artifact under apps/desktop/src-tauri/target/release/bundle/
```

## Architecture

```
Tauri window (webview)
    → Angular UI (dev: :4200 / prod: bundled dist)
    → http://127.0.0.1:8787 core (sidecar process)
         → SQLite ~/.local-mail
         → Gmail API
```

Browser-only workflow remains supported via `npm run web:start` + `npm run core:dev`.

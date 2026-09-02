# 2026-09-02 — Rename to Docket (desktop)

## What changed

Tauri product is **Docket**.

- `productName` / window title: Docket
- Bundle identifier: `dev.docket.app` (macOS treats this as a new app — re-grant notifications)
- Crate: `docket` / lib `docket_lib`
- npm: `@docket/desktop`
- Sidecar still sets core host/port; env names are `DOCKET_*`

## Key files

- `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Info.plist`
- `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`

## Follow-ups

- Unsigned local `.app` will be `Docket.app`
- Notification permission under System Settings is now “Docket”

# 2026-08-18 — Sign-in gate + correspondence-desk UI

## What changed

- Full-screen **Sign in again** gate when Gmail auth is expired. Cached threads are cleared and not shown.
- Bootstrap probes `/sync` *before* loading the inbox so stale mail cannot flash.
- Visual pass: warm paper/ink tokens, IBM Plex Sans + Fraunces, copper accent, denser list with a selected-row rule.

## Why

Expired sessions still looked “live,” and the light theme read as a generic admin table rather than a mail client.

## Key files

- `src/app/shell/auth-gate.ts`, `src/app/app.ts`
- `src/app/core/ui-shell.service.ts`, `src/app/core/mail-api.service.ts`, `src/app/core/theme.ts`
- `src/styles.css`, `src/index.html`
- `src/app/shell/sidebar.ts`, `src/app/shell/thread-list.ts`, `src/app/shell/reading-pane.ts`

## Follow-ups

- Restart **core** after pull (desktop reuses `127.0.0.1:8787` if it is already up)
- Existing `localStorage` theme accents stay as-is; new installs default to copper + compact

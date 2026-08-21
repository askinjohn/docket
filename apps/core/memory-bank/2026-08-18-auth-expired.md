# 2026-08-18 — Expired Gmail session must block mail

## What changed

When Google returns `invalid_grant` (refresh token expired or revoked), core now:

- Marks the account `auth_status = 'expired'`
- Deletes stored tokens so background sync stops retrying
- Emits SSE `auth.expired`
- Reports `connected: false` + `authExpired: true` on `/health` and `/auth/status`
- Returns an empty thread list (401 on Gmail-backed routes)

History sync no longer falls back to a full pull on auth errors.

## Why

The UI was still treating “account row exists” as connected and serving the SQLite cache, so a revoked token looked like a working inbox.

## Key files

- `src/db/schema.ts`, `src/db/index.ts`, `src/db/accounts.ts`
- `src/gmail/oauth.ts`, `src/gmail/sync.ts`
- `src/routes/api.ts`, `src/events/bus.ts`

## Follow-ups

- Rotate the leaked refresh token if it appeared in logs
- Optional: periodic token probe even when the UI is idle

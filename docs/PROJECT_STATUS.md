# Project status

**Phase:** 1 — Core + Gmail · **Shell: Tauri Dock app**  
**As of:** 2026-07-20  

## Done

- Phase 0 shell + planning
- Core: Hono on `127.0.0.1:8787`, SQLite, Gmail OAuth/sync/archive/reply
- Web: talks to core, Connect Gmail, Sync, live/demo modes
- **Tauri 2** `apps/desktop` — native window, starts/reuses core
- `docs/GMAIL_SETUP.md`

## In progress

- User Google Cloud OAuth setup
- Hardening: HTML sandbox, attachments download, history sync

## Blocked / needs human

| Item | Why |
|------|-----|
| Google Cloud OAuth client | Your account — follow GMAIL_SETUP.md |
| Display name / branding | Optional product choice |

## How to run

```bash
# recommended — Dock window
npm run desktop:dev

# or browser fallback
npm run core:dev   # terminal 1
npm run web:start  # terminal 2
```

- Dock: **Local Mail** window  
- Browser UI: http://127.0.0.1:4300  
- Health: http://127.0.0.1:8787/health

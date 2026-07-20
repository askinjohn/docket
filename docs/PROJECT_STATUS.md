# Project status

**Phase:** 1 — Core + Gmail (code ready; OAuth credentials needed)  
**As of:** 2026-07-20  

## Done

- Phase 0 shell + planning
- Core: Hono on `127.0.0.1:8787`, SQLite, Gmail OAuth/sync/archive/reply
- Web: talks to core, Connect Gmail, Sync, live/demo modes
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
# core
cd apps/core && npm run dev

# ui
cd apps/web && npm start
```

- UI: http://127.0.0.1:4200  
- Health: http://127.0.0.1:8787/health

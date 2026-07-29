# Project status

**Phase:** Dogfood / polish (Phase 1 mail path done; Phase 2–6 pieces shipped early)  
**As of:** 2026-07-29  

## Done

- Phase 0 shell + planning
- Core: Hono on `127.0.0.1:8787`, SQLite, Gmail OAuth/sync/archive/reply/send, multi-account
- Web: full 3-pane client against core (Connect, Sync, search, multi-select, compose)
- **Tauri 2** `apps/desktop` — native window, starts/reuses core, Dock badge, native notifications
- AI summarize/draft (template | Ollama | OpenAI), daily notes summary
- MCP-style tools over HTTP, SSE `/events`
- Optimistic archive + undo, Cmd+K palette, theme/density/accent
- UI modularized: shell components under `apps/web/src/app/shell/`
- `docs/GMAIL_SETUP.md`

## In progress

- Superhuman-ish UX completeness (more hotkeys, labels/views, palette fuzzy)
- HTML sanitizer / remote-image toggle
- Packaging polish (notarized `.app`)

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

## Web UI map (after eng-debt split)

| Path | Role |
|------|------|
| `apps/web/src/app/app.ts` | Root layout, bootstrap, global hotkeys |
| `apps/web/src/app/shell/*` | Sidebar, thread list, reading pane, compose, palette, settings |
| `apps/web/src/app/core/ui-shell.service.ts` | Shell orchestration / Gmail UI state |
| `apps/web/src/app/core/message-display.ts` | Pure message presentation helpers |
| `apps/web/src/app/shell/shell-hotkeys.ts` | Keyboard map (unit-tested) |

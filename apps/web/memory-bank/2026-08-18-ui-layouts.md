# 2026-08-18 — List-first / split layouts

## What changed

Customers pick a shell layout in Settings → Appearance → Layout.

- **List first** (default) — full inbox list. Click a thread to read it. ← Inbox / Esc returns to the list.
- **Split** — list stays on the side (classic 3-pane).

Ask AI is a drawer overlay (sidebar / reading “Ask AI”), not a permanent column, so it no longer collides with the reply bar. Reading pane is left-aligned (no centered letter cards). Opening a thread no longer auto-opens the reply composer.

Old prefs: `classic` → split, `mail` → list.

Keyboard: `↓`/`↑` (also `j`/`k`) move a list highlight. `Enter`/`→` opens. `e` archives the highlight and lands on the next row so `e e e` zeros the inbox. `←`/`Esc` back to the list.

## Key files

- `src/app/core/theme.ts` (`UiLayout` `list` | `split`)
- `src/app/core/ui-shell.service.ts` (`showThreadList`, `backToList`)
- `src/app/app.ts`, `src/app/shell/thread-list.ts`, `src/app/shell/reading-pane.ts`, `src/app/shell/context-rail.ts`


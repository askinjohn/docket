# 2026-09-02 — Rename to Docket (web)

## What changed

Shell chrome, document title, notifications, and auth copy say **Docket**. Sidebar mark is **D**.

Browser prefs write `docket.*` keys and still read legacy `local-mail.*` (`theme`, sidebar collapse, recent opens).

## Key files

- `src/index.html`
- `src/app/shell/sidebar.ts`, `auth-gate.ts`, `settings-dialog.ts`
- `src/app/core/ui-shell.service.ts`, `notify.ts`, `theme.ts`, `pref-storage.ts`

## Follow-ups

- Theme/layout prefs from a previous Local Mail session should load without reset

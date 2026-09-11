# 2026-09-02 — New-mail toast only when the window is in front

## What changed

In-app “New mail” toast waits until `document.visibilityState === 'visible'`. Hidden Dock window queues notices and flushes when you come back. Settings copy matches.

Settings → Test notification still sends a system banner.

## Key files

- `src/app/core/ui-shell.service.ts`
- `src/app/shell/settings-dialog.ts`

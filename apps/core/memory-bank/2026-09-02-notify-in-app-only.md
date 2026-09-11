# 2026-09-02 — New-mail OS notify off

## What changed

Background sync no longer fires macOS `osascript` banners for new mail. Core still polls every 30s and publishes `mail.new`. The UI shows an in-app toast only while the window is in front.

Workflow `notify` actions can still use OS banners.

## Key files

- `src/sync/background.ts`
- `src/config.ts`

## Follow-ups

- Restart core to pick this up

# 2026-08-19 — Workflow engine

## What changed

Approved mail workflows in `~/.local-mail/workflows.json`.

- Triggers: `mail.received` (SSE `mail.new`), `manual`, `cron` (local 5-field, catch-up if the Mac slept)
- Catalog matchers + judges (`urgent`, `needs_reply`, `noise`, `can_archive`) + actions notify / label / archive / star
- `POST /workflows/suggest` compiles English with a chosen backend+model
- Approve/enable required before apply; dry-run supported

## Key files

- `src/workflow/*`
- `src/gmail/labels.ts`
- `src/routes/api.ts`, `src/index.ts`

## Follow-ups

- Restart core so `/workflows` and the scheduler are live

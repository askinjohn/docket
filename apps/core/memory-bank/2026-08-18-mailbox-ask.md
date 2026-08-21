# 2026-08-18 — Mailbox Ask AI

## What changed

- New AI role `ask` in `ai-config.json` (merged into existing files on load).
- `POST /ai/ask` with `{ question, messages? }` answers using a snapshot of the last 24 inbox threads (subject, sender, snippet).
- Same backends as other roles (Ollama / OpenAI-compatible / template).

## Why

Mail layout’s right rail needs mailbox-wide questions, not only thread-scoped summarize/chat.

## Key files

- `src/ai/config.ts`
- `src/ai/provider.ts` (`askMailbox`)
- `src/routes/api.ts`

## Follow-ups

- Restart core so `ask` appears in Settings → AI and `/ai/ask` is live.
- Existing `~/.local-mail/ai-config.json` gets `roles.ask` via default merge.

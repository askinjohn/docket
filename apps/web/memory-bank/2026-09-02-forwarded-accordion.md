# 2026-09-02 — Forwarded messages accordion

## What changed

A single Gmail forward (FYI + nested mail) stays one thread. The card shows the intro; quoted / Outlook `image00N.png` payloads sit in a **Forwarded messages** accordion. Reply quotes are unchanged.

## Key files

- `src/app/core/forwarded-mail.ts` (+ spec)
- `src/app/shell/reading-pane.ts`

## Follow-ups

- Parse `message/rfc822` attachments into blocks
- Don’t treat Outlook signature images (1–2) as forwards
- Reply quote chains (`On … wrote:` + `>`) use the same accordion as **Earlier messages** (`quoted-mail.ts`)

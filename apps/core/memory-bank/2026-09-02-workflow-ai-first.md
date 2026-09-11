# 2026-09-02 — Workflows: AI is the matcher

## What changed

Suggest compiles a **tool allowlist + trigger**, not keyword AND filters. At run, the model reads each mail and returns function calls. Filing vs answer is taken from approved `then[]` (no extra classify call). Placeholder matchers become one named phrase (`Team-Offsite`), not a bag of English words.

## Key files

- `src/workflow/suggest.ts`
- `src/workflow/harness.ts`
- `src/workflow/engine.ts`

## Follow-ups

Tiny 1B models still mis-JSON; YES/NO still falls back to the allowlist.

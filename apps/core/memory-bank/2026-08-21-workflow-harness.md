# 2026-08-21 — Local workflow harness

## What changed

Runs no longer AND keyword matchers. Core sends the English intent plus each inbox thread (from, subject, snippet) to the workflow’s local model, parses function calls, and executes allowlisted tools.

- Tools: `addLabel`, `archive` (leave inbox), `star`, `notify`
- `delete` / `trash` from the model → archive. No send, forward, or permanent delete
- Keyword JSON is a hint / preferred bundle, not a filter
- 1B–3B models: one email per call. Larger: batches of 5

## Why

Vacation-India compiled placeholders and extra AND tokens (`separate`), scanned 120 threads, 0 actions.

## Key files

- `src/workflow/harness.ts` (+ test)
- `src/workflow/engine.ts`

## Follow-ups

Tiny models still mis-JSON; YES/NO falls back to the single preferred bundle. Prefer 7B+ for weekly-style multi-bundle triage.

# 2026-08-21 — Workflow answers (report)

## What changed

On each run the local model decides `{ report, act }` from the English intent (compiled tools are a hint). No keyword regex. Report-only skips per-email tools and writes `job.output`. Filing runs still use the harness.

## Key files

- `src/workflow/harness.ts` (`decideRunMode`, `parseRunMode`)
- `src/workflow/engine.ts`, `catalog.ts`, `suggest.ts`

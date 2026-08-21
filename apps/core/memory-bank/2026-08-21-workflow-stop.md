# 2026-08-21 — Stop a running workflow

## What changed

Queued or running jobs can be cancelled. Abort cuts the in-flight model call (not only after the current email). Already-applied actions stay. User stop is not stored as `lastError`.

- `POST /workflows/jobs/:id/stop`
- `POST /workflows/:id/stop` (all live jobs for that workflow)

## Key files

- `src/workflow/queue.ts`, `engine.ts`, `harness.ts`
- `src/ai/provider.ts` (`completeWithBinding` abort)
- `src/routes/api.ts`

# 2026-08-21 — Workflow answer pane

## What changed

When a workflow run finishes with `output`, a right-hand **Answer** column opens (not an overlay). Copy / close / Esc. Activity and What’s happening have **Open answer**.

## Key files

- `src/app/shell/workflow-report.ts`
- `src/app/app.ts` (grid `lm-has-report`)
- `src/app/core/ui-shell.service.ts`

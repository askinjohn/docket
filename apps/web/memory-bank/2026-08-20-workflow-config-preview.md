# 2026-08-20 — Workflow config preview + explanation

## What changed

Workflows now show a side-by-side **how this runs** explanation and **editable JSON**, so a bad compile can be read in plain language and fixed by hand.

- Left: when it runs, whether the model is used, each rule as Match / Judge / Then, plus warnings (AND query words, unread, placeholders, missing label name).
- Right: live JSON. The explanation updates as you type. “What each field means” documents the closed catalog.
- Same preview on Suggest drafts and on saved workflows (Save config).

## Key files

- `src/app/core/workflow-explain.ts` (+ spec)
- `src/app/shell/workflows-dialog.ts`
- `src/app/core/ui-shell.service.ts` (`applyWorkflowDraft`, `saveWorkflowEdits`)

## Follow-ups

Tiny local models can still emit odd JSON; the sanitizer in core is still the safety net. No send/delete actions.

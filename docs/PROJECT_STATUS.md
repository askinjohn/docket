# Project status

**Phase:** 0 — Skeleton  
**As of:** 2026-07-20  

## Done

- Standalone git repo at `local-mail/`
- Angular 22 app (`apps/web`) with Tailwind, signal-based shell UI
- Core placeholder (`apps/core`)
- Product plan, roadmap, TODO, ADR log, architecture mindmap
- Agent rules: root `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, web `AGENTS.md`

## In progress

- Dogfood shell UX; prepare Phase 1 core design

## Blocked / needs human

| Item | Why |
|------|-----|
| Google Cloud OAuth client | Needs human Google account / project |
| Display name / branding | Product choice |
| Node vs Bun for core | Preference |

## How to run

```bash
cd local-mail
nvm use
cd apps/web && npm start
```

Open http://localhost:4200 — demo threads, j/k navigation, ⌘K stub palette.

# Active TODO — Local Mail

Track work here for humans and agents. Check boxes as done.  
Move completed epics notes into `docs/PROJECT_STATUS.md` when a phase closes.

**Current phase:** 0 complete → kickoff Phase 1  
**Updated:** 2026-07-20

---

## Done (Phase 0)

- [x] Create `local-mail` git repo under Projects
- [x] Scaffold Angular 22 app at `apps/web`
- [x] Add Tailwind to web app
- [x] Write PRODUCT / ROADMAP / TODO / DECISIONS
- [x] Write root `AGENTS.md` + `CLAUDE.md` + Cursor rules
- [x] Architecture mindmap in `docs/architecture.html`
- [x] Add `apps/core` placeholder
- [x] 3-pane Superhuman-like shell (demo data, j/k, ⌘K stub)
- [x] Root `package.json` scripts
- [x] Verify `npm run web:build` + unit tests

## Now (Phase 1 kickoff)

- [ ] Choose core runtime (Node vs Bun) → log in DECISIONS.md
- [ ] Core: HTTP server on `127.0.0.1` + `/health`
- [ ] Core: SQLite bootstrap + schema v1
- [ ] Core: Gmail OAuth design (scopes list) + Google Cloud project
- [ ] Web: environment config for core base URL (`http://127.0.0.1:8787`)
- [ ] Web: replace demo threads with `httpResource` when API ready
- [ ] Web: Connect Gmail empty / loading states

## Backlog (do not start early)

### UX (Phase 2)
- [ ] Full command palette (Angular Aria)
- [ ] Full hotkey map (e archive, r reply, c compose)
- [ ] Theme + density settings
- [ ] Custom Gmail-query views

### Live (Phase 3)
- [ ] WebSocket/SSE events
- [ ] Web Notifications

### AI (Phase 4)
- [ ] Provider settings UI
- [ ] Summarize thread
- [ ] Draft reply

### MCP (Phase 5)
- [ ] Tool list + schemas
- [ ] Mutation confirmation policy
- [ ] Client config for external servers

### Packaging (Phase 6)
- [ ] Native notifications helper
- [ ] Dock wrapper (Tauri/Electron/Swift)

## Bugs

_(none yet)_

## Decisions needed from human

1. Display name / branding for the app  
2. Node vs Bun for `apps/core`  
3. Google Cloud project: create now or when Phase 1 coding starts?

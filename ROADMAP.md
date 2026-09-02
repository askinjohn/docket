# Roadmap — Docket

Phased delivery. **Do not start Phase N+1 features until Phase N exit criteria pass** (unless explicitly parallelized below).

---

## Phase 0 — Project skeleton ✅

**Goal:** Repo, rules, Angular 22 app, Superhuman-like shell, planning docs.

| Work | Owner | Status |
|------|--------|--------|
| Monorepo `docket/` + git | PM/eng | Done |
| Angular 22 app `apps/web` + Tailwind | Eng | Done |
| Product / roadmap / TODO / decisions | PM | Done |
| Agent rules (`AGENTS.md`, `CLAUDE.md`, Cursor) | PM | Done |
| Architecture artifact in `docs/` | PM | Done |
| Core placeholder `apps/core` | Eng | Done |
| Minimal 3-pane UI shell | Eng | Done |

**Exit criteria**

- [x] `apps/web` builds with Angular 22  
- [x] Shell shows sidebar / list / reading panes  
- [x] Docs + rules in repo  
- [x] `npm run web:build` green  
- [x] Unit tests pass

---

## Phase 1 — Local core + Gmail MVP ✅ (dogfood)

**Goal:** Real mail path: OAuth → sync → SQLite → UI list/read → archive/send.

| Work | Notes |
|------|--------|
| Core HTTP server on `127.0.0.1` | Health + mail routes — Done |
| SQLite schema | accounts, threads, messages, labels, sync state — Done |
| Gmail OAuth (loopback) | Tokens only in core — Done |
| Incremental sync | `history.list` / initial partial inbox — Done |
| Angular: connect screen + inbox | Shell + mail API service — Done |
| Actions | mark read, archive, star, reply/send — Done |
| HTML body sandbox | iframe sandbox — Done (richer sanitizer still open) |

**Exit criteria**

- [x] Daily-driver read/archive/reply for one Gmail account  
- [x] Refresh survives core restart (tokens + cache)  
- [x] Automated smoke test for health + auth redirect path (`scripts/smoke.sh`)  

**Parallel OK:** UI polish of shell chrome (not blocking on pixel perfection).

---

## Phase 2 — Superhuman-ish UX (partial)

**Goal:** Keyboard-first, dense, customizable chrome.

| Work | Notes |
|------|--------|
| Hotkeys | j/k, e, r, c, s, z, x, u, `/`, `g i|s|a`, `?`, ⌘K, Esc — Done |
| Command palette | Basic list — Done; fuzzy / Aria polish open |
| Optimistic archive + undo | Instant UI; core reconciles — Done (single-step undo) |
| Themes / density / accent | Local prefs — Done |
| Custom views | Named Gmail queries — Done (Save view + sidebar) |
| Signal Forms compose | Still hand-rolled signals — Open |

**Exit criteria**

- [x] Can triage core loop without mouse (j/k/e/r/c/s/z)  
- [x] At least one custom view + theme toggle  



---

## Phase 3 — Live updates + notifications

**Goal:** Feel “alive” when new mail arrives.

| Work | Notes |
|------|--------|
| WebSocket or SSE from core | `mail.new`, sync status |
| Poll / history loop | Configurable interval |
| Web Notifications API | Permission + click → thread |
| Quiet hours / filters | Optional |

**Exit criteria**

- [ ] New mail surfaces in UI without full page reload  
- [ ] Notification works with tab open (Chrome/Safari tested on Mac)  

---

## Phase 4 — Hybrid AI

**Goal:** Summarize + draft with local and/or cloud models.

| Work | Notes |
|------|--------|
| Provider config | Ollama + BYO API keys in core |
| Summarize thread | |
| Draft reply | Lands in compose |
| Routing policy | Prefer local when possible |

**Exit criteria**

- [ ] One-click summarize on a real thread  
- [ ] Draft does not auto-send  

---

## Phase 5 — MCP (both roles)

**Goal:** Agents and tools share the same core.

| Work | Notes |
|------|--------|
| MCP server tools | search_mail, get_thread, draft_reply, archive, … |
| Mutation policy | Confirm / allowlist |
| MCP client | Configure external servers for in-app AI |
| Docs for connecting Cursor/Claude | |

**Exit criteria**

- [ ] External agent can search local mail via MCP  
- [ ] In-app AI can call at least one external MCP tool  

---

## Phase 6 — Optional native shell

**Goal:** Dock citizen + stronger notifications (optional).

| Work | Notes |
|------|--------|
| Tauri or Electron wrap | Or thin Swift shell |
| Auto-start core | |
| Native notifications | When browser quit |
| Windows build of same stack | |

**Exit criteria**

- [ ] Double-click app starts UI + core on Mac  

---

## Milestone summary

| Milestone | Phase | Outcome |
|-----------|-------|---------|
| M0 Bootstrap | 0 | Repo + shell |
| M1 Mail works | 1 | Gmail daily read/write |
| M2 Power UX | 2–3 | Keyboard + notify |
| M3 Intelligence | 4–5 | AI + MCP |
| M4 Desktop | 6 | Optional packaged app |

## Dependency graph

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3
                │                      │
                └──────────► Phase 4 ──┴──► Phase 5 ──► Phase 6
```

Phase 4 can start after Phase 1 (needs real threads). Phase 5 needs Phase 1 data; better after Phase 4 patterns exist.

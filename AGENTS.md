# Agent & contributor rules — Local Mail

This file is the **source of truth** for humans and coding agents working in this repository.  
Angular-specific UI rules also live in `apps/web/AGENTS.md` (CLI-generated); **repo rules here win** on product/architecture conflicts.

---

## Mission

Build a **local-first Gmail client**: Angular 22 UI + local core (SQLite, Gmail, hybrid AI, MCP). Superhuman-*inspired* UX. Free to run. Not a SaaS.

Read before large changes:

1. [PRODUCT.md](./PRODUCT.md)  
2. [ROADMAP.md](./ROADMAP.md)  
3. [TODO.md](./TODO.md)  
4. [docs/DECISIONS.md](./docs/DECISIONS.md)  
5. [docs/architecture.html](./docs/architecture.html)  

---

## Repository map

| Path | Role |
|------|------|
| `apps/web/` | Angular 22 UI (browser or Tauri webview) |
| `apps/core/` | Local backend on 127.0.0.1 (Gmail, SQLite) |
| `apps/desktop/` | Tauri 2 Dock shell — primary packaging target |
| `docs/` | Architecture, decisions, planning artifacts |
| Root `*.md` | Product, roadmap, TODO, this file |

Do **not** put Gmail tokens, API keys, or production secrets in the repo.

---

## Hard constraints

1. **Localhost only for core** — bind `127.0.0.1`, never advertise services on LAN by default.  
2. **Secrets in core only** — no Gmail refresh tokens or LLM keys in Angular `localStorage` / frontend bundles.  
3. **Angular 22 stable APIs** for production UI: signals, Signal Forms, `httpResource`/`resource`, `@Service`, control flow `@if`/`@for`, Angular Aria where useful.  
4. **No experimental Angular WebMCP** as the product’s agent foundation. Product MCP is **core MCP server/client**.  
5. **Gmail-only v1** — do not build multi-provider IMAP unless PRODUCT.md changes.  
6. **Phase discipline** — do not implement Phase 4–5 AI/MCP features before Phase 1 mail works, unless the human explicitly overrides.  
7. **Node engine** — develop with Node matching `.nvmrc` (≥ 22.22.3 for Angular 22).  
8. **Desktop shell** — primary packaging is **Tauri 2** (`apps/desktop`). Do not introduce Electron unless PRODUCT.md changes. Browser + core remains a valid dev path.  

---

## Angular UI rules (`apps/web`)

- Standalone components (default). Do **not** set `standalone: true` explicitly.  
- Do **not** set `changeDetection: OnPush` explicitly (default in v22).  
- Signals for state; `@Service()` + `inject()` for singletons.  
- Prefer Signal Forms for new forms.  
- Prefer `httpResource` / `resource` for async server data.  
- Native control flow only (`@if`, `@for`, `@switch`).  
- `input()` / `output()` / `model()` — not decorator inputs/outputs.  
- Tailwind for layout/density styling is allowed.  
- Sandbox untrusted HTML email; never `innerHTML` raw mail without sanitization/sandbox.  
- Follow `apps/web/AGENTS.md` for finer Angular style.  

After UI changes: run `npm run build` in `apps/web` (or root `npm run web:build`).

---

## Core rules (`apps/core`)

- Single responsibility modules: auth, sync, mail, ai, mcp, db.  
- All external I/O (Gmail, LLM, MCP) goes through core.  
- Schema migrations must be versioned and documented.  
- Destructive MCP tools need explicit policy (confirm / allowlist) before enabling.  

---

## Git & process

- This project is its **own git repo** (`local-mail/`).  
- Prefer small commits with clear messages.  
- Update `TODO.md` when finishing checklist items.  
- New architectural choices → add ADR entry in `docs/DECISIONS.md`.  
- Do not commit `node_modules`, `data/`, `.env`, SQLite files, or OAuth tokens.  

### Worktrees (if using a parent monorepo workflow later)

For feature work intended as an MR from a shared remote, use a dedicated worktree off the default branch. Today the project is standalone under `Projects/gemini-cli/local-mail`.

---

## Security checklist (every PR-sized change)

- [ ] No secrets in client code  
- [ ] Core still localhost-bound if networking changed  
- [ ] Mail HTML not executable  
- [ ] Dependencies reviewed for obvious malware / typosquatting on new packages  

---

## How to work as an agent (PM mode)

1. Check `TODO.md` for **Now** items.  
2. Prefer finishing Phase exit criteria over shiny features.  
3. When blocked on a human decision (O-1… in DECISIONS), stop and ask.  
4. Leave the tree buildable.  
5. Summarize what changed and what the next TODO is.  

---

## Out of scope for agents unless asked

- Force-pushing, rewriting published history  
- Creating real Google Cloud OAuth clients with user credentials  
- Sending real email in automated tests against production inboxes without consent  
- Implementing full Superhuman feature parity in one shot  

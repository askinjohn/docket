# Local Mail

Local-first Gmail client for your laptop: **Angular 22** UI on `localhost`, a **local core** (API + SQLite + AI + MCP), Superhuman-like UX later.

> Not a multi-tenant SaaS. Mail cache and secrets stay on your machine. Gmail remains the cloud source of truth for messages.

## Repository layout

```
local-mail/
├── apps/
│   ├── web/          # Angular 22 UI (this is what you open in the browser)
│   └── core/         # Local backend (Gmail, SQLite, AI, MCP) — Phase 1+
├── docs/             # Product plan, architecture, decisions
├── AGENTS.md         # Rules for AI coding agents (source of truth)
├── CLAUDE.md         # Claude / multi-agent entry
├── PRODUCT.md        # Product vision & scope
├── ROADMAP.md        # Phased delivery
└── TODO.md           # Active backlog
```

## Prerequisites

- **Node.js** `^22.22.3` (see `.nvmrc` — `nvm use`)
- npm 10+
- macOS first; Windows later (same stack)

```bash
cd local-mail
nvm use          # or install Node 22.23+
```

## Quick start

**Needs Node ≥ 22.22.3** (`nvm use` from repo root).

```bash
# install
npm run install:all

# terminal 1 — local core
cd apps/core
cp .env.example .env   # add Google OAuth when ready
npm run dev            # http://127.0.0.1:8787/health

# terminal 2 — UI
cd apps/web
npm start              # http://127.0.0.1:4200
```

Without OAuth credentials the UI still runs with **demo** threads.  
To load real Gmail: [docs/GMAIL_SETUP.md](./docs/GMAIL_SETUP.md).

## Scripts (from repo root)

```bash
npm run core:dev     # Core API (watch)
npm run web:start    # Angular dev server
npm run web:build    # Production build of UI
npm run web:test     # Unit tests
```

## Docs

| Doc | Purpose |
|-----|---------|
| [PRODUCT.md](./PRODUCT.md) | Vision, users, non-goals |
| [ROADMAP.md](./ROADMAP.md) | Phases 0–6 |
| [TODO.md](./TODO.md) | Current checklist |
| [docs/architecture.html](./docs/architecture.html) | Interactive system mindmap |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | Architecture decision log |
| [AGENTS.md](./AGENTS.md) | Engineering rules for humans & agents |

## Principles (short)

1. **Local core owns secrets** — browser never holds Gmail refresh tokens or LLM keys.
2. **Angular 22 stable APIs only** in production UI code (signals, Signal Forms, `httpResource`, `@Service`).
3. **MCP both ways** lives on the core (server + client), not only in the browser.
4. **Gmail-only for v1.**
5. **Ship in phases** — shell → Gmail → UX → notify → AI → MCP → optional Dock wrap.

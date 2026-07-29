# Local Mail

Local-first Gmail client for your laptop: **Angular 22** UI on `localhost`, a **local core** (API + SQLite + AI + MCP), Superhuman-like UX later.

> Not a multi-tenant SaaS. Mail cache and secrets stay on your machine. Gmail remains the cloud source of truth for messages.

## Repository layout

```
local-mail/
├── apps/
│   ├── web/          # Angular 22 UI (browser or Tauri webview)
│   ├── core/         # Local backend (Gmail, SQLite) on 127.0.0.1:8787
│   └── desktop/      # Tauri 2 Dock shell (Mac first)
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

## Quick start — one command

After clone, **one command** installs (if needed) and runs core + UI:

```bash
git clone <repo-url> local-mail
cd local-mail
nvm use                 # Node ≥ 22 (first time)
chmod +x up.sh
./up.sh                 # install deps → ensure .env → start core + browser
```

That’s it. Opens **http://127.0.0.1:4300**. Press Ctrl+C to stop.

| Command | What it does |
|---------|----------------|
| `./up.sh` | Install (once) + start **core + browser** |
| `./up.sh --desktop` | Install + start **core + Dock (Tauri)** |
| `./up.sh --reinstall` | Force reinstall packages, then start |
| `npm start` | Same as `./up.sh` |

**OAuth:** if keys are missing, `./up.sh` **asks in the terminal** for Client ID + Secret and saves them to `apps/core/.env`.  
Or non-interactive:

```bash
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com \
GOOGLE_CLIENT_SECRET=yyy \
./up.sh
```

Gmail setup details: [docs/GMAIL_SETUP.md](./docs/GMAIL_SETUP.md)  
Redirect URI: `http://127.0.0.1:8787/auth/gmail/callback`

Then **Connect Gmail** in the app.

### Other scripts

```bash
./setup.sh             # optional interactive wizard (AI-style prompts)
./start.sh             # start only (assumes already installed)
./up.sh --desktop
npm run desktop:build  # Local Mail.app + DMG (needs Rust)
npm run web:test
```

**Token storage:** `LOCAL_MAIL_TOKEN_STORE=sqlite` (default) or `keychain` (Mac).

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

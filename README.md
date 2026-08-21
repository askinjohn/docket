# Local Mail

A **local-first Gmail client** that runs on your laptop: Angular 22 UI, a Node core on `127.0.0.1`, and an optional Tauri 2 Dock app. Superhuman-inspired keyboard triage. Not a SaaS — mail, tokens, and models stay on your machine.

## What it is

- **Gmail only (v1)** via the Gmail API (OAuth). Archive, labels, star, send, reply, reply-all.
- **Local cache** in SQLite under `~/.local-mail/` (override with `LOCAL_MAIL_DATA_DIR`).
- **Keyboard-first inbox** — `j`/`k`, `e` archive and stay on the next thread, `z` undo, `c` compose, `r` / `a` reply, `⌘K` command palette, `?` shortcuts.
- **Layouts** — Settings → Appearance: **List first** (inbox, then click to read) or **Split** (list stays on the side).
- **Workflows** — describe an automation in English, pick a local (or BYO) model, approve, run in the background. Filing workflows label/archive; question workflows write an answer in a right-hand pane. Stop a run at any time.
- **Local AI** — Ollama by default (`~/.local-mail/ai-config.json`). Optional OpenAI-compatible backends. Secrets never go in the Angular bundle.
- **Desktop** — Tauri 2 window, Notification Center, Dock badge. Browser + core is a valid dev path.

## Architecture

```
                    Google Gmail API
                           │ HTTPS
                           ▼
              Local core  http://127.0.0.1:8787
              Hono · SQLite · OAuth · sync · AI · workflows
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
     Angular 22 (:4300)          Tauri 2 Dock app
     browser webview             native window + notify
```

Hard rules: core binds **localhost only**; Gmail refresh tokens and LLM keys live in **core** (SQLite or OS keychain), never `localStorage`; untrusted HTML mail is sandboxed.

## Requirements

- Node matching [`.nvmrc`](./.nvmrc) (≥ 22.22.3)
- npm ≥ 10
- For desktop: Rust toolchain (Tauri 2)
- For local AI: [Ollama](https://ollama.com/) (optional)
- A Google Cloud OAuth client (free) — see [docs/GMAIL_SETUP.md](./docs/GMAIL_SETUP.md)

## Quick start

```bash
git clone https://github.com/askinjohn/local-mail.git
cd local-mail
nvm use
./up.sh                 # core + browser UI on http://127.0.0.1:4300
# or
./up.sh --desktop       # core + Tauri Dock window
```

`./up.sh` installs workspace deps if needed, writes `apps/core/.env` from the example, prompts for OAuth if missing, then starts the stack.

| Command | What it does |
| --- | --- |
| `./up.sh` | Core + Angular on `:4300` |
| `./up.sh --desktop` | Core + Tauri Dock |
| `./up.sh --reinstall` | Reinstall deps, then start |
| `./setup.sh` | OAuth / env wizard |
| `./start.sh` | Start without install checks |

Health: [http://127.0.0.1:8787/health](http://127.0.0.1:8787/health)

### Google OAuth

1. Google Cloud → enable **Gmail API** → OAuth client (**Desktop** or Web).
2. Authorized redirect URI **must** be `http://127.0.0.1:8787/auth/gmail/callback`.
3. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/core/.env` (never commit `.env`).
4. While the Cloud app is in Testing, add your Google account as a test user.

Step-by-step: [docs/GMAIL_SETUP.md](./docs/GMAIL_SETUP.md).

Tokens: `LOCAL_MAIL_TOKEN_STORE=sqlite` (default) or `keychain` (macOS Keychain via keytar — recommended for daily use).

## Using the client

**Mail.** Connect Gmail from the sign-in gate. Inbox / Starred / All / Sent / labels / custom Gmail-query views. Search uses the local cache and Gmail when needed. Attachments open in a viewer; remote images follow Settings → Privacy.

**Reply.** Reply and Reply all from the reading pane (including per-message). `⌘C` copies; it does not compose. `⌘↵` sends.

**Workflows.** Sidebar → Workflows (or `⌘K` → Workflows). Write English, pick backend + model, **Suggest**, review the explanation + JSON, **Approve & enable**. **Dry run** / **Run now** / **Stop**. Activity card shows live progress. Saved workflows are a compact list; open one to edit config.

- Filing example: *Remove git-related mail (merges, comments, pipelines) from the inbox.*
- Answer example: *List what I should prioritise today.* When a run produces a briefing, a right-hand **Answer** pane opens.

Approved JSON is the contract: a filing workflow will not be turned into a briefing. Mail summaries sent to the model stay on-device when the backend is `local`. Nothing is permanently deleted — archive leaves the inbox. No send/delete from workflows.

Workflows persist in `~/.local-mail/workflows.json`.

**AI.** Settings / `~/.local-mail/ai-config.json` maps roles (`summarize`, `ask`, …) to backends. Mailbox Ask AI is an overlay, not a permanent column.

## Keyboard

| Keys | Action |
| --- | --- |
| `j` `k` or `↓` `↑` | Next / previous thread |
| `e` | Archive (stays on the next thread) |
| `z` | Undo archive |
| `x` | Toggle check |
| `s` | Star |
| `u` | Mark unread |
| `c` | Compose |
| `r` / `a` | Reply / reply all |
| `/` | Search |
| `g i` `g s` `g a` | Inbox / Starred / All |
| `⌘K` | Command palette |
| `?` | Shortcuts |
| `Esc` | Back / close |

`⌘`/`Ctrl`-click, Shift-click, and click-drag multi-select. `⌘A` selects visible threads (not when a text field is focused).

## Repository

```
local-mail/
├── apps/core/       Node core — Hono, SQLite, Gmail, AI, workflows (127.0.0.1:8787)
├── apps/web/        Angular 22 UI (signals, Tailwind)
├── apps/desktop/    Tauri 2 Dock shell
├── docs/            Decisions, Gmail setup, MCP, packaging
├── AGENTS.md        Contributor / agent rules
├── PRODUCT.md       Product scope
├── ROADMAP.md       Phases
└── up.sh            One-command run
```

Data and secrets are **not** in the repo: `apps/core/.env`, `~/.local-mail/` (SQLite, tokens, `ai-config.json`, `workflows.json`).

## Docs

- [PRODUCT.md](./PRODUCT.md) — scope and non-goals
- [ROADMAP.md](./ROADMAP.md) — phases
- [AGENTS.md](./AGENTS.md) — how to change this repo
- [docs/DECISIONS.md](./docs/DECISIONS.md) — architecture choices
- [docs/GMAIL_SETUP.md](./docs/GMAIL_SETUP.md) — OAuth
- [docs/MCP.md](./docs/MCP.md) — HTTP + stdio tools for agents
- [docs/PACKAGING.md](./docs/PACKAGING.md) — shipping a Mac `.app`

```bash
# MCP stdio (core deps + local DB)
npm run mcp
```

## Development

```bash
nvm use
npm run core:dev      # apps/core, tsx watch
npm run web:start     # Angular :4300
npm run desktop:dev   # Tauri (starts web if needed)
npm run web:build
npm --prefix apps/core test
npm --prefix apps/core run typecheck
```

Core tests: Node test runner. Web tests: `npx ng test` (Vitest).

## Security checklist

- [x] Core binds `127.0.0.1` by default
- [x] No Gmail refresh tokens or LLM keys in the frontend
- [x] Mail HTML is not executed as the app
- [ ] Review new npm packages on each dependency bump

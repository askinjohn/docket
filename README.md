# Local Mail 📬

> **A local-first, privacy-focused Gmail client for your laptop.**  
> Built with **Angular 22**, **Tauri 2**, and a **Node.js Local Core** (`127.0.0.1`). Inspired by Superhuman UX—blazing fast, keyboard-driven, and completely free to run. Not a multi-tenant SaaS.

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2022.22.3-brightgreen.svg)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/Angular-22%20(Signals)-dd0031.svg)](https://angular.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🔒 Security & Privacy Guarantees

1. **100% Local Core Binding (`127.0.0.1`)** — The core service binds strictly to localhost. It never advertises on LAN or external networks.
2. **Secrets Stay Local** — Gmail OAuth refresh tokens, access tokens, and LLM keys live strictly in the local backend or macOS Keychain. Frontend `localStorage` contains zero credentials.
3. **No Middleman Servers** — All API calls go directly between your laptop and official Google APIs (`gmail.googleapis.com`).
4. **Sandboxed HTML Render** — External HTML emails are sanitized and isolated in sandboxed standard containers to prevent tracking scripts and malicious execution.

---

## ✨ Features

- ⚡ **Superhuman-Inspired Keyboard Navigation** — Move through your inbox with single-key shortcuts (`j`/`k`, `e` archive, `r` reply, `c` compose, `z` undo, `x` multi-select).
- 💬 **Chat-style reading pane** — Conversation bubbles (yours right, theirs left). Default **Plain** view strips quotes/signatures; toggle **Full email** for original HTML. Rich in-bubble code, tables, and images when useful.
- ✉️ **Docked Writing Window** — Floating compose with local contact suggestions, `Cc`, and dirty-state safeguards.
- 🖱️ **Multi-select** — Click-drag range select, ⌘/Ctrl-click, Shift-range, bulk archive; open thread always included in archive.
- ↩️ **Undo Archive & Auto Sync** — Multi-step undo stack, optimistic UI, quiet background sync.
- 🔔 **Native macOS Notifications** — Tauri Notification Center + Dock badge, with browser fallback. **Settings → Notifications → Test** to verify.
- 🎨 **Appearance** — Dark / light / system, accent colors, density, **font family** (sans / system / serif / mono) and **font size** in Settings.
- 🔐 **Flexible Token Storage** — SQLite or native OS Keychain via `keytar`.
- 👥 **Multi-account** — Switch Gmail accounts from the sidebar menu; OAuth test users required while the Cloud app is in Testing.
- 🖼️ **Attachments & images** — Inline/cid images, attachment viewer, remote-image policy (always / ask per thread / never).
- 🤖 **Local AI & Hybrid Assistance** — Optional Ollama or OpenAI for summaries and draft replies.

---

## 🏗 Architecture

```
                                  ┌─────────────────────────────┐
                                  │      Google Gmail API       │
                                  └──────────────▲──────────────┘
                                                 │ HTTPS
                                  ┌──────────────▼──────────────┐
                                  │   Local Core (Node/TS)      │
                                  │   http://127.0.0.1:8787     │
                                  │ (SQLite / Keychain / Sync)  │
                                  └──────▲──────────────▲───────┘
                                         │              │
                    ┌────────────────────┴──┐        ┌──┴────────────────────┐
                    │  Angular 22 Web UI    │        │  Tauri 2 macOS App    │
                    │ http://127.0.0.1:4300 │        │ (Native Dock Window)  │
                    └───────────────────────┘        └───────────────────────┘
```

---

## 🚀 Quick Start — One Command

### Prerequisites

- **Node.js** `≥ 22.22.3` (matching `.nvmrc`)
- **npm** `≥ 10.0.0`

### 1. Clone & Run

```bash
git clone https://github.com/askinjohn/local-mail.git
cd local-mail

# Enable Node 22
nvm use

# Single-command install & start (Core + Web UI)
./up.sh
```

`./up.sh` automatically installs npm dependencies across all workspaces, creates `apps/core/.env` if missing, starts the backend, and opens **http://127.0.0.1:4300**.

### 2. Run Modes

| Command | Description |
| :--- | :--- |
| `./up.sh` | Install (if needed) & launch **Core + Angular Browser UI** (`:4300`) |
| `./up.sh --desktop` | Install (if needed) & launch **Core + Tauri macOS Dock App** |
| `./up.sh --reinstall` | Force dependency reinstall, then start |
| `./setup.sh` | Interactive CLI setup wizard for Google OAuth credentials |
| `./start.sh` | Fast startup script (skips npm install checks) |

---

## 🔑 Google OAuth Setup

To sync your inbox, you need a free Google Cloud Desktop OAuth Client ID:

1. Open [Google Cloud Credentials Console](https://console.cloud.google.com/apis/credentials).
2. Create an OAuth 2.0 Client ID with Application Type **Desktop App** (or Web App).
3. Set Authorized Redirect URI to: `http://127.0.0.1:8787/auth/gmail/callback`
4. Enter your `CLIENT_ID` and `CLIENT_SECRET` into `apps/core/.env` (or via `./up.sh` interactive prompt).

For step-by-step instructions with screenshots, read [docs/GMAIL_SETUP.md](./docs/GMAIL_SETUP.md).

---

## 🎹 Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `j` / `k` | Next / previous thread |
| `e` | Archive (selection or focused) |
| `z` | Undo archive (stack) |
| `x` | Toggle check on focused thread |
| `⌘`/`Ctrl`-click · Shift-click · click-drag | Multi-select |
| `r` | Reply |
| `c` | Compose |
| `⌘`/`Ctrl`+`Enter` | Send |
| `?` | Shortcuts sheet |
| `Esc` | Clear selection / close modal |

In a thread header: **Plain** (default chat) · **Full email** (original HTML).

---

## 📁 Repository Structure

```
local-mail/
├── apps/
│   ├── core/         # Backend (Node.js, Express, SQLite, Gmail Sync, Keytar)
│   ├── web/          # Frontend (Angular 22, Signals, Signal Forms, Tailwind)
│   └── desktop/      # Desktop Shell (Tauri 2 Rust Dock integration)
├── docs/             # Architecture, decisions (DECISIONS.md), setup guides
├── AGENTS.md         # Source of truth development & architecture rules
├── PRODUCT.md        # Product vision and scope boundaries
├── ROADMAP.md        # Feature roadmap (Phases 0–6)
├── TODO.md           # Active task checklist
├── setup.sh          # Interactive setup wizard
├── start.sh          # Quick launch script
└── up.sh             # Zero-config one-shot runner
```

---

## 📄 Documentation

- 📘 [Product Scope & Vision (PRODUCT.md)](./PRODUCT.md)
- 🗺️ [Development Roadmap (ROADMAP.md)](./ROADMAP.md)
- 🏛️ [Architecture Decisions Log (docs/DECISIONS.md)](./docs/DECISIONS.md)
- 🛠️ [Contributor & Agent Rules (AGENTS.md)](./AGENTS.md)

---

## 📜 License

Distributed under the [MIT License](LICENSE). Built for local privacy and speed.

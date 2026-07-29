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

- ⚡ **Superhuman-Inspired Keyboard Navigation** — Move through your inbox effortlessly using intuitive single-key shortcuts (`j`/`k`, `e` to archive, `r` to reply, `c` to compose, `z` to undo).
- ✉️ **Docked Writing Window** — Floating compose modal with live recipient auto-suggestions generated from local email history (`GET /contacts/suggest`), support for `Cc`, and dirty-state confirmation safeguards.
- ↩️ **Undo Archive & Auto Sync** — Instant optimistic actions with 8-second undo windows, backed by silent 60s background sync.
- 🔔 **Native macOS Notifications** — Full integration with macOS Notification Center via Tauri 2, badge unread count badges, and browser Web Notification fallback.
- 🔐 **Flexible Token Storage** — Choose between local encrypted SQLite storage or native OS Keychain integration via `keytar`.
- 🤖 **Local AI & Hybrid Assistance** — Optional local AI integration via Ollama (`llama3.2`) or OpenAI API for thread summaries and draft generation.

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
| `j` / `k` or `↓` / `↑` | Move selection down / up |
| `Enter` / `o` | Open selected email thread |
| `e` | Archive thread |
| `z` | Undo last action (within 8s) |
| `r` | Reply to thread |
| `c` | Open Compose window |
| `Cmd + Enter` / `Ctrl + Enter` | Send draft / email |
| `Esc` | Close view or modal |

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

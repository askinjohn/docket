# Architecture decision log (ADR-lite)

Newest first. Status: **Accepted** · **Proposed** · **Superseded** · **Rejected**

---

## ADR-015 — Workflow harness (local function calls)

- **Status:** Accepted (2026-08-21)
- **Context:** Compiling English to keyword JSON failed on small local models (schema placeholders, AND of extra words like “separate”). A filing workflow could scan a full inbox and apply nothing. Users need the model to see mail and pick tools, with mail staying on-device.
- **Decision:** Run path is a **harness**: send English intent + from/subject/snippet to the workflow’s local model; parse JSON function calls; execute only `addLabel` / `archive` / `star` / `notify`. `delete`/`trash` map to archive (leave inbox). No send/forward/permanent delete. Keyword JSON is a hint and preferred tool bundle, not a gate. Cloud backends are allowed only if the user picked one; UI warns.
- **Consequences:** Runs are slower (one model call per mail on 1B models, batches of 5 on larger). Activity shows “choosing tools”. Matcher/judge path is no longer the executor.

## ADR-014 — Approved workflows (catalog + cron + model pick)

- **Status:** Accepted (2026-08-19) · run executor superseded by ADR-015
- **Context:** Users want English automations (urgent notify, file GitLab/leave mail, morning triage) without a free-running agent.
- **Decision:** Closed catalog of triggers (`mail.received`, `manual`, `cron`), matchers, judges, and actions (notify / label / leave inbox / star). AI compiles English into that JSON using a **user-selected** backend+model. Nothing mutates mail until Approve. Stored in `~/.local-mail/workflows.json`. No send/delete.
- **Consequences:** Core engine on `mail.new` + 30s cron tick (catch-up if the Mac slept through a slot). Dry-run and Run now from the Workflows dialog.

## ADR-013 — Configurable shell layouts (List first | Split)

- **Status:** Accepted (2026-08-18)
- **Context:** Superhuman-style centered letter cards + a permanent Ask AI column wasted space and collided with the reply bar. Users want to land on the inbox list, click a thread to read it, and optionally keep the list on the side.
- **Decision:** Persist `theme.uiLayout` (`list` | `split`). List-first hides the list while reading (Back / Esc). Split is the classic 3-pane. Ask AI is an overlay, not a grid column.
- **Consequences:** Settings + Cmd+K toggle. New/unset prefs default to list. `classic` migrates to split; `mail` migrates to list.

## ADR-010 — Angular 22 stable feature set for UI

- **Status:** Accepted (2026-07-20)
- **Context:** Need modern, signal-first UI for Superhuman-like client.
- **Decision:** Angular **22.x** only. Production uses stable APIs: signals, OnPush default, Signal Forms, `resource`/`httpResource`, `@Service`, Angular Aria, control flow. No experimental WebMCP as foundation.
- **Consequences:** Fast UI iteration; agent MCP stays on core.

## ADR-012 — Configurable OAuth token store (sqlite | keychain)

- **Status:** Accepted (2026-07-21)
- **Context:** Refresh tokens in plaintext SQLite are risky but clone-and-run must stay easy.
- **Decision:** `LOCAL_MAIL_TOKEN_STORE=sqlite` (default) or `keychain` (keytar / OS secret store). Keychain clears token columns in SQLite after migrate.
- **Consequences:** Cloners get zero native deps by default; daily drivers set keychain in `.env`.

## ADR-011 — Native Mac notifications via Tauri + mail.new

- **Status:** Accepted (2026-07-20)
- **Context:** Primary reason for a Dock app is Notification Center, not browser banners.
- **Decision:** History sync emits `mail.new` (from/subject/threadId). UI uses `tauri-plugin-notification` in the Dock shell, Web Notification API in browser. Click opens thread when supported; Dock badge = unread count.
- **Consequences:** Prefer `npm run desktop:dev` for real Mac notifications; browser remains a dogfood fallback.

## ADR-009 — Notifications v1 = Web Notifications

- **Status:** Superseded by ADR-011 (2026-07-20)
- **Decision:** Core emits events; Angular shows Web Notifications. Native path deferred to Phase 6.
- **Consequences:** Requires browser permission and usually an open tab.

## ADR-008 — MCP both server and client

- **Status:** Accepted (2026-07-20)
- **Decision:** Local core exposes mail tools to external agents and can call other MCP servers for in-app AI.
- **Consequences:** Core is long-lived process; mutation policy required.

## ADR-007 — Hybrid AI

- **Status:** Accepted (2026-07-20)
- **Decision:** Support local models (e.g. Ollama) and BYO cloud API keys. Prefer local when quality allows.
- **Consequences:** Provider abstraction in core; no mandatory paid vendor for *our* backend.

## ADR-006 — Browser localhost first, Dock optional later

- **Status:** Accepted (2026-07-20)
- **Decision:** Day-one delivery is browser → `localhost` UI + local core. Tauri/Electron/Swift shell is Phase 6 packaging.
- **Consequences:** Fastest path for AI/MCP; slightly less “installed app” feel initially.

## ADR-005 — Gmail API (not IMAP) for v1

- **Status:** Accepted (2026-07-20)
- **Decision:** Use Gmail API for threads, labels, history, archive semantics.
- **Consequences:** Google OAuth + Cloud project; excellent fit for Gmail-only v1.

## ADR-004 — Local SQLite cache

- **Status:** Accepted (2026-07-20)
- **Decision:** SQLite on disk for threads, messages, sync state, config, later FTS/embeddings.
- **Consequences:** Offline-ish read of cached mail; schema migrations needed.

## ADR-003 — Local core owns secrets and integrations

- **Status:** Accepted (2026-07-20)
- **Decision:** Browser talks only to core on `127.0.0.1`. Refresh tokens and LLM keys never live in frontend storage.
- **Consequences:** Must run core to use the product; clearer security boundary.

## ADR-002 — Mac now, Windows later

- **Status:** Accepted (2026-07-20)
- **Decision:** Develop and dogfood on macOS; keep stack portable (Angular + JS/TS core).
- **Consequences:** Avoid Mac-only frameworks as the product center.

## ADR-001 — Product is local-first free software, not SaaS

- **Status:** Accepted (2026-07-20)
- **Decision:** No multi-tenant hosted product in v1. User runs stack on laptop.
- **Consequences:** Simpler ops; distribution is “clone and run” (and later optional binaries).

---

## ADR-013 — Primary desktop shell is Tauri 2 (Dock app)

- **Status:** Accepted (2026-07-20)
- **Context:** User wants a real laptop Dock app; keep Angular UI and local core.
- **Decision:** Ship/package via **Tauri 2** (`apps/desktop`). Dev loads Angular at `127.0.0.1:4300`; prod embeds `apps/web/dist/web/browser`. Core is spawned as a **sidecar** on `127.0.0.1:8787` if not already running. Browser + manual core remains valid for development.
- **Consequences:** Need Rust toolchain for desktop builds. App Store is a later, harder path; notarized `.app` is the near-term distribute story.

## ADR-011 — Core runtime is Node 22 + TypeScript

- **Status:** Accepted (2026-07-20)
- **Decision:** `apps/core` uses Node 22, `tsx`, Hono, better-sqlite3, googleapis.
- **Consequences:** Matches Angular Node engine; native module build for sqlite.

## ADR-012 — Phase 1 API is REST on loopback

- **Status:** Accepted (2026-07-20)
- **Decision:** Hono REST (`/health`, `/auth/*`, `/threads`, `/sync`, actions). WebSocket later (Phase 3).
- **Consequences:** Simple CORS + Angular HttpClient.

## Open

| ID | Question | Options |
|----|----------|---------|
| O-2 | App display name | “Local Mail” vs brand name |
| O-3 | Google Cloud OAuth credentials | User must create — see GMAIL_SETUP.md |

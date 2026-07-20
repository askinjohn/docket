# Architecture decision log (ADR-lite)

Newest first. Status: **Accepted** · **Proposed** · **Superseded** · **Rejected**

---

## ADR-010 — Angular 22 stable feature set for UI

- **Status:** Accepted (2026-07-20)
- **Context:** Need modern, signal-first UI for Superhuman-like client.
- **Decision:** Angular **22.x** only. Production uses stable APIs: signals, OnPush default, Signal Forms, `resource`/`httpResource`, `@Service`, Angular Aria, control flow. No experimental WebMCP as foundation.
- **Consequences:** Fast UI iteration; agent MCP stays on core.

## ADR-009 — Notifications v1 = Web Notifications

- **Status:** Accepted (2026-07-20)
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

## Open

| ID | Question | Options |
|----|----------|---------|
| O-1 | Core runtime | Node 22 vs Bun |
| O-2 | App display name | “Local Mail” vs brand name |
| O-3 | Google Cloud project timing | Now vs Phase 1 start |

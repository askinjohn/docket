# 2026-09-02 — Rename to Docket (core)

## What changed

Product display name is **Docket**. Core process, health service, MCP server, and env prefix follow.

- Health `service` is `docket-core`
- Logs: `[docket/core]`
- Env: `DOCKET_*` (e.g. `DOCKET_TOKEN_STORE`, `DOCKET_DATA_DIR`). `LOCAL_MAIL_*` still read
- Default data dir `~/.docket`; if that is missing and `~/.local-mail` exists, the old dir is used
- Keychain service remains `dev.localmail.core` so existing OAuth tokens still resolve
- `apps/core/src/secrets/token-store.ts` is tracked (`.gitignore` no longer matches any `secrets/` folder)

## Key files

- `src/config.ts`, `src/index.ts`, `src/routes/api.ts`, `src/secrets/token-store.ts`
- `src/mcp-stdio.ts`, `.env.example`, `package.json` (`@docket/core`)

## Follow-ups

- Existing `apps/core/.env` with `LOCAL_MAIL_*` keys does not need a rewrite
- GitHub repo rename to `askinjohn/docket` (if available)

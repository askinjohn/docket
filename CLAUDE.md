# Claude / multi-agent entrypoint

Read **[AGENTS.md](./AGENTS.md)** first — it is the canonical rule set.

## Project

**Local Mail** — local-first Gmail client.

- UI: `apps/web` — Angular 22 + plain CSS  
- Core: `apps/core` — local backend (upcoming)  
- Plan: `PRODUCT.md`, `ROADMAP.md`, `TODO.md`  
- Architecture: `docs/architecture.html`, `docs/DECISIONS.md`  

## Default behavior

- Follow phase order in `ROADMAP.md`.  
- Use Angular **stable** v22 patterns only in production code.  
- Keep secrets and Gmail/MCP/AI integration in **core**, not the browser.  
- After code changes under `apps/web`, run a production build.  

## Commands

```bash
nvm use   # from repo root (.nvmrc)
cd apps/web && npm start    # UI
cd apps/web && npm run build
```

## Angular UI details

Also honor `apps/web/AGENTS.md` (framework best practices from Angular CLI).

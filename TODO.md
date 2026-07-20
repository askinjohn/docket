# Active TODO — Local Mail

**Current phase:** 1 — Core + Gmail (in progress) · **Desktop shell: Tauri**  
**Updated:** 2026-07-20

---

## Done

### Phase 0
- [x] Repo, Angular 22 shell, docs, rules

### Desktop (Tauri)
- [x] `apps/desktop` Tauri 2 shell (product name Local Mail)
- [x] Angular as webview frontend (dev :4200 / prod dist)
- [x] Auto-start core sidecar on :8787 (or reuse if running)
- [x] ADR-013 + README desktop path
- [x] `npm run desktop:dev`

### Phase 1 (built so far)
- [x] Core HTTP server on `127.0.0.1:8787` (Hono)
- [x] SQLite schema + `~/.local-mail/mail.sqlite`
- [x] Gmail OAuth routes + token storage
- [x] Inbox sync (threads → SQLite)
- [x] API: list/read/archive/mark read/reply
- [x] Web: MailApiService, bootstrap, connect/sync UI
- [x] Demo fallback when core offline / not connected
- [x] docs/GMAIL_SETUP.md

## Now (you — to unlock real mail)

- [ ] Create Google Cloud OAuth client (see `docs/GMAIL_SETUP.md`)
- [ ] `cp apps/core/.env.example apps/core/.env` and fill secrets
- [ ] Restart core → **Connect Gmail** in UI → **Sync inbox**

## Next engineering

- [ ] Download attachment bytes (Gmail attachment API + local open)
- [ ] Outbound attachments on send
- [ ] HTML body sandboxed iframe (not only plain text)
- [ ] Proper Message-ID / In-Reply-To headers for threading
- [ ] Incremental sync via `history.list` (not full inbox pull)
- [ ] New compose (not only reply)
- [ ] Star / search endpoints
- [ ] Smoke test script for `/health` + auth redirect

## Later phases

- Phase 2 UX polish (palette, themes, optimistic archive)
- Phase 3 live events + notifications
- Phase 4 AI
- Phase 5 MCP

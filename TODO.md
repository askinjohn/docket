# Active TODO — Local Mail

**Updated:** 2026-08-03  
**Status:** Backlog pass — views/labels, undo stack, palette, MCP stdio, e2e, packaging docs

## Shipped in product pass

- [x] Attachment download/open (`GET /attachments/:id` + chip click)
- [x] Star / unstar + Starred view
- [x] Search (local cache) + Inbox / Starred / All
- [x] New compose send (`POST /messages/send`)
- [x] Better reply Message-ID / References headers
- [x] Incremental history sync (`POST /sync` default; `full: true` for full pull)
- [x] Daily summary → `~/.local-mail/notes/YYYY-MM-DD.md`
- [x] AI summarize / draft (template | Ollama | OpenAI)
- [x] MCP-style tools over HTTP (`/mcp/tools`, `/mcp/call`)
- [x] SSE `/events` + optional web notifications
- [x] Optimistic archive, Cmd+K palette commands, theme toggle
- [x] Smoke script `scripts/smoke.sh`

## Shipped since last pass

- [x] Reading pane auto-scroll to latest message (chat-style)
- [x] Undo archive (`z` / Undo button, ~8s window) + `POST /threads/:id/unarchive`
- [x] Quiet background history sync every 60s while connected
- [x] Compose window polish (From/Cc, docked card, discard confirm, ⌘↵ send)
- [x] Recipient typeahead from local mail history (`GET /contacts/suggest`)
- [x] Native Mac notifications (Tauri) + `mail.new` SSE + Dock badge (unread)
- [x] Configurable OAuth token store: `LOCAL_MAIL_TOKEN_STORE=sqlite|keychain`
- [x] Quiet bg sync (no “Background sync: N” list banner)
- [x] Outbound attachments on compose + reply (multipart MIME, 8MB/file)
- [x] Deeper inbox sync (100 threads) + Load more from Gmail
- [x] Reply pane polish (header, attach, compose-style chrome)
- [x] Gmail-backed search (`POST /search`, operators) + Clear
- [x] Infinite scroll load-more + focus/scroll-top fetch new
- [x] Keep ~100 threads in inbox viewport; auto-refill after archive / when thin
- [x] Multi-select (⌘/Ctrl-click, Shift-range, x, ⌘A) + Clear + bulk archive

## Engineering debt (recent)

- [x] Split monolithic `app.ts` into `shell/*` components
- [x] Extract `message-display` helpers + unit tests
- [x] Extract `shell-hotkeys` map + unit tests
- [x] Refresh `docs/PROJECT_STATUS.md` / product status lines
- [x] Keyboard polish: `/`, `g i|s|a`, `u` unread, `?` cheatsheet, denser list rows
- [x] Extract shell models (`shell-models.ts`); further service split still optional
- [ ] Adopt Signal Forms for compose/reply (typeahead + attachments still hand signals)
- [ ] Prefer `resource` / `httpResource` for list/detail fetch paths

## Still thin / follow-ups

- [x] MCP stdio server (`npm run mcp` / `docs/MCP.md`) — read/summary/draft tools
- [x] Scheduled daily summary (`scripts/install-daily-summary-launchd.sh`)
- [x] Richer HTML sanitizer / remote-image toggle (Settings → Privacy)
- [x] Packaging docs (`docs/PACKAGING.md`) — notarization still needs your Apple certs
- [x] E2E Playwright smoke (`npm run e2e` with core+web up)
- [x] Multi-step undo stack (archive stack, `z` pops)
- [x] Labels + custom Gmail query views + Sent
- [x] Fuzzy command palette

## How to try new features

```bash
# restart core after pull
cd apps/core && npm run dev

# UI
cd apps/web && npm start   # :4300
# or npm run desktop:dev
```

| Feature | How |
|---------|-----|
| Download attachment | Click chip on a message |
| Search | Search box above thread list + Enter |
| Star | `s` or Star button |
| Compose | `c` — fill To/Subject/body → Send |
| Daily summary | Sidebar **Daily summary → notes** |
| AI | Thread **Summarize** / **AI draft** (template if no LLM keys) |
| MCP | `POST http://127.0.0.1:8787/mcp/call` with `{ "name": "search_mail", "arguments": { "q": "invoice" } }` |
| Palette | `⌘K` |

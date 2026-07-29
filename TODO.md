# Active TODO — Local Mail

**Updated:** 2026-07-29  
**Status:** Large product pass landed — dogfood, polish, eng-debt cleanup

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
- [ ] Further split `ui-shell.service.ts` (mail list vs compose vs account)
- [ ] Adopt Signal Forms for compose/reply when refactoring compose further
- [ ] Prefer `resource` / `httpResource` for list/detail fetch paths

## Still thin / follow-ups

- [ ] Full MCP stdio server binary for Cursor (HTTP bridge works today)
- [ ] Scheduled daily summary (launchd / cron) — manual button works
- [ ] Richer HTML sanitizer / remote-image toggle
- [ ] Production notarized `.app` packaging polish
- [ ] E2E Playwright against core
- [ ] Multi-step undo stack (currently last archive only)

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

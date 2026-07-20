# Active TODO — Local Mail

**Updated:** 2026-07-20  
**Status:** Large product pass landed — dogfood & polish next

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

## Still thin / follow-ups

- [ ] Outbound file attachments on send
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

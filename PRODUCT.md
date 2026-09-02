# Product plan — Docket

**Status:** Dogfood · Phase 1 mail path done; UX/AI/desktop shipped ahead of roadmap  
**Last updated:** 2026-09-02  
**Codename / folder:** `docket`

---

## 1. One-liner

A **local-first, free-to-run Gmail client** with a Superhuman-like UI, hybrid AI, and full MCP (server + client), running on your laptop via a browser UI + local backend.

## 2. Problem

Commercial power clients (Superhuman et al.) are paid, cloud-centric, and closed. Default mail apps are slow or non-customizable. Developers who already live in agent/MCP workflows want **mail as data + tools on their machine**, not only a web tab on Gmail.

## 3. Goals

| Goal | Measure |
|------|---------|
| Local | Tokens, SQLite cache, config on disk; core binds to `127.0.0.1` |
| Free software | No paid backend *we* operate; user may BYO LLM keys |
| Gmail v1 | OAuth + Gmail API; archive/labels/threads correct |
| Superhuman-like UX | Keyboard-first, dense UI, command palette, optimistic triage |
| Customizable | Theme, density, shortcuts, Gmail-query views |
| AI hybrid | Local models + optional cloud keys |
| MCP both | Agents use our mail; our AI uses other MCP servers |
| Platforms | Mac now; Windows later (same stack) |

## 4. Non-goals (v1)

- Multi-account polish beyond one Gmail account (may allow one account only)
- Hosting email ourselves / SMTP server product
- Full CRM / calendar suite
- Public multi-tenant SaaS
- Pixel-perfect Superhuman clone / trademark issues — **inspired by**, not a copy
- Pure SwiftUI as the primary UI (optional shell later only)
- Relying on experimental Angular WebMCP as the agent foundation

## 5. Users

1. **Primary:** You — developer on a laptop who wants a fast local client + AI/MCP.  
2. **Secondary (later):** Similar power users who self-host the same stack.

## 6. Product shape

```
Human  →  Angular 22 (localhost)  ─┐
                                   ├──► Local core → SQLite
Agent  →  MCP server              ─┘         │
                                             ├── Gmail API
                                             ├── LLM (local / cloud)
                                             └── MCP client → other tools
```

| Surface | Technology |
|---------|------------|
| UI | Angular 22 · signals · Signal Forms · httpResource · Tailwind · Angular Aria |
| Core | Node/Bun TBD · REST + WebSocket/SSE · Gmail · AI · MCP |
| DB | SQLite (+ FTS later) |
| Notify v1 | Web Notifications driven by core events |
| Shell later | Optional Tauri/Electron/Swift for Dock + native notify |

## 7. Core user journeys (v1)

1. **Connect Gmail** — OAuth once; tokens in core.  
2. **Triage inbox** — j/k navigate, `e` archive, open-next, star.  
3. **Read & reply** — sandboxed HTML body; compose with Signal Forms.  
4. **Search / views** — Gmail-style query views (customizable).  
5. **AI assist** — summarize thread; draft reply (hybrid provider).  
6. **Agent access** — external agent searches/archives via MCP with policy.

## 8. Success criteria (MVP = end of Phase 2–3)

- [ ] One Gmail account connected on localhost  
- [ ] Inbox list + thread read from local cache  
- [ ] Archive / star / send reply works against Gmail  
- [ ] Keyboard triage feels usable daily  
- [ ] New mail can raise a browser notification  
- [ ] No secrets in browser storage for OAuth refresh tokens  

**Later success (Phase 4–5):** hybrid AI drafts; MCP server usable from Cursor/Claude-class tools.

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Gmail OAuth / restricted scopes for public distribute | Personal Cloud project first; ship-for-self before public |
| HTML email XSS | Strict sandbox iframe / sanitization |
| Scope creep (AI + MCP + perfect UI) | Phased roadmap; Phase 1 is mail, not agents |
| Node version drift | `.nvmrc` + engine checks |
| Browser quit → no notifications | Document; native helper in Phase 6 |

## 10. Open product questions

- Default app display name / branding  
- Confirm-before-send policy for MCP mutations  
- Which local model to recommend first (Ollama)  
- Core runtime: Node vs Bun  

Record answers in [docs/DECISIONS.md](./docs/DECISIONS.md).

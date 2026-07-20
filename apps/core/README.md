# `@local-mail/core`

Local backend for Local Mail: Gmail, SQLite, REST API on `127.0.0.1`.

**Status:** Phase 1 — Gmail OAuth, inbox sync, list/read/archive/reply.

## Run

```bash
cp .env.example .env   # add Google OAuth credentials
npm install
npm run dev
# http://127.0.0.1:8787/health
```

See [docs/GMAIL_SETUP.md](../../docs/GMAIL_SETUP.md).

## Main routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Status + account |
| GET | `/auth/gmail/start` | Begin OAuth |
| GET | `/auth/gmail/callback` | OAuth redirect |
| POST | `/sync` | Pull inbox threads |
| GET | `/threads` | List cached threads |
| GET | `/threads/:id` | Thread + messages |
| POST | `/threads/:id/archive` | Remove INBOX |
| POST | `/threads/:id/reply` | Send reply |


# MCP — agents talking to Docket

Core exposes mail tools two ways:

## 1. HTTP (always on with core)

```bash
# list tools
curl -s http://127.0.0.1:8787/mcp/tools | jq

# call
curl -s -X POST http://127.0.0.1:8787/mcp/call \
  -H 'content-type: application/json' \
  -d '{"name":"search_mail","arguments":{"q":"invoice"}}'
```

Tools: `search_mail`, `get_thread`, `daily_summary` (+ AI tools on stdio bridge).

## 2. Stdio server (Cursor / Claude Desktop)

Requires core deps installed (SQLite + tokens on disk). Prefer **core already running** for Gmail actions that need the full server; search/summary/get_thread work from the same DB.

```bash
cd apps/core && npm run mcp
```

### Cursor `mcp.json` snippet

```json
{
  "mcpServers": {
    "docket": {
      "command": "npx",
      "args": [
        "tsx",
        "/ABSOLUTE/PATH/TO/docket/apps/core/src/mcp-stdio.ts"
      ]
    }
  }
}
```

Use an absolute path to this repo. Run `npm install` under `apps/core` first.

## Mutation policy

v1 stdio tools are **read / summarize / draft / notes** only. Archive/send remain UI or future policy-gated tools.

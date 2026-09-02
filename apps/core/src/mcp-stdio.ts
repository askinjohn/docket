/**
 * Minimal MCP stdio server for Cursor / Claude Desktop.
 * Bridges tools to the same handlers as the HTTP `/mcp/*` API (in-process).
 *
 * Usage:
 *   cd apps/core && npm run mcp
 *
 * Cursor mcp.json example:
 * {
 *   "mcpServers": {
 *     "docket": {
 *       "command": "npx",
 *       "args": ["tsx", "/ABS/PATH/docket/apps/core/src/mcp-stdio.ts"]
 *     }
 *   }
 * }
 */
import { draftReply, summarizeThread } from './ai/provider.js';
import { appConfig } from './config.js';
import { closeDb } from './db/index.js';
import { getThreadDetail, listThreads } from './mail/queries.js';
import { buildDailySummary } from './summary/daily.js';

type JsonRpcId = string | number | null;

interface JsonRpcReq {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: 'search_mail',
    description: 'Search local mail cache by query string',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query' },
      },
      required: ['q'],
    },
  },
  {
    name: 'get_thread',
    description: 'Get a thread by id from local cache',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Thread id' },
      },
      required: ['id'],
    },
  },
  {
    name: 'daily_summary',
    description: 'Write daily mail summary markdown to notes folder',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'summarize_thread',
    description: 'AI summarize a thread (template/Ollama/OpenAI per core config)',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string' },
      },
      required: ['threadId'],
    },
  },
  {
    name: 'draft_reply',
    description: 'AI draft a reply for a thread (does not send)',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string' },
      },
      required: ['threadId'],
    },
  },
] as const;

function respond(id: JsonRpcId | undefined, result: unknown): void {
  const msg = JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result });
  process.stdout.write(msg + '\n');
}

function respondError(
  id: JsonRpcId | undefined,
  code: number,
  message: string,
): void {
  const msg = JSON.stringify({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  });
  process.stdout.write(msg + '\n');
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'search_mail':
      return listThreads({ q: String(args['q'] ?? ''), view: 'all' });
    case 'get_thread': {
      const detail = getThreadDetail(String(args['id'] ?? ''));
      if (!detail) throw new Error('not_found');
      return detail;
    }
    case 'daily_summary':
      return buildDailySummary();
    case 'summarize_thread':
      return summarizeThread(String(args['threadId'] ?? ''));
    case 'draft_reply':
      return draftReply(String(args['threadId'] ?? ''));
    default:
      throw new Error(`unknown_tool: ${name}`);
  }
}

async function handle(req: JsonRpcReq): Promise<void> {
  const { id, method, params } = req;
  try {
    if (method === 'initialize') {
      respond(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'docket',
          version: '0.1.0',
        },
      });
      return;
    }
    if (method === 'notifications/initialized' || method === 'initialized') {
      return;
    }
    if (method === 'ping') {
      respond(id, {});
      return;
    }
    if (method === 'tools/list') {
      respond(id, { tools: TOOLS });
      return;
    }
    if (method === 'tools/call') {
      const name = String(params?.['name'] ?? '');
      const args = (params?.['arguments'] ?? {}) as Record<string, unknown>;
      const result = await callTool(name, args);
      respond(id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      });
      return;
    }
    respondError(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    respondError(id, -32000, e instanceof Error ? e.message : String(e));
  }
}

async function main(): Promise<void> {
  // Ensure DB path is known (side-effect of config)
  void appConfig.dataDir;

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let req: JsonRpcReq;
      try {
        req = JSON.parse(line) as JsonRpcReq;
      } catch {
        continue;
      }
      void handle(req);
    }
  });

  process.stdin.on('end', () => {
    closeDb();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    closeDb();
    process.exit(0);
  });
}

void main();

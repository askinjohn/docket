import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { draftReply, resolveAiMode, summarizeThread } from '../ai/provider.js';
import { appConfig, googleConfigured } from '../config.js';
import {
  deleteAccount,
  getActiveAccount,
  listAccounts,
  publicAccount,
  setActiveAccountId,
} from '../db/accounts.js';
import { publish, subscribe } from '../events/bus.js';
import { downloadAttachment } from '../gmail/attachments.js';
import { exchangeCode, getAuthUrl } from '../gmail/oauth.js';
import {
  modifyThreadLabels,
  sendNewMessage,
  sendReply,
  syncInbox,
  syncIncremental,
} from '../gmail/sync.js';
import {
  getThreadDetail,
  listThreads,
  suggestContacts,
} from '../mail/queries.js';
import { buildDailySummary } from '../summary/daily.js';

export const api = new Hono();

api.get('/health', (c) => {
  const account = getActiveAccount();
  const accounts = listAccounts().map(publicAccount);
  return c.json({
    ok: true,
    service: 'local-mail-core',
    host: appConfig.host,
    port: appConfig.port,
    googleConfigured: googleConfigured(),
    account: account ? { id: account.id, email: account.email } : null,
    accounts,
    aiMode: resolveAiMode(),
    notesDir: appConfig.notesDir,
    time: new Date().toISOString(),
  });
});

api.get('/auth/status', (c) => {
  const account = getActiveAccount();
  return c.json({
    googleConfigured: googleConfigured(),
    connected: Boolean(account),
    email: account?.email ?? null,
    accountId: account?.id ?? null,
    accounts: listAccounts().map(publicAccount),
  });
});

api.get('/accounts', (c) => {
  const active = getActiveAccount();
  return c.json({
    accounts: listAccounts().map(publicAccount),
    activeId: active?.id ?? null,
  });
});

api.post('/accounts/active', async (c) => {
  const body = await c.req.json().catch(() => ({} as { accountId?: number }));
  if (body.accountId == null) {
    return c.json({ error: 'accountId required' }, 400);
  }
  try {
    const account = setActiveAccountId(Number(body.accountId));
    publish({
      type: 'mail.changed',
      reason: 'account-switch',
      at: new Date().toISOString(),
    });
    return c.json({ ok: true, account: publicAccount(account) });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'switch_failed' },
      400,
    );
  }
});

api.delete('/accounts/:id', async (c) => {
  try {
    deleteAccount(Number(c.req.param('id')));
    return c.json({ ok: true, accounts: listAccounts().map(publicAccount) });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'delete_failed' },
      400,
    );
  }
});

api.get('/auth/gmail/start', (c) => {
  if (!googleConfigured()) {
    return c.json(
      {
        error:
          'Google OAuth not configured. Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in apps/core/.env',
      },
      503,
    );
  }
  return c.redirect(getAuthUrl('local-mail'));
});

api.get('/auth/gmail/callback', async (c) => {
  const code = c.req.query('code');
  const err = c.req.query('error');
  if (err) {
    return c.html(
      authResultPage({ ok: false, title: 'Sign-in cancelled', body: String(err) }),
    );
  }
  if (!code) {
    return c.html(
      authResultPage({
        ok: false,
        title: 'Missing code',
        body: 'Google did not return an authorization code.',
      }),
      400,
    );
  }
  try {
    const account = await exchangeCode(code);
    void syncInbox({ maxThreads: 25 })
      .then((r) =>
        publish({
          type: 'mail.synced',
          synced: r.synced,
          at: new Date().toISOString(),
        }),
      )
      .catch((e) => console.error('[sync] initial sync failed', e));
    return c.html(
      authResultPage({
        ok: true,
        title: 'Connected',
        body: `Signed in as <strong>${escapeHtml(account.email)}</strong>. Close this tab and return to <strong>Local Mail</strong>.`,
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'auth_failed';
    console.error('[auth] callback failed', e);
    return c.html(
      authResultPage({
        ok: false,
        title: 'Connection failed',
        body: escapeHtml(message),
      }),
      400,
    );
  }
});

api.post('/sync', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as { full?: boolean }));
    const result = body.full
      ? { ...(await syncInbox({ maxThreads: 40 })), mode: 'full' as const }
      : await syncIncremental({ maxThreads: 40 });
    publish({
      type: 'mail.synced',
      synced: result.synced,
      at: new Date().toISOString(),
    });
    return c.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'sync_failed';
    return c.json({ error: message }, 400);
  }
});

api.get('/threads', (c) => {
  const q = c.req.query('q') ?? undefined;
  const view = (c.req.query('view') as 'inbox' | 'starred' | 'all') || 'inbox';
  return c.json(listThreads({ q, view }));
});

/** Typeahead contacts from cached mail history (not Google Contacts). */
api.get('/contacts/suggest', (c) => {
  const q = c.req.query('q') ?? '';
  const limit = Number(c.req.query('limit') ?? 8);
  return c.json({
    contacts: suggestContacts(q, Number.isFinite(limit) ? limit : 8),
  });
});

api.get('/threads/:id', (c) => {
  const detail = getThreadDetail(c.req.param('id'));
  if (!detail) return c.json({ error: 'not_found' }, 404);
  return c.json(detail);
});

api.post('/threads/:id/archive', async (c) => {
  try {
    await modifyThreadLabels(c.req.param('id'), [], ['INBOX']);
    publish({
      type: 'mail.changed',
      reason: 'archive',
      at: new Date().toISOString(),
    });
    return c.json({ ok: true });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'archive_failed' },
      400,
    );
  }
});

/** Restore a thread to the inbox (undo archive). Re-fetches from Gmail into SQLite. */
api.post('/threads/:id/unarchive', async (c) => {
  try {
    await modifyThreadLabels(c.req.param('id'), ['INBOX'], []);
    publish({
      type: 'mail.changed',
      reason: 'unarchive',
      at: new Date().toISOString(),
    });
    return c.json({ ok: true });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'unarchive_failed' },
      400,
    );
  }
});

api.post('/threads/:id/read', async (c) => {
  try {
    await modifyThreadLabels(c.req.param('id'), [], ['UNREAD']);
    return c.json({ ok: true });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'read_failed' },
      400,
    );
  }
});

api.post('/threads/:id/star', async (c) => {
  const body = await c.req.json().catch(() => ({} as { starred?: boolean }));
  const starred = body.starred !== false;
  try {
    if (starred) await modifyThreadLabels(c.req.param('id'), ['STARRED'], []);
    else await modifyThreadLabels(c.req.param('id'), [], ['STARRED']);
    publish({
      type: 'mail.changed',
      reason: 'star',
      at: new Date().toISOString(),
    });
    return c.json({ ok: true, starred });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'star_failed' },
      400,
    );
  }
});

api.post('/threads/:id/reply', async (c) => {
  const body = await c.req.json().catch(() => ({} as { bodyText?: string }));
  if (!body.bodyText?.trim()) {
    return c.json({ error: 'bodyText required' }, 400);
  }
  try {
    const result = await sendReply({
      threadId: c.req.param('id'),
      bodyText: body.bodyText,
    });
    return c.json({ ok: true, ...result });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'send_failed' },
      400,
    );
  }
});

api.post('/messages/send', async (c) => {
  const body = await c.req.json().catch(
    () =>
      ({} as {
        to?: string;
        subject?: string;
        bodyText?: string;
        cc?: string;
      }),
  );
  if (!body.to?.trim() || !body.bodyText?.trim()) {
    return c.json({ error: 'to and bodyText required' }, 400);
  }
  try {
    const result = await sendNewMessage({
      to: body.to,
      subject: body.subject ?? '',
      bodyText: body.bodyText,
      cc: body.cc,
    });
    return c.json({ ok: true, ...result });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'send_failed' },
      400,
    );
  }
});

api.get('/attachments/:id', async (c) => {
  try {
    const file = await downloadAttachment(c.req.param('id'));
    c.header('Content-Type', file.mimeType);
    c.header(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    );
    return c.body(new Uint8Array(file.data));
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'download_failed' },
      400,
    );
  }
});

api.post('/summary/daily', (c) => {
  try {
    const result = buildDailySummary();
    return c.json({ ok: true, ...result });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'summary_failed' },
      400,
    );
  }
});

api.post('/ai/summarize', async (c) => {
  const body = await c.req.json().catch(() => ({} as { threadId?: string }));
  if (!body.threadId) return c.json({ error: 'threadId required' }, 400);
  try {
    const result = await summarizeThread(body.threadId);
    return c.json({ ok: true, ...result });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'ai_failed' },
      400,
    );
  }
});

api.post('/ai/draft', async (c) => {
  const body = await c.req.json().catch(() => ({} as { threadId?: string }));
  if (!body.threadId) return c.json({ error: 'threadId required' }, 400);
  try {
    const result = await draftReply(body.threadId);
    return c.json({ ok: true, ...result });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'ai_failed' },
      400,
    );
  }
});

/** Simple JSON MCP-style tools for agents / notes export */
api.get('/mcp/tools', (c) => {
  return c.json({
    tools: [
      {
        name: 'search_mail',
        description: 'Search local mail cache by query string',
        input: { q: 'string' },
      },
      {
        name: 'get_thread',
        description: 'Get a thread by id from local cache',
        input: { id: 'string' },
      },
      {
        name: 'daily_summary',
        description: 'Write daily mail summary markdown to notes folder',
        input: {},
      },
    ],
  });
});

api.post('/mcp/call', async (c) => {
  const body = await c.req
    .json()
    .catch(() => ({} as { name?: string; arguments?: Record<string, string> }));
  const name = body.name;
  const args = body.arguments ?? {};
  try {
    if (name === 'search_mail') {
      return c.json({
        ok: true,
        result: listThreads({ q: args.q, view: 'all' }),
      });
    }
    if (name === 'get_thread') {
      const detail = getThreadDetail(args.id);
      if (!detail) return c.json({ error: 'not_found' }, 404);
      return c.json({ ok: true, result: detail });
    }
    if (name === 'daily_summary') {
      return c.json({ ok: true, result: buildDailySummary() });
    }
    return c.json({ error: 'unknown_tool' }, 400);
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'mcp_failed' },
      400,
    );
  }
});

api.get('/events', (c) => {
  return streamSSE(c, async (stream) => {
    const unsub = subscribe((event) => {
      void stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    });

    const beat = setInterval(() => {
      void stream.writeSSE({
        event: 'heartbeat',
        data: JSON.stringify({
          type: 'heartbeat',
          at: new Date().toISOString(),
        }),
      });
    }, 25000);

    try {
      await stream.writeSSE({
        event: 'hello',
        data: JSON.stringify({ ok: true, at: new Date().toISOString() }),
      });
      // keep open until client disconnects
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener('abort', () => resolve());
      });
    } finally {
      clearInterval(beat);
      unsub();
    }
  });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function authResultPage(opts: {
  ok: boolean;
  title: string;
  body: string;
}): string {
  const accent = opts.ok ? '#3dd6c6' : '#f07178';
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>Local Mail — ${opts.title}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0b0d12;color:#e8ecf4;
  display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{max-width:28rem;padding:1.5rem 1.75rem;border:1px solid #2a3344;border-radius:12px;background:#12161f}
  h1{margin:0 0 .75rem;font-size:1.25rem;color:${accent}}
  p{margin:.5rem 0;line-height:1.5;color:#8b95a8}
  p strong{color:#e8ecf4}
  .hint{font-size:.85rem;margin-top:1.25rem}
  button{margin-top:1rem;padding:.5rem 1rem;border-radius:8px;border:0;background:#7c6af7;color:#fff;font:inherit;cursor:pointer}
</style></head>
<body><div class="card">
  <h1>${opts.title}</h1>
  <p>${opts.body}</p>
  <p class="hint">This window can be closed. Local Mail stays in the Dock app.</p>
  <button type="button" onclick="window.close()">Close tab</button>
</div>
</body></html>`;
}

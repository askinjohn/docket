import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';

import { draftReply, resolveAiMode, summarizeThread } from '../ai/provider.js';
import { appConfig, googleConfigured } from '../config.js';
import {
  GmailAuthExpiredError,
  isGmailAuthExpired,
} from '../gmail/auth-errors.js';
import {
  deleteAccount,
  getActiveAccount,
  listAccounts,
  publicAccount,
  setActiveAccountId,
} from '../db/accounts.js';
import { publish, subscribe } from '../events/bus.js';
import { downloadAttachment } from '../gmail/attachments.js';
import { contentDispositionHeader } from '../gmail/content-disposition.js';
import { exchangeCode, getAuthUrl } from '../gmail/oauth.js';
import {
  hydrateThreadFromGmail,
  inboxHasMorePages,
  modifyThreadLabels,
  searchGmail,
  searchHasMorePages,
  sendNewMessage,
  sendReply,
  syncInbox,
  syncIncremental,
  type OutboundAttachment,
} from '../gmail/sync.js';
import {
  getThreadDetail,
  listLabels,
  listThreads,
  suggestContacts,
  type ThreadListView,
} from '../mail/queries.js';
import {
  createMailView,
  deleteMailView,
  listMailViews,
} from '../mail/views.js';
import { buildDailySummary } from '../summary/daily.js';

export const api = new Hono();

/** Map Gmail OAuth expiry to 401 so the UI can open sign-in. */
function jsonGmailError(
  c: Context,
  e: unknown,
  fallback = 'request_failed',
) {
  if (e instanceof GmailAuthExpiredError || isGmailAuthExpired(e)) {
    return c.json(
      {
        error: 'Gmail session expired. Sign in again.',
        code: 'auth_expired',
      },
      401,
    );
  }
  const message = e instanceof Error ? e.message : fallback;
  if (isGmailAuthExpired(message)) {
    return c.json(
      {
        error: 'Gmail session expired. Sign in again.',
        code: 'auth_expired',
      },
      401,
    );
  }
  return c.json({ error: message }, 400);
}

api.get('/health', (c) => {
  const account = getActiveAccount();
  const accounts = listAccounts().map(publicAccount);
  return c.json({
    ok: true,
    service: 'local-mail-core',
    host: appConfig.host,
    port: appConfig.port,
    googleConfigured: googleConfigured(),
    /** sqlite = tokens in DB (default); keychain = OS secret store */
    tokenStore: appConfig.tokenStore,
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
    await deleteAccount(Number(c.req.param('id')));
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
    void syncInbox({ maxThreads: 100 })
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
    const body = await c.req.json().catch(
      () =>
        ({} as {
          full?: boolean;
          more?: boolean;
          maxThreads?: number;
        }),
    );
    const maxThreads = body.maxThreads ?? 100;
    let result: {
      synced: number;
      email: string;
      mode: string;
      hasMore?: boolean;
      nextPageToken?: string | null;
      newMail?: {
        threadId: string;
        messageId: string;
        from: string;
        subject: string;
        snippet: string;
      }[];
    };
    if (body.more) {
      result = {
        ...(await syncInbox({
          maxThreads,
          more: true,
          notifyRecent: false,
        })),
        mode: 'full',
      };
    } else if (body.full) {
      result = {
        ...(await syncInbox({
          maxThreads,
          more: false,
          // Manual Sync should surface brand-new inbox mail
          notifyRecent: true,
        })),
        mode: 'full',
      };
    } else {
      result = await syncIncremental({ maxThreads });
    }
    publish({
      type: 'mail.synced',
      synced: result.synced,
      at: new Date().toISOString(),
    });
    return c.json({
      ok: true,
      ...result,
      hasMore: result.hasMore ?? inboxHasMorePages(),
      newMail: result.newMail ?? [],
    });
  } catch (e) {
    return jsonGmailError(c, e, 'sync_failed');
  }
});

api.get('/threads', (c) => {
  const q = c.req.query('q') ?? undefined;
  const view = (c.req.query('view') as ThreadListView) || 'inbox';
  const label = c.req.query('label') ?? undefined;
  return c.json({
    ...listThreads({ q, view, label }),
    searchHasMore: searchHasMorePages(),
    inboxHasMore: inboxHasMorePages(),
  });
});

/** Distinct Gmail labels present in the local cache. */
api.get('/labels', (c) => {
  return c.json({ labels: listLabels() });
});

/** Named Gmail-query views (custom sidebar entries). */
api.get('/views', (c) => {
  return c.json({ views: listMailViews() });
});

api.post('/views', async (c) => {
  const body = await c.req
    .json()
    .catch(() => ({} as { name?: string; query?: string }));
  try {
    const view = createMailView(body.name ?? '', body.query ?? '');
    return c.json({ ok: true, view });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'view_create_failed' },
      400,
    );
  }
});

api.delete('/views/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const ok = deleteMailView(id);
  return c.json({ ok });
});

/**
 * Search Gmail (operators supported: from:, subject:, has:attachment, …).
 * Pulls matching threads into SQLite, then client re-lists with local filter.
 */
api.post('/search', async (c) => {
  const body = await c.req.json().catch(
    () => ({} as { q?: string; more?: boolean; maxResults?: number }),
  );
  try {
    const result = await searchGmail({
      q: body.q ?? '',
      more: body.more,
      maxResults: body.maxResults,
    });
    publish({
      type: 'mail.changed',
      reason: 'search',
      at: new Date().toISOString(),
    });
    return c.json({ ok: true, ...result });
  } catch (e) {
    return jsonGmailError(c, e, 'search_failed');
  }
});

/** Typeahead contacts from cached mail history (not Google Contacts). */
api.get('/contacts/suggest', (c) => {
  const q = c.req.query('q') ?? '';
  const limit = Number(c.req.query('limit') ?? 8);
  return c.json({
    contacts: suggestContacts(q, Number.isFinite(limit) ? limit : 8),
  });
});

api.get('/threads/:id', async (c) => {
  // IDs are composite "accountId:gmailThreadId" — client encodes them
  const id = decodeURIComponent(c.req.param('id'));
  let detail = getThreadDetail(id);
  // Thread row without messages (or missing) — pull full thread from Gmail once
  if (!detail || detail.messages.length === 0) {
    const ok = await hydrateThreadFromGmail(id);
    if (ok) detail = getThreadDetail(id);
  }
  if (!detail) return c.json({ error: 'not_found' }, 404);
  return c.json(detail);
});

api.post('/threads/:id/archive', async (c) => {
  try {
    await modifyThreadLabels(decodeURIComponent(c.req.param('id')), [], ['INBOX']);
    publish({
      type: 'mail.changed',
      reason: 'archive',
      at: new Date().toISOString(),
    });
    return c.json({ ok: true });
  } catch (e) {
    return jsonGmailError(c, e, 'archive_failed');
  }
});

/** Restore a thread to the inbox (undo archive). Re-fetches from Gmail into SQLite. */
api.post('/threads/:id/unarchive', async (c) => {
  try {
    await modifyThreadLabels(decodeURIComponent(c.req.param('id')), ['INBOX'], []);
    publish({
      type: 'mail.changed',
      reason: 'unarchive',
      at: new Date().toISOString(),
    });
    return c.json({ ok: true });
  } catch (e) {
    return jsonGmailError(c, e, 'unarchive_failed');
  }
});

api.post('/threads/:id/read', async (c) => {
  try {
    await modifyThreadLabels(decodeURIComponent(c.req.param('id')), [], ['UNREAD']);
    publish({
      type: 'mail.changed',
      reason: 'read',
      at: new Date().toISOString(),
    });
    return c.json({ ok: true });
  } catch (e) {
    return jsonGmailError(c, e, 'read_failed');
  }
});

api.post('/threads/:id/unread', async (c) => {
  try {
    await modifyThreadLabels(decodeURIComponent(c.req.param('id')), ['UNREAD'], []);
    publish({
      type: 'mail.changed',
      reason: 'unread',
      at: new Date().toISOString(),
    });
    return c.json({ ok: true });
  } catch (e) {
    return jsonGmailError(c, e, 'unread_failed');
  }
});

api.post('/threads/:id/star', async (c) => {
  const body = await c.req.json().catch(() => ({} as { starred?: boolean }));
  const starred = body.starred !== false;
  try {
    const tid = decodeURIComponent(c.req.param('id'));
    if (starred) await modifyThreadLabels(tid, ['STARRED'], []);
    else await modifyThreadLabels(tid, [], ['STARRED']);
    publish({
      type: 'mail.changed',
      reason: 'star',
      at: new Date().toISOString(),
    });
    return c.json({ ok: true, starred });
  } catch (e) {
    return jsonGmailError(c, e, 'star_failed');
  }
});

api.post('/threads/:id/reply', async (c) => {
  const body = await c.req.json().catch(
    () =>
      ({} as {
        bodyText?: string;
        attachments?: OutboundAttachment[];
      }),
  );
  if (!body.bodyText?.trim()) {
    return c.json({ error: 'bodyText required' }, 400);
  }
  try {
    const result = await sendReply({
      threadId: decodeURIComponent(c.req.param('id')),
      bodyText: body.bodyText,
      attachments: body.attachments,
    });
    return c.json({ ok: true, ...result });
  } catch (e) {
    return jsonGmailError(c, e, 'send_failed');
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
        attachments?: OutboundAttachment[];
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
      attachments: body.attachments,
    });
    return c.json({ ok: true, ...result });
  } catch (e) {
    return jsonGmailError(c, e, 'send_failed');
  }
});

api.get('/attachments/:id', async (c) => {
  try {
    const file = await downloadAttachment(decodeURIComponent(c.req.param('id')));
    const forceDownload = c.req.query('download') === '1';
    const mime = file.mimeType || 'application/octet-stream';
    const canInline =
      mime.startsWith('image/') ||
      mime === 'application/pdf' ||
      mime.startsWith('text/') ||
      mime === 'application/json' ||
      mime === 'application/xml';
    // Inline for in-app preview; ?download=1 forces save.
    // filename must be ASCII-safe (macOS screenshots use U+202F etc.)
    const disposition = contentDispositionHeader(
      file.filename,
      !forceDownload && canInline ? 'inline' : 'attachment',
    );
    c.header('Content-Type', mime);
    c.header('Content-Disposition', disposition);
    c.header('Cache-Control', 'private, max-age=3600');
    // Allow sandboxed iframe (srcdoc) + viewer iframe to load from core
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Cross-Origin-Resource-Policy', 'cross-origin');
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(new Uint8Array(file.data));
  } catch (e) {
    return jsonGmailError(c, e, 'download_failed');
  }
});

api.post('/summary/daily', (c) => {
  try {
    const result = buildDailySummary();
    return c.json({ ok: true, ...result });
  } catch (e) {
    return jsonGmailError(c, e, 'summary_failed');
  }
});

api.post('/ai/summarize', async (c) => {
  const body = await c.req.json().catch(() => ({} as { threadId?: string }));
  if (!body.threadId) return c.json({ error: 'threadId required' }, 400);
  try {
    const result = await summarizeThread(body.threadId);
    return c.json({ ok: true, ...result });
  } catch (e) {
    return jsonGmailError(c, e, 'ai_failed');
  }
});

api.post('/ai/draft', async (c) => {
  const body = await c.req.json().catch(() => ({} as { threadId?: string }));
  if (!body.threadId) return c.json({ error: 'threadId required' }, 400);
  try {
    const result = await draftReply(body.threadId);
    return c.json({ ok: true, ...result });
  } catch (e) {
    return jsonGmailError(c, e, 'ai_failed');
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
    return jsonGmailError(c, e, 'mcp_failed');
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

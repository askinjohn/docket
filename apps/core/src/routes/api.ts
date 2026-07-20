import { Hono } from 'hono';

import { appConfig, googleConfigured } from '../config.js';
import { getPrimaryAccount } from '../db/index.js';
import {
  exchangeCode,
  getAuthUrl,
} from '../gmail/oauth.js';
import {
  modifyThreadLabels,
  sendReply,
  syncInbox,
} from '../gmail/sync.js';
import { getThreadDetail, listThreads } from '../mail/queries.js';

export const api = new Hono();

api.get('/health', (c) => {
  const account = getPrimaryAccount();
  return c.json({
    ok: true,
    service: 'local-mail-core',
    host: appConfig.host,
    port: appConfig.port,
    googleConfigured: googleConfigured(),
    account: account ? { email: account.email } : null,
    time: new Date().toISOString(),
  });
});

api.get('/auth/status', (c) => {
  const account = getPrimaryAccount();
  return c.json({
    googleConfigured: googleConfigured(),
    connected: Boolean(account),
    email: account?.email ?? null,
  });
});

api.get('/auth/gmail/start', (c) => {
  if (!googleConfigured()) {
    return c.json(
      {
        error:
          'Google OAuth not configured. Copy apps/core/.env.example to apps/core/.env and set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.',
      },
      503,
    );
  }
  const url = getAuthUrl('local-mail');
  return c.redirect(url);
});

api.get('/auth/gmail/callback', async (c) => {
  const code = c.req.query('code');
  const err = c.req.query('error');
  if (err) {
    return c.html(authResultPage({
      ok: false,
      title: 'Sign-in cancelled',
      body: String(err),
    }));
  }
  if (!code) {
    return c.html(authResultPage({
      ok: false,
      title: 'Missing code',
      body: 'Google did not return an authorization code.',
    }), 400);
  }
  try {
    const account = await exchangeCode(code);
    // Kick off initial sync in background
    void syncInbox({ maxThreads: 25 }).catch((e) =>
      console.error('[sync] initial sync failed', e),
    );
    // Do NOT redirect to localhost UI — that opens a browser tab.
    // The Dock/Tauri app polls /auth/status and will pick this up.
    return c.html(authResultPage({
      ok: true,
      title: 'Connected',
      body: `Signed in as <strong>${escapeHtml(account.email)}</strong>. You can close this tab and return to the <strong>Local Mail</strong> app — it will sync automatically.`,
    }));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'auth_failed';
    console.error('[auth] callback failed', e);
    return c.html(authResultPage({
      ok: false,
      title: 'Connection failed',
      body: escapeHtml(message),
    }), 400);
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Success/error page for system-browser OAuth — never navigates away into the app origin. */
function authResultPage(opts: { ok: boolean; title: string; body: string }): string {
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
<script>try{window.history.replaceState({},'',location.pathname)}catch(e){}</script>
</body></html>`;
}

api.post('/sync', async (c) => {
  try {
    const result = await syncInbox({ maxThreads: 40 });
    return c.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'sync_failed';
    return c.json({ error: message }, 400);
  }
});

api.get('/threads', (c) => {
  return c.json(listThreads());
});

api.get('/threads/:id', (c) => {
  const detail = getThreadDetail(c.req.param('id'));
  if (!detail) return c.json({ error: 'not_found' }, 404);
  return c.json(detail);
});

api.post('/threads/:id/archive', async (c) => {
  try {
    await modifyThreadLabels(c.req.param('id'), [], ['INBOX']);
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'archive_failed';
    return c.json({ error: message }, 400);
  }
});

api.post('/threads/:id/read', async (c) => {
  try {
    await modifyThreadLabels(c.req.param('id'), [], ['UNREAD']);
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'read_failed';
    return c.json({ error: message }, 400);
  }
});

api.post('/threads/:id/star', async (c) => {
  const body = await c.req.json().catch(() => ({} as { starred?: boolean }));
  const starred = body.starred !== false;
  try {
    if (starred) {
      await modifyThreadLabels(c.req.param('id'), ['STARRED'], []);
    } else {
      await modifyThreadLabels(c.req.param('id'), [], ['STARRED']);
    }
    return c.json({ ok: true, starred });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'star_failed';
    return c.json({ error: message }, 400);
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
    const message = e instanceof Error ? e.message : 'send_failed';
    return c.json({ error: message }, 400);
  }
});

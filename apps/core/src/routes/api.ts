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
    return c.redirect(
      `${appConfig.webOrigin}/?auth=error&reason=${encodeURIComponent(err)}`,
    );
  }
  if (!code) {
    return c.json({ error: 'Missing code' }, 400);
  }
  try {
    const account = await exchangeCode(code);
    // Kick off initial sync in background
    void syncInbox({ maxThreads: 25 }).catch((e) =>
      console.error('[sync] initial sync failed', e),
    );
    const target = `${appConfig.webOrigin}/?auth=ok&email=${encodeURIComponent(account.email)}`;
    // HTML works for browser + Tauri (external OAuth browser): user can return to the app
    return c.html(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta http-equiv="refresh" content="0;url=${target}"/>
<title>Local Mail — Connected</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0b0d12;color:#e8ecf4;
  display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{max-width:28rem;padding:1.5rem;border:1px solid #2a3344;border-radius:12px;background:#12161f}
  a{color:#7c6af7}
</style></head>
<body><div class="card">
  <h1>Connected</h1>
  <p>Signed in as <strong>${account.email}</strong>.</p>
  <p>Return to the <strong>Local Mail</strong> app (Dock window) and click <em>Sync inbox</em> if mail does not appear yet.</p>
  <p><a href="${target}">Open Local Mail UI</a></p>
</div></body></html>`);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'auth_failed';
    console.error('[auth] callback failed', e);
    return c.html(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Auth error</title></head>
<body style="font-family:system-ui;background:#0b0d12;color:#e8ecf4;padding:2rem">
<h1>Connection failed</h1><p>${message}</p>
<p><a href="${appConfig.webOrigin}" style="color:#7c6af7">Back</a></p>
</body></html>`, 400);
  }
});

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

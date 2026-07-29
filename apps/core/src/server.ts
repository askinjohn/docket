import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { appConfig } from './config.js';
import { getDb } from './db/index.js';
import { api } from './routes/api.js';

/**
 * Allow Angular dev server + packaged Tauri webviews.
 * Tauri 2 production loads from https://tauri.localhost (not :4300), so a fixed
 * list of only http://127.0.0.1:4300 makes the .app look "core offline".
 */
function isAllowedWebOrigin(origin: string): boolean {
  const staticAllowed = new Set([
    appConfig.webOrigin,
    'http://localhost:4300',
    'http://127.0.0.1:4300',
    'https://tauri.localhost',
    'http://tauri.localhost',
    'tauri://localhost',
    'asset://localhost',
    'ipc://localhost',
  ]);
  if (staticAllowed.has(origin)) return true;
  // Dev UI on any localhost port
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) return true;
  // Tauri / WKWebView style origins
  if (/^https?:\/\/([a-z0-9-]+\.)?tauri\.localhost(:\d+)?$/i.test(origin)) {
    return true;
  }
  if (
    origin.startsWith('tauri://') ||
    origin.startsWith('asset://') ||
    origin.startsWith('ipc://')
  ) {
    return true;
  }
  return false;
}

export function createApp() {
  // Ensure DB is ready on boot
  getDb();

  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: (origin) => {
        // Non-browser clients (curl, same-machine tools) often send no Origin
        if (!origin) return appConfig.webOrigin;
        return isAllowedWebOrigin(origin) ? origin : null;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  );

  app.route('/', api);

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.onError((err, c) => {
    console.error('[core]', err);
    return c.json({ error: err.message || 'internal_error' }, 500);
  });

  return app;
}

import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { appConfig } from './config.js';
import { getDb } from './db/index.js';
import { api } from './routes/api.js';

export function createApp() {
  // Ensure DB is ready on boot
  getDb();

  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: [appConfig.webOrigin, 'http://localhost:4300', 'http://127.0.0.1:4300'],
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

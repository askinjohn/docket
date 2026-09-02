import { serve } from '@hono/node-server';

import { appConfig } from './config.js';
import { closeDb } from './db/index.js';
import { createApp } from './server.js';
import { getAiStatus } from './ai/provider.js';
import {
  startBackgroundSync,
  stopBackgroundSync,
} from './sync/background.js';
import { startWorkflows, stopWorkflows } from './workflow/scheduler.js';

const app = createApp();

console.log(`[docket/core] data dir: ${appConfig.dataDir}`);
console.log(`[docket/core] database: ${appConfig.dbPath}`);
console.log(
  `[docket/core] token store: ${appConfig.tokenStore}` +
    (appConfig.tokenStore === 'sqlite'
      ? ' (plaintext in SQLite — set DOCKET_TOKEN_STORE=keychain for OS secrets)'
      : ' (OS keychain via keytar)'),
);
console.log(
  `[docket/core] listening http://${appConfig.host}:${appConfig.port}`,
);

const server = serve(
  {
    fetch: app.fetch,
    hostname: appConfig.host,
    port: appConfig.port,
  },
  (info) => {
    console.log(
      `[docket/core] ready at http://${info.address}:${info.port}`,
    );
    console.log(`[docket/core] health: http://${appConfig.host}:${appConfig.port}/health`);
    startBackgroundSync();
    startWorkflows();
    void getAiStatus().then((s) => {
      console.log(
        `[docket/core] AI: ${s.mode}${s.model ? ` · ${s.model}` : ''} — ${s.hint}`,
      );
    });
  },
);

function shutdown() {
  console.log('[docket/core] shutting down');
  stopBackgroundSync();
  stopWorkflows();
  closeDb();
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

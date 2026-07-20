import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';

loadEnv();

const host = process.env.LOCAL_MAIL_CORE_HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && host !== 'localhost') {
  console.warn(
    `[config] WARNING: binding host is "${host}". Prefer 127.0.0.1 for local-only security.`,
  );
}

const dataDir =
  process.env.LOCAL_MAIL_DATA_DIR ?? join(homedir(), '.local-mail');

mkdirSync(dataDir, { recursive: true });

export const appConfig = {
  host,
  port: Number(process.env.LOCAL_MAIL_CORE_PORT ?? 8787),
  dataDir,
  dbPath: process.env.LOCAL_MAIL_DB_PATH ?? join(dataDir, 'mail.sqlite'),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    /** Loopback redirect for desktop/local apps */
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ??
      `http://127.0.0.1:${Number(process.env.LOCAL_MAIL_CORE_PORT ?? 8787)}/auth/gmail/callback`,
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid',
    ],
  },
  /** Where the browser UI lives (for CORS + post-auth redirect) */
  webOrigin: process.env.LOCAL_MAIL_WEB_ORIGIN ?? 'http://127.0.0.1:4200',
} as const;

export function googleConfigured(): boolean {
  return Boolean(appConfig.google.clientId && appConfig.google.clientSecret);
}

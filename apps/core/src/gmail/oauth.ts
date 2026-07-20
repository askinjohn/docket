import { google } from 'googleapis';

import { appConfig, googleConfigured } from '../config.js';
import { getDb, type AccountRow } from '../db/index.js';

export function createOAuthClient() {
  if (!googleConfigured()) {
    throw new Error(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/core/.env',
    );
  }
  return new google.auth.OAuth2(
    appConfig.google.clientId,
    appConfig.google.clientSecret,
    appConfig.google.redirectUri,
  );
}

export function getAuthUrl(state?: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...appConfig.google.scopes],
    state,
  });
}

export async function exchangeCode(code: string): Promise<AccountRow> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const me = await oauth2.userinfo.get();
  const email = me.data.email;
  if (!email) {
    throw new Error('Google account email missing from userinfo');
  }

  const now = Date.now();
  const expiry = tokens.expiry_date ?? null;
  const db = getDb();

  const existing = db
    .prepare(`SELECT id FROM accounts WHERE email = ?`)
    .get(email) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE accounts SET
        access_token = ?,
        refresh_token = COALESCE(?, refresh_token),
        token_expiry = ?,
        updated_at = ?
       WHERE id = ?`,
    ).run(
      tokens.access_token ?? null,
      tokens.refresh_token ?? null,
      expiry,
      now,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO accounts (
        email, provider, access_token, refresh_token, token_expiry, created_at, updated_at
      ) VALUES (?, 'gmail', ?, ?, ?, ?, ?)`,
    ).run(
      email,
      tokens.access_token ?? null,
      tokens.refresh_token ?? null,
      expiry,
      now,
      now,
    );
  }

  const row = db
    .prepare(`SELECT * FROM accounts WHERE email = ?`)
    .get(email) as AccountRow;

  // New or reconnected account becomes active
  db.prepare(
    `INSERT INTO meta(key, value) VALUES('active_account_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(row.id));

  return row;
}

export async function getAuthedClient(account: AccountRow) {
  const client = createOAuthClient();
  client.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.token_expiry ?? undefined,
  });

  client.on('tokens', (tokens) => {
    const now = Date.now();
    getDb()
      .prepare(
        `UPDATE accounts SET
          access_token = COALESCE(?, access_token),
          refresh_token = COALESCE(?, refresh_token),
          token_expiry = COALESCE(?, token_expiry),
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        tokens.access_token ?? null,
        tokens.refresh_token ?? null,
        tokens.expiry_date ?? null,
        now,
        account.id,
      );
  });

  return client;
}

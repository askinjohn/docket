import { google } from 'googleapis';

import { appConfig, googleConfigured } from '../config.js';
import {
  clearAccountAuthExpired,
  isAccountAuthExpired,
  markAccountAuthExpired,
} from '../db/accounts.js';
import { getDb, type AccountRow } from '../db/index.js';
import { getTokenStore } from '../secrets/token-store.js';
import { GmailAuthExpiredError, toGmailError } from './auth-errors.js';

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
  const store = getTokenStore();

  const existing = db
    .prepare(`SELECT id FROM accounts WHERE email = ?`)
    .get(email) as { id: number } | undefined;

  let accountId: number;

  if (existing) {
    accountId = existing.id;
    // Metadata only when using keychain; sqlite store writes tokens itself
    db.prepare(
      `UPDATE accounts SET token_expiry = ?, auth_status = 'ok', updated_at = ? WHERE id = ?`,
    ).run(expiry, now, accountId);
    clearAccountAuthExpired(accountId, db);
  } else {
    const info = db
      .prepare(
        `INSERT INTO accounts (
          email, provider, access_token, refresh_token, token_expiry, created_at, updated_at
        ) VALUES (?, 'gmail', NULL, NULL, ?, ?, ?)`,
      )
      .run(email, expiry, now, now);
    accountId = Number(info.lastInsertRowid);
  }

  await store.save(accountId, {
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    token_expiry: expiry,
  });

  const row = db
    .prepare(`SELECT * FROM accounts WHERE email = ?`)
    .get(email) as AccountRow;

  // New or reconnected account becomes active
  db.prepare(
    `INSERT INTO meta(key, value) VALUES('active_account_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(row.id));

  return hydrateAccountTokens(row);
}

/** Attach secrets from the configured token store onto an account row. */
export async function hydrateAccountTokens(
  account: AccountRow,
): Promise<AccountRow> {
  const tokens = await getTokenStore().load(account.id, {
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    token_expiry: account.token_expiry,
  });
  return {
    ...account,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: tokens.token_expiry,
  };
}

export async function getAuthedClient(account: AccountRow) {
  if (isAccountAuthExpired(account)) {
    throw new GmailAuthExpiredError();
  }

  const hydrated = await hydrateAccountTokens(account);
  if (!hydrated.refresh_token && !hydrated.access_token) {
    await markAccountAuthExpired(account.id);
    throw new GmailAuthExpiredError();
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: hydrated.access_token ?? undefined,
    refresh_token: hydrated.refresh_token ?? undefined,
    expiry_date: hydrated.token_expiry ?? undefined,
  });

  client.on('tokens', (tokens) => {
    void getTokenStore().save(account.id, {
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      token_expiry: tokens.expiry_date ?? null,
    });
  });

  // Force refresh now so callers get a clear auth_expired instead of mid-request 401s
  try {
    await client.getAccessToken();
  } catch (e) {
    const mapped = toGmailError(e);
    if (mapped instanceof GmailAuthExpiredError) {
      await markAccountAuthExpired(account.id);
    }
    throw mapped;
  }

  return client;
}

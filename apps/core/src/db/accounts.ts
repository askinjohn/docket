import { getDb, type AccountRow, type Db } from './index.js';

const ACTIVE_KEY = 'active_account_id';

function normalizeAccount(row: AccountRow): AccountRow {
  return {
    ...row,
    auth_status: row.auth_status === 'expired' ? 'expired' : 'ok',
  };
}

export function listAccounts(database: Db = getDb()): AccountRow[] {
  return (
    database
      .prepare(`SELECT * FROM accounts ORDER BY email ASC`)
      .all() as AccountRow[]
  ).map(normalizeAccount);
}

export function getAccountById(
  id: number,
  database: Db = getDb(),
): AccountRow | null {
  const row = database.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id) as
    | AccountRow
    | undefined;
  return row ? normalizeAccount(row) : null;
}

export function getActiveAccountId(database: Db = getDb()): number | null {
  const row = database
    .prepare(`SELECT value FROM meta WHERE key = ?`)
    .get(ACTIVE_KEY) as { value: string } | undefined;
  if (row?.value) {
    const id = Number(row.value);
    if (getAccountById(id, database)) return id;
  }
  const first = database
    .prepare(`SELECT id FROM accounts ORDER BY id ASC LIMIT 1`)
    .get() as { id: number } | undefined;
  return first?.id ?? null;
}

/** Active account for sync/list/send (replaces “primary only”). */
export function getActiveAccount(database: Db = getDb()): AccountRow | null {
  const id = getActiveAccountId(database);
  if (id == null) return null;
  return getAccountById(id, database);
}

export function setActiveAccountId(
  accountId: number,
  database: Db = getDb(),
): AccountRow {
  const account = getAccountById(accountId, database);
  if (!account) throw new Error('Account not found');
  database
    .prepare(
      `INSERT INTO meta(key, value) VALUES(?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(ACTIVE_KEY, String(accountId));
  return account;
}

export async function deleteAccount(
  accountId: number,
  database: Db = getDb(),
): Promise<void> {
  const account = getAccountById(accountId, database);
  if (!account) throw new Error('Account not found');

  // Drop OS secrets first (no-op for sqlite store)
  try {
    const { getTokenStore } = await import('../secrets/token-store.js');
    await getTokenStore().delete(accountId);
  } catch (e) {
    console.warn('[accounts] token store delete failed', e);
  }

  // Cascade threads/messages via FK if we delete account — messages reference account
  database.prepare(`DELETE FROM threads WHERE account_id = ?`).run(accountId);
  database.prepare(`DELETE FROM messages WHERE account_id = ?`).run(accountId);
  database.prepare(`DELETE FROM accounts WHERE id = ?`).run(accountId);

  const active = getActiveAccountId(database);
  if (active === accountId) {
    database.prepare(`DELETE FROM meta WHERE key = ?`).run(ACTIVE_KEY);
    const next = listAccounts(database)[0];
    if (next) setActiveAccountId(next.id, database);
  }
}

/** Gmail thread id scoped per account (avoids PK collisions). */
export function toLocalThreadId(accountId: number, gmailThreadId: string): string {
  if (gmailThreadId.includes(':') && gmailThreadId.startsWith(`${accountId}:`)) {
    return gmailThreadId;
  }
  // already composite for another form
  if (/^\d+:/.test(gmailThreadId)) return gmailThreadId;
  return `${accountId}:${gmailThreadId}`;
}

export function toGmailThreadId(localThreadId: string): string {
  const m = localThreadId.match(/^\d+:(.+)$/);
  return m ? m[1]! : localThreadId;
}

export function isAccountAuthExpired(account: AccountRow | null): boolean {
  return account?.auth_status === 'expired';
}

export function publicAccount(a: AccountRow) {
  return {
    id: a.id,
    email: a.email,
    provider: a.provider,
    authStatus: a.auth_status === 'expired' ? ('expired' as const) : ('ok' as const),
  };
}

/** Persist revoked-token state and drop secrets so we stop retrying Google. */
export async function markAccountAuthExpired(
  accountId: number,
  database: Db = getDb(),
): Promise<void> {
  const account = getAccountById(accountId, database);
  if (!account) return;

  const already = account.auth_status === 'expired';
  database
    .prepare(
      `UPDATE accounts
       SET auth_status = 'expired',
           access_token = NULL,
           refresh_token = NULL,
           token_expiry = NULL,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(Date.now(), accountId);

  try {
    const { getTokenStore } = await import('../secrets/token-store.js');
    await getTokenStore().delete(accountId);
  } catch (e) {
    console.warn('[accounts] token store delete on expiry failed', e);
  }

  if (!already) {
    const { publish } = await import('../events/bus.js');
    publish({
      type: 'auth.expired',
      email: account.email,
      at: new Date().toISOString(),
    });
    console.warn(
      `[auth] Gmail session expired for ${account.email} — waiting for sign-in`,
    );
  }
}

export function clearAccountAuthExpired(
  accountId: number,
  database: Db = getDb(),
): void {
  database
    .prepare(
      `UPDATE accounts SET auth_status = 'ok', updated_at = ? WHERE id = ?`,
    )
    .run(Date.now(), accountId);
}

/**
 * OAuth token storage backends.
 *
 * Configure via DOCKET_TOKEN_STORE (LOCAL_MAIL_TOKEN_STORE still accepted):
 * - sqlite   (default) — tokens in accounts table; easy clone / dogfood
 * - keychain — macOS Keychain / Windows Credential Manager / libsecret via keytar
 */

import { appConfig } from '../config.js';
import { getDb } from '../db/index.js';

export type TokenStoreMode = 'sqlite' | 'keychain';

export interface TokenBundle {
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: number | null;
}

export interface TokenStore {
  readonly mode: TokenStoreMode;
  /** Load tokens for an account (merge with row as needed). */
  load(accountId: number, row: TokenBundle): Promise<TokenBundle>;
  /** Persist tokens; sqlite mode writes columns, keychain writes OS secret store. */
  save(accountId: number, tokens: Partial<TokenBundle>): Promise<void>;
  /** Remove secrets when account is deleted. */
  delete(accountId: number): Promise<void>;
}

/** Stable Keychain service id — do not change (existing tokens live here). */
const KEYTAR_SERVICE = 'dev.localmail.core';

function keytarAccount(accountId: number): string {
  return `gmail-tokens:${accountId}`;
}

/** Tokens stay in SQLite `accounts` columns (clone-friendly default). */
class SqliteTokenStore implements TokenStore {
  readonly mode: TokenStoreMode = 'sqlite';

  async load(_accountId: number, row: TokenBundle): Promise<TokenBundle> {
    return {
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      token_expiry: row.token_expiry,
    };
  }

  async save(accountId: number, tokens: Partial<TokenBundle>): Promise<void> {
    const current = getDb()
      .prepare(
        `SELECT access_token, refresh_token, token_expiry FROM accounts WHERE id = ?`,
      )
      .get(accountId) as TokenBundle | undefined;
    if (!current) return;

    const next: TokenBundle = {
      access_token:
        tokens.access_token !== undefined
          ? tokens.access_token
          : current.access_token,
      refresh_token:
        tokens.refresh_token !== undefined
          ? tokens.refresh_token
          : current.refresh_token,
      token_expiry:
        tokens.token_expiry !== undefined
          ? tokens.token_expiry
          : current.token_expiry,
    };
    // Google often omits refresh_token on refresh — keep existing
    if (!next.refresh_token && current.refresh_token) {
      next.refresh_token = current.refresh_token;
    }

    getDb()
      .prepare(
        `UPDATE accounts SET
          access_token = ?,
          refresh_token = ?,
          token_expiry = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.access_token,
        next.refresh_token,
        next.token_expiry,
        Date.now(),
        accountId,
      );
  }

  async delete(_accountId: number): Promise<void> {
    /* row deletion handles columns */
  }
}

type KeytarApi = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

async function loadKeytar(): Promise<KeytarApi> {
  try {
    const mod = await import('keytar');
    const keytar =
      (mod as { default?: KeytarApi }).default ?? (mod as KeytarApi);
    if (!keytar?.getPassword || !keytar?.setPassword) {
      throw new Error('keytar module missing expected API');
    }
    return keytar;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `DOCKET_TOKEN_STORE=keychain requires the "keytar" package (OS secret store).\n` +
        `  cd apps/core && npm install keytar\n` +
        `  Or set DOCKET_TOKEN_STORE=sqlite in apps/core/.env for plaintext SQLite tokens.\n` +
        `  Detail: ${msg}`,
    );
  }
}

/**
 * Secrets in OS keychain. SQLite token columns are cleared so a copied
 * mail.sqlite does not contain refresh tokens.
 */
class KeychainTokenStore implements TokenStore {
  readonly mode: TokenStoreMode = 'keychain';
  private keytarPromise: Promise<KeytarApi> | null = null;

  private keytar(): Promise<KeytarApi> {
    if (!this.keytarPromise) this.keytarPromise = loadKeytar();
    return this.keytarPromise;
  }

  private async readKeychain(accountId: number): Promise<TokenBundle | null> {
    const keytar = await this.keytar();
    const raw = await keytar.getPassword(
      KEYTAR_SERVICE,
      keytarAccount(accountId),
    );
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as TokenBundle;
      return {
        access_token: parsed.access_token ?? null,
        refresh_token: parsed.refresh_token ?? null,
        token_expiry: parsed.token_expiry ?? null,
      };
    } catch {
      console.warn(
        `[token-store] corrupt keychain entry for account ${accountId}`,
      );
      return null;
    }
  }

  async load(accountId: number, row: TokenBundle): Promise<TokenBundle> {
    const fromChain = await this.readKeychain(accountId);
    if (fromChain) return fromChain;

    // One-time migrate: tokens still sitting in SQLite from a previous mode
    if (row.access_token || row.refresh_token) {
      const migrated: TokenBundle = {
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        token_expiry: row.token_expiry,
      };
      await this.writeKeychain(accountId, migrated);
      await this.clearSqliteSecrets(accountId);
      console.info(
        `[token-store] migrated account ${accountId} tokens from SQLite → keychain`,
      );
      return migrated;
    }

    return {
      access_token: null,
      refresh_token: null,
      token_expiry: null,
    };
  }

  async save(accountId: number, tokens: Partial<TokenBundle>): Promise<void> {
    const existing =
      (await this.readKeychain(accountId)) ??
      ({
        access_token: null,
        refresh_token: null,
        token_expiry: null,
      } satisfies TokenBundle);

    const next: TokenBundle = {
      access_token:
        tokens.access_token !== undefined
          ? tokens.access_token
          : existing.access_token,
      refresh_token:
        tokens.refresh_token !== undefined
          ? tokens.refresh_token
          : existing.refresh_token,
      token_expiry:
        tokens.token_expiry !== undefined
          ? tokens.token_expiry
          : existing.token_expiry,
    };
    if (!next.refresh_token && existing.refresh_token) {
      next.refresh_token = existing.refresh_token;
    }

    await this.writeKeychain(accountId, next);
    await this.clearSqliteSecrets(accountId);

    // Non-secret expiry hint on the row (optional, for debugging)
    if (next.token_expiry != null) {
      getDb()
        .prepare(
          `UPDATE accounts SET token_expiry = ?, updated_at = ? WHERE id = ?`,
        )
        .run(next.token_expiry, Date.now(), accountId);
    }
  }

  async delete(accountId: number): Promise<void> {
    try {
      const keytar = await this.keytar();
      await keytar.deletePassword(KEYTAR_SERVICE, keytarAccount(accountId));
    } catch (e) {
      console.warn(
        `[token-store] keychain delete failed for account ${accountId}`,
        e,
      );
    }
    await this.clearSqliteSecrets(accountId);
  }

  private async writeKeychain(
    accountId: number,
    bundle: TokenBundle,
  ): Promise<void> {
    const keytar = await this.keytar();
    await keytar.setPassword(
      KEYTAR_SERVICE,
      keytarAccount(accountId),
      JSON.stringify(bundle),
    );
  }

  private async clearSqliteSecrets(accountId: number): Promise<void> {
    getDb()
      .prepare(
        `UPDATE accounts SET access_token = NULL, refresh_token = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(Date.now(), accountId);
  }
}

let singleton: TokenStore | null = null;

export function getTokenStoreMode(): TokenStoreMode {
  return appConfig.tokenStore;
}

export function getTokenStore(): TokenStore {
  if (singleton) return singleton;
  singleton =
    appConfig.tokenStore === 'keychain'
      ? new KeychainTokenStore()
      : new SqliteTokenStore();
  return singleton;
}

/** Test helper */
export function resetTokenStoreForTests(): void {
  singleton = null;
}

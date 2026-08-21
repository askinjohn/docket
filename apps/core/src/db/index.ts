import Database from 'better-sqlite3';

import { appConfig } from '../config.js';
import { SCHEMA_SQL } from './schema.js';

export type Db = Database.Database;

let db: Db | null = null;

export function getDb(): Db {
  if (!db) {
    db = new Database(appConfig.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA_SQL);
    db.prepare(
      `INSERT INTO meta(key, value) VALUES('schema_version', '1')
       ON CONFLICT(key) DO NOTHING`,
    ).run();
    migrateCompositeThreadIds(db);
    ensureMailViewsTable(db);
    ensureAuthStatusColumn(db);
    ensureCcHeaderColumn(db);
    ensureBccHeaderColumn(db);
  }
  return db;
}

/** Idempotent for DBs created before accounts.auth_status existed. */
function ensureAuthStatusColumn(database: Db): void {
  const cols = database.prepare(`PRAGMA table_info(accounts)`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === 'auth_status')) {
    database.exec(
      `ALTER TABLE accounts ADD COLUMN auth_status TEXT NOT NULL DEFAULT 'ok'`,
    );
  }
}

/** Idempotent for DBs created before mail_views existed. */
function ensureCcHeaderColumn(database: Db): void {
  const cols = database.prepare(`PRAGMA table_info(messages)`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === 'cc_header')) {
    database.exec(
      `ALTER TABLE messages ADD COLUMN cc_header TEXT NOT NULL DEFAULT ''`,
    );
  }
}

function ensureBccHeaderColumn(database: Db): void {
  const cols = database.prepare(`PRAGMA table_info(messages)`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === 'bcc_header')) {
    database.exec(
      `ALTER TABLE messages ADD COLUMN bcc_header TEXT NOT NULL DEFAULT ''`,
    );
  }
}

function ensureMailViewsTable(database: Db): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS mail_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

/**
 * Prefix bare Gmail thread ids with accountId: for multi-account isolation.
 * Must disable FKs while rewriting PKs/FKs (SQLite cannot retarget children first).
 */
function migrateCompositeThreadIds(database: Db): void {
  const accounts = database
    .prepare(`SELECT id FROM accounts`)
    .all() as { id: number }[];
  if (!accounts.length) return;

  const bare = database
    .prepare(
      `SELECT id, account_id FROM threads WHERE id NOT LIKE '%:%'`,
    )
    .all() as { id: string; account_id: number }[];
  if (!bare.length) return;

  database.pragma('foreign_keys = OFF');
  try {
    const migrateOne = database.transaction(
      (oldId: string, accountId: number, next: string) => {
        // Copy thread row under new id, re-point messages, drop old row
        database
          .prepare(
            `INSERT OR IGNORE INTO threads (
              id, account_id, subject, snippet, from_name, from_email,
              last_message_at, unread, starred, has_attachments, label_ids, updated_at
            )
            SELECT ?, account_id, subject, snippet, from_name, from_email,
              last_message_at, unread, starred, has_attachments, label_ids, updated_at
            FROM threads WHERE id = ? AND account_id = ?`,
          )
          .run(next, oldId, accountId);

        database
          .prepare(`UPDATE messages SET thread_id = ? WHERE thread_id = ?`)
          .run(next, oldId);

        database
          .prepare(`DELETE FROM threads WHERE id = ? AND account_id = ?`)
          .run(oldId, accountId);
      },
    );

    for (const t of bare) {
      const next = `${t.account_id}:${t.id}`;
      try {
        migrateOne(t.id, t.account_id, next);
      } catch (e) {
        console.error(
          `[db] thread id migration failed for ${t.id} → ${next}`,
          e,
        );
      }
    }
  } finally {
    database.pragma('foreign_keys = ON');
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export interface AccountRow {
  id: number;
  email: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: number | null;
  history_id: string | null;
  /** `ok` | `expired` — expired means Google rejected the refresh token. */
  auth_status: 'ok' | 'expired';
  created_at: number;
  updated_at: number;
}

export interface ThreadRow {
  id: string;
  account_id: number;
  subject: string;
  snippet: string;
  from_name: string;
  from_email: string;
  last_message_at: number | null;
  unread: number;
  starred: number;
  has_attachments: number;
  label_ids: string;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  account_id: number;
  from_header: string;
  to_header: string;
  cc_header: string;
  bcc_header: string;
  subject: string;
  date_ms: number | null;
  snippet: string;
  body_text: string;
  body_html: string;
  label_ids: string;
  internal_date: number | null;
  raw_payload_json: string | null;
  updated_at: number;
}

export interface AttachmentRow {
  id: string;
  message_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  gmail_attachment_id: string | null;
  content_id: string | null;
  is_inline: number;
}

export {
  getActiveAccount,
  getActiveAccountId,
  listAccounts,
  setActiveAccountId,
  deleteAccount,
  toLocalThreadId,
  toGmailThreadId,
  publicAccount,
} from './accounts.js';

/** @deprecated use getActiveAccount */
export { getActiveAccount as getPrimaryAccount } from './accounts.js';

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
  }
  return db;
}

/** Prefix bare Gmail thread ids with accountId: for multi-account isolation. */
function migrateCompositeThreadIds(database: Db): void {
  const accounts = database
    .prepare(`SELECT id FROM accounts`)
    .all() as { id: number }[];
  if (!accounts.length) return;

  for (const a of accounts) {
    const bare = database
      .prepare(
        `SELECT id FROM threads WHERE account_id = ? AND id NOT LIKE ?`,
      )
      .all(a.id, `${a.id}:%`) as { id: string }[];
    for (const t of bare) {
      const next = `${a.id}:${t.id}`;
      database.transaction(() => {
        database
          .prepare(`UPDATE messages SET thread_id = ? WHERE thread_id = ?`)
          .run(next, t.id);
        database
          .prepare(`UPDATE threads SET id = ? WHERE id = ? AND account_id = ?`)
          .run(next, t.id, a.id);
      })();
    }
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

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
  }
  return db;
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

export function getPrimaryAccount(database: Db = getDb()): AccountRow | null {
  return (
    database
      .prepare(`SELECT * FROM accounts ORDER BY id ASC LIMIT 1`)
      .get() as AccountRow | undefined
  ) ?? null;
}

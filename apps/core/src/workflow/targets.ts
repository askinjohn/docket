import { getActiveAccount } from '../db/accounts.js';
import { getDb, type MessageRow, type ThreadRow } from '../db/index.js';
import type { MailTarget } from './match.js';

function parseLabels(raw: string): string[] {
  try {
    const v = JSON.parse(raw || '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function toTarget(row: ThreadRow, bodyPreview: string): MailTarget {
  return {
    id: row.id,
    fromName: row.from_name,
    fromEmail: row.from_email,
    subject: row.subject,
    snippet: row.snippet,
    unread: Boolean(row.unread),
    hasAttachments: Boolean(row.has_attachments),
    labelIds: parseLabels(row.label_ids),
    bodyPreview,
    lastMessageAt: row.last_message_at ?? null,
  };
}

export function loadTarget(threadId: string): MailTarget | null {
  const account = getActiveAccount();
  if (!account) return null;
  const row = getDb()
    .prepare(`SELECT * FROM threads WHERE id = ? AND account_id = ?`)
    .get(threadId, account.id) as ThreadRow | undefined;
  if (!row) return null;
  const msg = getDb()
    .prepare(
      `SELECT body_text, snippet FROM messages WHERE thread_id = ? ORDER BY internal_date DESC LIMIT 1`,
    )
    .get(threadId) as Pick<MessageRow, 'body_text' | 'snippet'> | undefined;
  return toTarget(row, (msg?.body_text || msg?.snippet || '').slice(0, 1500));
}

export function loadInboxTargets(limit = 120): MailTarget[] {
  const account = getActiveAccount();
  if (!account) return [];
  const rows = getDb()
    .prepare(
      `SELECT * FROM threads
       WHERE account_id = ?
         AND (label_ids LIKE '%INBOX%' OR label_ids = '[]')
       ORDER BY last_message_at DESC
       LIMIT ?`,
    )
    .all(account.id, limit) as ThreadRow[];
  return rows.map((row) => {
    const msg = getDb()
      .prepare(
        `SELECT body_text, snippet FROM messages WHERE thread_id = ? ORDER BY internal_date DESC LIMIT 1`,
      )
      .get(row.id) as Pick<MessageRow, 'body_text' | 'snippet'> | undefined;
    return toTarget(row, (msg?.body_text || msg?.snippet || '').slice(0, 1500));
  });
}

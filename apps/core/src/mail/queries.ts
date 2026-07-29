import { getActiveAccount } from '../db/accounts.js';
import {
  getDb,
  type AttachmentRow,
  type MessageRow,
  type ThreadRow,
} from '../db/index.js';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindFromMime(mime: string, filename: string): 'pdf' | 'image' | 'doc' | 'other' {
  if (mime.includes('pdf') || filename.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('word') || filename.match(/\.docx?$/i)) return 'doc';
  return 'other';
}

function formatTime(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function listThreads(options?: {
  q?: string;
  view?: 'inbox' | 'starred' | 'all';
}) {
  const account = getActiveAccount();
  if (!account) return { account: null, threads: [] as unknown[] };

  const view = options?.view ?? 'inbox';
  const q = (options?.q ?? '').trim().toLowerCase();

  let rows: ThreadRow[];
  if (view === 'starred') {
    rows = getDb()
      .prepare(
        `SELECT * FROM threads WHERE account_id = ? AND starred = 1
         ORDER BY last_message_at DESC LIMIT 250`,
      )
      .all(account.id) as ThreadRow[];
  } else if (view === 'all') {
    rows = getDb()
      .prepare(
        `SELECT * FROM threads WHERE account_id = ?
         ORDER BY last_message_at DESC LIMIT 250`,
      )
      .all(account.id) as ThreadRow[];
  } else {
    rows = getDb()
      .prepare(
        `SELECT * FROM threads
         WHERE account_id = ?
           AND (label_ids LIKE '%INBOX%' OR label_ids = '[]')
         ORDER BY last_message_at DESC
         LIMIT 250`,
      )
      .all(account.id) as ThreadRow[];
    if (!rows.length) {
      rows = getDb()
        .prepare(
          `SELECT * FROM threads WHERE account_id = ? ORDER BY last_message_at DESC LIMIT 250`,
        )
        .all(account.id) as ThreadRow[];
    }
  }

  if (q) {
    rows = rows.filter((t) => {
      const hay = `${t.subject} ${t.snippet} ${t.from_name} ${t.from_email}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const threads = rows.map((t) => ({
    id: t.id,
    from: t.from_name || t.from_email || 'Unknown',
    subject: t.subject || '(no subject)',
    snippet: t.snippet,
    time: formatTime(t.last_message_at),
    unread: Boolean(t.unread),
    starred: Boolean(t.starred),
    hasAttachments: Boolean(t.has_attachments),
  }));

  return {
    account: { id: account.id, email: account.email },
    threads,
  };
}

export function getThreadDetail(threadId: string) {
  const account = getActiveAccount();
  if (!account) return null;

  const thread = getDb()
    .prepare(`SELECT * FROM threads WHERE id = ? AND account_id = ?`)
    .get(threadId, account.id) as ThreadRow | undefined;
  if (!thread) return null;

  const messages = getDb()
    .prepare(
      `SELECT * FROM messages WHERE thread_id = ? ORDER BY internal_date ASC`,
    )
    .all(threadId) as MessageRow[];

  const attStmt = getDb().prepare(
    `SELECT * FROM attachments WHERE message_id = ? AND is_inline = 0`,
  );

  return {
    id: thread.id,
    subject: thread.subject || '(no subject)',
    from: thread.from_name || thread.from_email,
    time: formatTime(thread.last_message_at),
    unread: Boolean(thread.unread),
    messages: messages.map((m) => {
      const atts = attStmt.all(m.id) as AttachmentRow[];
      return {
        id: m.id,
        from: m.from_header,
        to: m.to_header,
        time: formatTime(m.internal_date ?? m.date_ms),
        body: m.body_text || m.snippet || stripHtml(m.body_html),
        bodyHtml: m.body_html,
        attachments: atts.map((a) => ({
          id: a.id,
          name: a.filename || 'attachment',
          sizeLabel: formatSize(a.size_bytes),
          kind: kindFromMime(a.mime_type, a.filename),
          mimeType: a.mime_type,
        })),
      };
    }),
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ContactSuggestion {
  email: string;
  name: string;
  /** How often this address appears in cached mail (higher = more relevant). */
  hits: number;
}

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/gi;

/** Pull display name + email from a From/To header fragment. */
function parseAddressToken(token: string): { name: string; email: string } | null {
  const raw = token.trim();
  if (!raw) return null;
  const angle = raw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+@[^>]+)>$/);
  if (angle) {
    const email = angle[2]!.trim().toLowerCase();
    const name = (angle[1] ?? '').trim().replace(/^["']|["']$/g, '');
    return { email, name: name || email.split('@')[0] || email };
  }
  const bare = raw.match(/^[\w.+-]+@[\w.-]+\.\w+$/i);
  if (bare) {
    const email = bare[0].toLowerCase();
    return { email, name: email.split('@')[0] || email };
  }
  // Fallback: first email-looking token in the string
  const found = raw.match(EMAIL_RE);
  if (found?.[0]) {
    const email = found[0].toLowerCase();
    return { email, name: email.split('@')[0] || email };
  }
  return null;
}

/**
 * Contact suggestions from mail history already in SQLite
 * (from_header / to_header on cached messages — no Gmail Contacts API).
 */
export function suggestContacts(query: string, limit = 8): ContactSuggestion[] {
  const account = getActiveAccount();
  if (!account) return [];

  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];

  const rows = getDb()
    .prepare(
      `SELECT from_header, to_header FROM messages
       WHERE account_id = ?
       ORDER BY internal_date DESC
       LIMIT 800`,
    )
    .all(account.id) as { from_header: string; to_header: string }[];

  const me = account.email.toLowerCase();
  const map = new Map<string, ContactSuggestion>();

  const ingest = (header: string) => {
    if (!header) return;
    // Split on commas outside of angle brackets (simple: split by ,)
    for (const part of header.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
      const parsed = parseAddressToken(part);
      if (!parsed) continue;
      if (parsed.email === me) continue;
      const existing = map.get(parsed.email);
      if (existing) {
        existing.hits += 1;
        // Prefer a non-email-looking display name when we see one
        if (
          parsed.name &&
          parsed.name.includes(' ') &&
          !existing.name.includes(' ')
        ) {
          existing.name = parsed.name;
        }
      } else {
        map.set(parsed.email, {
          email: parsed.email,
          name: parsed.name,
          hits: 1,
        });
      }
    }
  };

  for (const row of rows) {
    ingest(row.from_header);
    ingest(row.to_header);
  }

  // Also harvest thread-level from fields
  const threadRows = getDb()
    .prepare(
      `SELECT from_name, from_email FROM threads
       WHERE account_id = ?
       ORDER BY last_message_at DESC
       LIMIT 200`,
    )
    .all(account.id) as { from_name: string; from_email: string }[];

  for (const t of threadRows) {
    const email = (t.from_email || '').trim().toLowerCase();
    if (!email || !email.includes('@') || email === me) continue;
    const name = (t.from_name || '').trim() || email.split('@')[0] || email;
    const existing = map.get(email);
    if (existing) {
      existing.hits += 1;
      if (name && name.includes(' ') && !existing.name.includes(' ')) {
        existing.name = name;
      }
    } else {
      map.set(email, { email, name, hits: 1 });
    }
  }

  const matches = [...map.values()].filter((c) => {
    return (
      c.email.includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.email.split('@')[0]?.includes(q)
    );
  });

  matches.sort((a, b) => {
    // Prefix match on email/local-part ranks higher
    const aPref =
      a.email.startsWith(q) || a.name.toLowerCase().startsWith(q) ? 1 : 0;
    const bPref =
      b.email.startsWith(q) || b.name.toLowerCase().startsWith(q) ? 1 : 0;
    if (bPref !== aPref) return bPref - aPref;
    if (b.hits !== a.hits) return b.hits - a.hits;
    return a.email.localeCompare(b.email);
  });

  return matches.slice(0, Math.min(limit, 20));
}

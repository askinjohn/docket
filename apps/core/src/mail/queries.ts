import {
  getDb,
  getPrimaryAccount,
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
  const account = getPrimaryAccount();
  if (!account) return { account: null, threads: [] as unknown[] };

  const view = options?.view ?? 'inbox';
  const q = (options?.q ?? '').trim().toLowerCase();

  let rows: ThreadRow[];
  if (view === 'starred') {
    rows = getDb()
      .prepare(
        `SELECT * FROM threads WHERE account_id = ? AND starred = 1
         ORDER BY last_message_at DESC LIMIT 100`,
      )
      .all(account.id) as ThreadRow[];
  } else if (view === 'all') {
    rows = getDb()
      .prepare(
        `SELECT * FROM threads WHERE account_id = ?
         ORDER BY last_message_at DESC LIMIT 100`,
      )
      .all(account.id) as ThreadRow[];
  } else {
    rows = getDb()
      .prepare(
        `SELECT * FROM threads
         WHERE account_id = ?
           AND (label_ids LIKE '%INBOX%' OR label_ids = '[]')
         ORDER BY last_message_at DESC
         LIMIT 100`,
      )
      .all(account.id) as ThreadRow[];
    if (!rows.length) {
      rows = getDb()
        .prepare(
          `SELECT * FROM threads WHERE account_id = ? ORDER BY last_message_at DESC LIMIT 100`,
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
  const account = getPrimaryAccount();
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

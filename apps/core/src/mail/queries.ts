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

/** Compact relative-ish labels for the dense thread list. */
function formatTime(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff >= 0 && diff < 45_000) return 'now';
  if (diff >= 0 && diff < 3_600_000) {
    return `${Math.max(1, Math.floor(diff / 60_000))}m`;
  }
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (diff >= 0 && diff < 7 * 86_400_000) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export type ThreadListView =
  | 'inbox'
  | 'starred'
  | 'all'
  | 'sent'
  | 'label';

export function listThreads(options?: {
  q?: string;
  view?: ThreadListView;
  /** Gmail label id when view === 'label' (e.g. CATEGORY_UPDATES, Label_12). */
  label?: string;
}) {
  const account = getActiveAccount();
  if (!account) return { account: null, threads: [] as unknown[] };

  const view = options?.view ?? 'inbox';
  const q = (options?.q ?? '').trim().toLowerCase();
  const label = (options?.label ?? '').trim();

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
  } else if (view === 'sent') {
    rows = getDb()
      .prepare(
        `SELECT * FROM threads
         WHERE account_id = ?
           AND label_ids LIKE '%SENT%'
         ORDER BY last_message_at DESC LIMIT 250`,
      )
      .all(account.id) as ThreadRow[];
  } else if (view === 'label' && label) {
    // label_ids stored as JSON array text — substring match is good enough for Gmail ids
    rows = getDb()
      .prepare(
        `SELECT * FROM threads
         WHERE account_id = ?
           AND label_ids LIKE ?
         ORDER BY last_message_at DESC LIMIT 250`,
      )
      .all(account.id, `%${label}%`) as ThreadRow[];
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

/** Labels seen in the local cache for the active account (plus common system ones). */
export function listLabels(): {
  id: string;
  name: string;
  system: boolean;
  count: number;
}[] {
  const account = getActiveAccount();
  if (!account) return [];

  const counts = new Map<string, number>();
  const rows = getDb()
    .prepare(`SELECT label_ids FROM threads WHERE account_id = ?`)
    .all(account.id) as { label_ids: string }[];

  for (const row of rows) {
    let ids: string[] = [];
    try {
      ids = JSON.parse(row.label_ids || '[]') as string[];
    } catch {
      ids = [];
    }
    for (const id of ids) {
      if (!id || id === 'UNREAD') continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const systemNames: Record<string, string> = {
    INBOX: 'Inbox',
    STARRED: 'Starred',
    SENT: 'Sent',
    DRAFT: 'Drafts',
    TRASH: 'Trash',
    SPAM: 'Spam',
    IMPORTANT: 'Important',
    CATEGORY_PERSONAL: 'Personal',
    CATEGORY_SOCIAL: 'Social',
    CATEGORY_PROMOTIONS: 'Promotions',
    CATEGORY_UPDATES: 'Updates',
    CATEGORY_FORUMS: 'Forums',
  };

  const out: { id: string; name: string; system: boolean; count: number }[] =
    [];
  for (const [id, count] of counts) {
    const system = Boolean(systemNames[id]) || id.startsWith('CATEGORY_');
    out.push({
      id,
      name: systemNames[id] ?? (id.startsWith('Label_') ? id : id),
      system,
      count,
    });
  }

  out.sort((a, b) => {
    if (a.system !== b.system) return a.system ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
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

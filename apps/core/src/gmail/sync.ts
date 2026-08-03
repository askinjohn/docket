import { google, type gmail_v1 } from 'googleapis';

import { getActiveAccount, toGmailThreadId, toLocalThreadId } from '../db/accounts.js';
import {
  getDb,
  type AccountRow,
  type AttachmentRow,
  type MessageRow,
  type ThreadRow,
} from '../db/index.js';
import { publish } from '../events/bus.js';
import { getAuthedClient } from './oauth.js';

function decodeBody(data?: string | null): string {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function parseFrom(header?: string): { name: string; email: string } {
  if (!header) return { name: '', email: '' };
  const match = header.match(/^(?:"?([^"]*)"?\s)?<?([^\s>]+@[^>]+)>?$/);
  if (match) {
    return {
      name: (match[1] ?? '').trim() || (match[2] ?? ''),
      email: match[2] ?? '',
    };
  }
  return { name: header, email: header };
}

function headerMap(headers: gmail_v1.Schema$MessagePartHeader[] | undefined) {
  const map = new Map<string, string>();
  for (const h of headers ?? []) {
    if (h.name && h.value) map.set(h.name.toLowerCase(), h.value);
  }
  return map;
}

function collectParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  acc: {
    text: string;
    html: string;
    attachments: Omit<AttachmentRow, 'message_id'>[];
  },
  messageId: string,
): void {
  if (!part) return;
  const mime = part.mimeType ?? '';
  const headers = headerMap(part.headers);
  const rawCid = headers.get('content-id') ?? null;
  const contentId = rawCid
    ? rawCid.replace(/^<|>$/g, '').trim() || null
    : null;
  const disposition = (headers.get('content-disposition') ?? '').toLowerCase();
  const filename =
    part.filename ||
    disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1]?.trim() ||
    '';

  // Inline images often have Content-ID + attachmentId (and sometimes no filename)
  if (part.body?.attachmentId && (filename || contentId || mime.startsWith('image/'))) {
    const isInline =
      disposition.includes('inline') ||
      Boolean(contentId && (mime.startsWith('image/') || !disposition.includes('attachment')));
    acc.attachments.push({
      id: `${messageId}:${part.body.attachmentId}`,
      filename: filename || (contentId ? `inline-${contentId.slice(0, 12)}` : 'attachment'),
      mime_type: mime || 'application/octet-stream',
      size_bytes: part.body.size ?? 0,
      gmail_attachment_id: part.body.attachmentId,
      content_id: contentId,
      is_inline: isInline ? 1 : 0,
    });
  }
  if (mime === 'text/plain' && part.body?.data) {
    acc.text += decodeBody(part.body.data);
  }
  if (mime === 'text/html' && part.body?.data) {
    acc.html += decodeBody(part.body.data);
  }
  for (const child of part.parts ?? []) {
    collectParts(child, acc, messageId);
  }
}

function upsertThreadAndMessages(
  account: AccountRow,
  thread: gmail_v1.Schema$Thread,
): void {
  const db = getDb();
  const now = Date.now();
  const gmailThreadId = thread.id;
  if (!gmailThreadId) return;
  const threadId = toLocalThreadId(account.id, gmailThreadId);

  const messages = thread.messages ?? [];
  if (!messages.length) return;

  let unread = 0;
  let starred = 0;
  let hasAttachments = 0;
  let lastAt = 0;
  let subject = '';
  let snippet = '';
  let fromName = '';
  let fromEmail = '';
  const labelSet = new Set<string>();

  const insertMessage = db.prepare(
    `INSERT INTO messages (
      id, thread_id, account_id, from_header, to_header, subject, date_ms,
      snippet, body_text, body_html, label_ids, internal_date, raw_payload_json, updated_at
    ) VALUES (
      @id, @thread_id, @account_id, @from_header, @to_header, @subject, @date_ms,
      @snippet, @body_text, @body_html, @label_ids, @internal_date, @raw_payload_json, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      from_header = excluded.from_header,
      to_header = excluded.to_header,
      subject = excluded.subject,
      date_ms = excluded.date_ms,
      snippet = excluded.snippet,
      body_text = excluded.body_text,
      body_html = excluded.body_html,
      label_ids = excluded.label_ids,
      internal_date = excluded.internal_date,
      updated_at = excluded.updated_at`,
  );

  const deleteAtt = db.prepare(`DELETE FROM attachments WHERE message_id = ?`);
  const insertAtt = db.prepare(
    `INSERT INTO attachments (
      id, message_id, filename, mime_type, size_bytes, gmail_attachment_id, content_id, is_inline
    ) VALUES (
      @id, @message_id, @filename, @mime_type, @size_bytes, @gmail_attachment_id, @content_id, @is_inline
    )`,
  );

  const upsertThread = db.prepare(
    `INSERT INTO threads (
      id, account_id, subject, snippet, from_name, from_email,
      last_message_at, unread, starred, has_attachments, label_ids, updated_at
    ) VALUES (
      @id, @account_id, @subject, @snippet, @from_name, @from_email,
      @last_message_at, @unread, @starred, @has_attachments, @label_ids, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      subject = excluded.subject,
      snippet = excluded.snippet,
      from_name = excluded.from_name,
      from_email = excluded.from_email,
      last_message_at = excluded.last_message_at,
      unread = excluded.unread,
      starred = excluded.starred,
      has_attachments = excluded.has_attachments,
      label_ids = excluded.label_ids,
      updated_at = excluded.updated_at`,
  );

  const tx = db.transaction(() => {
    // Parent thread first — messages.thread_id FK requires this row to exist
    upsertThread.run({
      id: threadId,
      account_id: account.id,
      subject: '',
      snippet: '',
      from_name: '',
      from_email: '',
      last_message_at: now,
      unread: 0,
      starred: 0,
      has_attachments: 0,
      label_ids: '[]',
      updated_at: now,
    });

    for (const msg of messages) {
      if (!msg.id) continue;
      const headers = headerMap(msg.payload?.headers);
      const from = headers.get('from') ?? '';
      const to = headers.get('to') ?? '';
      const subj = headers.get('subject') ?? '';
      const dateHeader = headers.get('date');
      const dateMs = dateHeader ? Date.parse(dateHeader) || null : null;
      const labels = msg.labelIds ?? [];
      if (labels.includes('UNREAD')) unread = 1;
      if (labels.includes('STARRED')) starred = 1;
      for (const l of labels) labelSet.add(l);

      const bodies = {
        text: '',
        html: '',
        attachments: [] as Omit<AttachmentRow, 'message_id'>[],
      };
      collectParts(msg.payload ?? undefined, bodies, msg.id);
      if (bodies.attachments.length) hasAttachments = 1;

      const internal = msg.internalDate
        ? Number(msg.internalDate)
        : (dateMs ?? now);
      if (internal > lastAt) {
        lastAt = internal;
        subject = subj || subject;
        snippet = msg.snippet ?? snippet;
        const parsed = parseFrom(from);
        fromName = parsed.name;
        fromEmail = parsed.email;
      }

      insertMessage.run({
        id: msg.id,
        thread_id: threadId,
        account_id: account.id,
        from_header: from,
        to_header: to,
        subject: subj,
        date_ms: dateMs,
        snippet: msg.snippet ?? '',
        body_text: bodies.text,
        body_html: bodies.html,
        label_ids: JSON.stringify(labels),
        internal_date: internal,
        raw_payload_json: null,
        updated_at: now,
      });

      deleteAtt.run(msg.id);
      for (const att of bodies.attachments) {
        insertAtt.run({
          id: att.id,
          message_id: msg.id,
          filename: att.filename,
          mime_type: att.mime_type,
          size_bytes: att.size_bytes,
          gmail_attachment_id: att.gmail_attachment_id,
          content_id: att.content_id,
          is_inline: att.is_inline,
        });
      }
    }

    upsertThread.run({
      id: threadId,
      account_id: account.id,
      subject,
      snippet,
      from_name: fromName,
      from_email: fromEmail,
      last_message_at: lastAt || now,
      unread,
      starred,
      has_attachments: hasAttachments,
      label_ids: JSON.stringify([...labelSet]),
      updated_at: now,
    });
  });

  tx();
}

const INBOX_PAGE_TOKEN_KEY = 'inbox_list_page_token';
const SEARCH_PAGE_TOKEN_KEY = 'search_list_page_token';
const SEARCH_QUERY_KEY = 'search_list_query';

/** Whether Gmail has another inbox page after the last full/more sync. */
export function inboxHasMorePages(): boolean {
  const row = getDb()
    .prepare(`SELECT value FROM meta WHERE key = ?`)
    .get(INBOX_PAGE_TOKEN_KEY) as { value: string } | undefined;
  return Boolean(row?.value);
}

export function searchHasMorePages(): boolean {
  const row = getDb()
    .prepare(`SELECT value FROM meta WHERE key = ?`)
    .get(SEARCH_PAGE_TOKEN_KEY) as { value: string } | undefined;
  return Boolean(row?.value);
}

function setMeta(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO meta(key, value) VALUES(?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

function getMeta(key: string): string | null {
  const row = getDb()
    .prepare(`SELECT value FROM meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value || null;
}

export interface NewMailNotice {
  threadId: string;
  messageId: string;
  from: string;
  subject: string;
  snippet: string;
}

export async function syncInbox(options?: {
  maxThreads?: number;
  /** Continue from Gmail page token (load more). */
  more?: boolean;
  /**
   * Emit mail.new for messages that were not in SQLite and are recent.
   * Off for first OAuth bulk pull / load-more to avoid spam.
   */
  notifyRecent?: boolean;
}): Promise<{
  synced: number;
  email: string;
  nextPageToken: string | null;
  hasMore: boolean;
  newMail: NewMailNotice[];
}> {
  const account = getActiveAccount();
  if (!account) {
    throw new Error('No Gmail account connected');
  }

  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });
  const maxThreads = Math.min(Math.max(options?.maxThreads ?? 100, 1), 100);

  let pageToken: string | undefined;
  if (options?.more) {
    const row = getDb()
      .prepare(`SELECT value FROM meta WHERE key = ?`)
      .get(INBOX_PAGE_TOKEN_KEY) as { value: string } | undefined;
    pageToken = row?.value || undefined;
    if (!pageToken) {
      return {
        synced: 0,
        email: account.email,
        nextPageToken: null,
        hasMore: false,
        newMail: [],
      };
    }
  }

  const list = await gmail.users.threads.list({
    userId: 'me',
    q: 'in:inbox',
    maxResults: maxThreads,
    pageToken,
  });

  const refs = list.data.threads ?? [];
  let synced = 0;
  const freshMessages: { messageId: string; gmailThreadId: string }[] = [];
  const existsStmt = getDb().prepare(`SELECT 1 AS ok FROM messages WHERE id = ?`);

  for (const ref of refs) {
    if (!ref.id) continue;
    const full = await gmail.users.threads.get({
      userId: 'me',
      id: ref.id,
      format: 'full',
    });
    if (full.data) {
      if (options?.notifyRecent) {
        for (const m of full.data.messages ?? []) {
          if (!m.id) continue;
          const known = existsStmt.get(m.id) as { ok: number } | undefined;
          if (!known) {
            freshMessages.push({
              messageId: m.id,
              gmailThreadId: ref.id,
            });
          }
        }
      }
      upsertThreadAndMessages(account, full.data);
      synced += 1;
    }
  }

  let newMail: NewMailNotice[] = [];
  if (options?.notifyRecent && freshMessages.length) {
    // Only ping for mail from the last 6 hours (avoids backlog spam)
    newMail = publishNewMailEvents(account, freshMessages, {
      maxAgeMs: 6 * 60 * 60 * 1000,
    });
  }

  const nextPageToken = list.data.nextPageToken ?? null;
  setMeta(INBOX_PAGE_TOKEN_KEY, nextPageToken ?? '');

  const profile = await gmail.users.getProfile({ userId: 'me' });
  if (profile.data.historyId) {
    getDb()
      .prepare(`UPDATE accounts SET history_id = ?, updated_at = ? WHERE id = ?`)
      .run(profile.data.historyId, Date.now(), account.id);
  }

  return {
    synced,
    email: account.email,
    nextPageToken,
    hasMore: Boolean(nextPageToken),
    newMail,
  };
}

/**
 * Search Gmail (full query language), pull matching threads into SQLite.
 * Supports paging via `more: true` using the last search query/token.
 */
export async function searchGmail(options: {
  q: string;
  maxResults?: number;
  more?: boolean;
}): Promise<{
  synced: number;
  email: string;
  query: string;
  hasMore: boolean;
  nextPageToken: string | null;
}> {
  const account = getActiveAccount();
  if (!account) throw new Error('No Gmail account connected');

  let q = options.q.trim();
  let pageToken: string | undefined;

  if (options.more) {
    const savedQ = getMeta(SEARCH_QUERY_KEY);
    const savedTok = getMeta(SEARCH_PAGE_TOKEN_KEY);
    if (!savedQ || !savedTok) {
      return {
        synced: 0,
        email: account.email,
        query: savedQ ?? q,
        hasMore: false,
        nextPageToken: null,
      };
    }
    q = savedQ;
    pageToken = savedTok;
  } else {
    if (!q) throw new Error('search query required');
    setMeta(SEARCH_QUERY_KEY, q);
    setMeta(SEARCH_PAGE_TOKEN_KEY, '');
  }

  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });
  const maxResults = Math.min(Math.max(options.maxResults ?? 40, 1), 100);

  const list = await gmail.users.threads.list({
    userId: 'me',
    q,
    maxResults,
    pageToken,
  });

  const refs = list.data.threads ?? [];
  let synced = 0;

  for (const ref of refs) {
    if (!ref.id) continue;
    try {
      const full = await gmail.users.threads.get({
        userId: 'me',
        id: ref.id,
        format: 'full',
      });
      if (full.data) {
        upsertThreadAndMessages(account, full.data);
        synced += 1;
      }
    } catch (e) {
      console.warn('[search] thread fetch failed', ref.id, e);
    }
  }

  const nextPageToken = list.data.nextPageToken ?? null;
  setMeta(SEARCH_PAGE_TOKEN_KEY, nextPageToken ?? '');
  setMeta(SEARCH_QUERY_KEY, q);

  console.info(
    `[search] q="${q}" synced=${synced} hasMore=${Boolean(nextPageToken)}`,
  );

  return {
    synced,
    email: account.email,
    query: q,
    hasMore: Boolean(nextPageToken),
    nextPageToken,
  };
}

/** Re-download one thread from Gmail into SQLite (when local messages are missing). */
export async function hydrateThreadFromGmail(threadId: string): Promise<boolean> {
  const account = getActiveAccount();
  if (!account) return false;
  const gmailId = toGmailThreadId(threadId);
  try {
    const auth = await getAuthedClient(account);
    const gmail = google.gmail({ version: 'v1', auth });
    const full = await gmail.users.threads.get({
      userId: 'me',
      id: gmailId,
      format: 'full',
    });
    if (!full.data) return false;
    upsertThreadAndMessages(account, full.data);
    return true;
  } catch (e) {
    console.warn('[hydrate] failed for', threadId, e);
    return false;
  }
}

export async function modifyThreadLabels(
  threadId: string,
  add: string[],
  remove: string[],
): Promise<void> {
  const account = getActiveAccount();
  if (!account) throw new Error('No Gmail account connected');

  const gmailId = toGmailThreadId(threadId);
  const localId = toLocalThreadId(account.id, gmailId);

  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.threads.modify({
    userId: 'me',
    id: gmailId,
    requestBody: {
      addLabelIds: add,
      removeLabelIds: remove,
    },
  });

  if (remove.includes('INBOX')) {
    getDb().prepare(`DELETE FROM threads WHERE id = ?`).run(localId);
    return;
  }

  const full = await gmail.users.threads.get({
    userId: 'me',
    id: gmailId,
    format: 'full',
  });
  if (full.data) {
    upsertThreadAndMessages(account, full.data);
  }
}

function encodeRawMime(raw: string): string {
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface OutboundAttachment {
  filename: string;
  mimeType: string;
  /** Standard base64 of file bytes (not URL-safe). */
  contentBase64: string;
}

function chunkBase64(b64: string): string {
  const clean = b64.replace(/\s/g, '');
  return clean.match(/.{1,76}/g)?.join('\r\n') ?? clean;
}

/** Build a plain or multipart/mixed RFC822 message. */
export function buildMimeMessage(opts: {
  headerLines: string[];
  bodyText: string;
  attachments?: OutboundAttachment[];
}): string {
  const headers = [...opts.headerLines];
  const atts = opts.attachments?.filter((a) => a.filename && a.contentBase64) ?? [];

  if (!atts.length) {
    return [
      ...headers,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      opts.bodyText,
    ].join('\r\n');
  }

  const boundary = `local_mail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const parts: string[] = [
    ...headers,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    opts.bodyText,
  ];

  for (const att of atts) {
    const name = att.filename.replace(/[\r\n"]/g, '_');
    const mime = (att.mimeType || 'application/octet-stream').replace(
      /[\r\n]/g,
      '',
    );
    parts.push(
      `--${boundary}`,
      `Content-Type: ${mime}; name="${name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${name}"`,
      '',
      chunkBase64(att.contentBase64),
    );
  }
  parts.push(`--${boundary}--`, '');
  return parts.join('\r\n');
}

export async function sendReply(input: {
  threadId: string;
  bodyText: string;
  to?: string;
  subject?: string;
  attachments?: OutboundAttachment[];
}): Promise<{ id: string }> {
  const account = getActiveAccount();
  if (!account) throw new Error('No Gmail account connected');

  const db = getDb();
  const last = db
    .prepare(
      `SELECT * FROM messages WHERE thread_id = ? ORDER BY internal_date DESC LIMIT 1`,
    )
    .get(input.threadId) as
    | {
        id: string;
        from_header: string;
        subject: string;
      }
    | undefined;

  if (!last) throw new Error('Thread not found locally — sync first');

  const gmailThreadId = toGmailThreadId(input.threadId);
  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });

  const meta = await gmail.users.messages.get({
    userId: 'me',
    id: last.id,
    format: 'metadata',
    metadataHeaders: ['Message-ID', 'References', 'Subject', 'From'],
  });
  const hmap = new Map<string, string>();
  for (const h of meta.data.payload?.headers ?? []) {
    if (h.name && h.value) hmap.set(h.name.toLowerCase(), h.value);
  }

  const to = input.to ?? last.from_header;
  const subject =
    input.subject ??
    (last.subject.toLowerCase().startsWith('re:')
      ? last.subject
      : `Re: ${last.subject}`);

  const messageId = hmap.get('message-id') ?? `<${last.id}@mail.gmail.com>`;
  const references = [hmap.get('references'), messageId].filter(Boolean).join(' ');

  const raw = buildMimeMessage({
    headerLines: [
      `To: ${to}`,
      `Subject: ${subject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${references}`,
    ],
    bodyText: input.bodyText,
    attachments: input.attachments,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodeRawMime(raw),
      threadId: gmailThreadId,
    },
  });

  const full = await gmail.users.threads.get({
    userId: 'me',
    id: gmailThreadId,
    format: 'full',
  });
  if (full.data) upsertThreadAndMessages(account, full.data);

  return { id: res.data.id ?? '' };
}

export async function sendNewMessage(input: {
  to: string;
  subject: string;
  bodyText: string;
  cc?: string;
  attachments?: OutboundAttachment[];
}): Promise<{ id: string }> {
  const account = getActiveAccount();
  if (!account) throw new Error('No Gmail account connected');
  if (!input.to.trim()) throw new Error('to required');

  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });

  const headerLines = [
    `To: ${input.to.trim()}`,
    input.cc?.trim() ? `Cc: ${input.cc.trim()}` : null,
    `Subject: ${input.subject || '(no subject)'}`,
  ].filter((h): h is string => Boolean(h));

  const raw = buildMimeMessage({
    headerLines,
    bodyText: input.bodyText,
    attachments: input.attachments,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodeRawMime(raw) },
  });

  return { id: res.data.id ?? '' };
}

/** Incremental sync using Gmail history when possible. */
export async function syncIncremental(options?: {
  maxThreads?: number;
  more?: boolean;
}): Promise<{
  synced: number;
  email: string;
  mode: 'history' | 'full';
  hasMore?: boolean;
  nextPageToken?: string | null;
  newMail: NewMailNotice[];
}> {
  // Explicit "load more" always uses paged full inbox pull
  if (options?.more) {
    const full = await syncInbox({
      maxThreads: options.maxThreads ?? 100,
      more: true,
    });
    return {
      synced: full.synced,
      email: full.email,
      mode: 'full',
      hasMore: full.hasMore,
      nextPageToken: full.nextPageToken,
      newMail: full.newMail,
    };
  }
  const account = getActiveAccount();
  if (!account) throw new Error('No Gmail account connected');

  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });

  if (account.history_id) {
    try {
      const hist = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: account.history_id,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
        maxResults: 100,
      });

      const threadIds = new Set<string>();
      /** Messages not yet in SQLite — candidates for mail.new notifications. */
      const freshMessages: { messageId: string; gmailThreadId: string }[] = [];
      const existsStmt = getDb().prepare(`SELECT 1 AS ok FROM messages WHERE id = ?`);

      for (const h of hist.data.history ?? []) {
        for (const m of h.messagesAdded ?? []) {
          if (m.message?.threadId) threadIds.add(m.message.threadId);
          if (m.message?.id && m.message.threadId) {
            const known = existsStmt.get(m.message.id) as { ok: number } | undefined;
            if (!known) {
              freshMessages.push({
                messageId: m.message.id,
                gmailThreadId: m.message.threadId,
              });
            }
          }
        }
        for (const m of h.messagesDeleted ?? []) {
          if (m.message?.id) {
            getDb().prepare(`DELETE FROM messages WHERE id = ?`).run(m.message.id);
          }
        }
        for (const m of h.labelsRemoved ?? []) {
          if (m.message?.threadId && m.labelIds?.includes('INBOX')) {
            getDb()
              .prepare(`DELETE FROM threads WHERE id = ?`)
              .run(toLocalThreadId(account.id, m.message.threadId));
          }
        }
        for (const m of h.labelsAdded ?? []) {
          if (m.message?.threadId) threadIds.add(m.message.threadId);
        }
      }

      let synced = 0;
      for (const tid of threadIds) {
        try {
          const full = await gmail.users.threads.get({
            userId: 'me',
            id: tid, // Gmail id
            format: 'full',
          });
          if (full.data) {
            upsertThreadAndMessages(account, full.data);
            synced += 1;
          }
        } catch {
          /* thread may be gone */
        }
      }

      const newMail = publishNewMailEvents(account, freshMessages);

      const profile = await gmail.users.getProfile({ userId: 'me' });
      if (profile.data.historyId) {
        getDb()
          .prepare(`UPDATE accounts SET history_id = ?, updated_at = ? WHERE id = ?`)
          .run(profile.data.historyId, Date.now(), account.id);
      }

      return { synced, email: account.email, mode: 'history', newMail };
    } catch (e) {
      console.warn('[sync] history failed, falling back to full', e);
    }
  }

  // History unavailable — full pull, but still notify on recent new messages
  const full = await syncInbox({
    ...options,
    more: false,
    notifyRecent: true,
  });
  return {
    synced: full.synced,
    email: full.email,
    mode: 'full' as const,
    hasMore: full.hasMore,
    nextPageToken: full.nextPageToken,
    newMail: full.newMail,
  };
}

/**
 * Emit mail.new for freshly arrived inbox messages.
 * Returns the list so HTTP sync can notify the UI even if SSE is down.
 */
function publishNewMailEvents(
  account: AccountRow,
  fresh: { messageId: string; gmailThreadId: string }[],
  opts?: { maxAgeMs?: number },
): NewMailNotice[] {
  if (!fresh.length) return [];

  const me = account.email.toLowerCase();
  const msgStmt = getDb().prepare(`SELECT * FROM messages WHERE id = ?`);
  const thrStmt = getDb().prepare(`SELECT * FROM threads WHERE id = ?`);
  const seenThreads = new Set<string>();
  const emitted: NewMailNotice[] = [];
  const cap = 8;
  const maxAge = opts?.maxAgeMs;
  const now = Date.now();

  for (const item of fresh) {
    if (emitted.length >= cap) break;
    const localThreadId = toLocalThreadId(account.id, item.gmailThreadId);
    // One notification per thread in a single sync burst
    if (seenThreads.has(localThreadId)) continue;

    const msg = msgStmt.get(item.messageId) as MessageRow | undefined;
    const thr = thrStmt.get(localThreadId) as ThreadRow | undefined;
    if (!msg || !thr) {
      console.warn(
        `[sync] mail.new skip: missing row msg=${item.messageId} thr=${localThreadId}`,
      );
      continue;
    }

    const labels = thr.label_ids || '';
    if (!labels.includes('INBOX') && labels !== '[]') {
      console.info(`[sync] mail.new skip non-inbox ${localThreadId}`);
      continue;
    }

    if (maxAge != null) {
      const ts = msg.internal_date ?? msg.date_ms ?? thr.last_message_at ?? 0;
      if (ts > 0 && now - ts > maxAge) {
        continue;
      }
    }

    const fromLower = (msg.from_header || '').toLowerCase();
    const toLower = (msg.to_header || '').toLowerCase();
    const fromIsMe = addressMentionsEmail(fromLower, me);
    const toIsMe = addressMentionsEmail(toLower, me);
    // Outbound to someone else (including replies) — do not notify
    if (fromIsMe && !toIsMe) {
      console.info(`[sync] mail.new skip outbound ${msg.subject}`);
      continue;
    }

    const from =
      thr.from_name ||
      thr.from_email ||
      msg.from_header ||
      'New mail';
    const subject = thr.subject || msg.subject || '(no subject)';
    const snippet = thr.snippet || msg.snippet || '';

    console.info(
      `[sync] mail.new → ${from} / ${subject} (${localThreadId})`,
    );
    const notice: NewMailNotice = {
      threadId: localThreadId,
      messageId: item.messageId,
      from,
      subject,
      snippet,
    };
    publish({
      type: 'mail.new',
      ...notice,
      at: new Date().toISOString(),
    });
    seenThreads.add(localThreadId);
    emitted.push(notice);
  }
  return emitted;
}

/** True if a From/To header mentions this email (bare or Name <email>). */
function addressMentionsEmail(headerLower: string, emailLower: string): boolean {
  if (!headerLower || !emailLower) return false;
  if (headerLower.includes(`<${emailLower}>`)) return true;
  if (headerLower === emailLower) return true;
  // bare email somewhere in the header
  return new RegExp(
    `(^|[\\s,<])${emailLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s,>])`,
  ).test(headerLower);
}

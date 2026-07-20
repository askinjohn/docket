import { google, type gmail_v1 } from 'googleapis';

import { getActiveAccount, toGmailThreadId, toLocalThreadId } from '../db/accounts.js';
import {
  getDb,
  type AccountRow,
  type AttachmentRow,
} from '../db/index.js';
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
  if (part.filename && part.body?.attachmentId) {
    acc.attachments.push({
      id: `${messageId}:${part.body.attachmentId}`,
      filename: part.filename,
      mime_type: mime || 'application/octet-stream',
      size_bytes: part.body.size ?? 0,
      gmail_attachment_id: part.body.attachmentId,
      content_id: null,
      is_inline: 0,
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

export async function syncInbox(options?: {
  maxThreads?: number;
}): Promise<{ synced: number; email: string }> {
  const account = getActiveAccount();
  if (!account) {
    throw new Error('No Gmail account connected');
  }

  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });
  const maxThreads = options?.maxThreads ?? 30;

  const list = await gmail.users.threads.list({
    userId: 'me',
    q: 'in:inbox',
    maxResults: maxThreads,
  });

  const refs = list.data.threads ?? [];
  let synced = 0;

  for (const ref of refs) {
    if (!ref.id) continue;
    const full = await gmail.users.threads.get({
      userId: 'me',
      id: ref.id,
      format: 'full',
    });
    if (full.data) {
      upsertThreadAndMessages(account, full.data);
      synced += 1;
    }
  }

  const profile = await gmail.users.getProfile({ userId: 'me' });
  if (profile.data.historyId) {
    getDb()
      .prepare(`UPDATE accounts SET history_id = ?, updated_at = ? WHERE id = ?`)
      .run(profile.data.historyId, Date.now(), account.id);
  }

  return { synced, email: account.email };
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

export async function sendReply(input: {
  threadId: string;
  bodyText: string;
  to?: string;
  subject?: string;
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

  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${references}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    input.bodyText,
  ].join('\r\n');

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
}): Promise<{ id: string }> {
  const account = getActiveAccount();
  if (!account) throw new Error('No Gmail account connected');
  if (!input.to.trim()) throw new Error('to required');

  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });

  const raw = [
    `To: ${input.to.trim()}`,
    `Subject: ${input.subject || '(no subject)'}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    input.bodyText,
  ].join('\r\n');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodeRawMime(raw) },
  });

  return { id: res.data.id ?? '' };
}

/** Incremental sync using Gmail history when possible. */
export async function syncIncremental(options?: {
  maxThreads?: number;
}): Promise<{ synced: number; email: string; mode: 'history' | 'full' }> {
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
      for (const h of hist.data.history ?? []) {
        for (const m of h.messagesAdded ?? []) {
          if (m.message?.threadId) threadIds.add(m.message.threadId);
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

      // purge local threads for deleted inbox labels using composite ids
      // (handled per-event above with gmail ids — fix deletes to use local ids)


      const profile = await gmail.users.getProfile({ userId: 'me' });
      if (profile.data.historyId) {
        getDb()
          .prepare(`UPDATE accounts SET history_id = ?, updated_at = ? WHERE id = ?`)
          .run(profile.data.historyId, Date.now(), account.id);
      }

      return { synced, email: account.email, mode: 'history' };
    } catch (e) {
      console.warn('[sync] history failed, falling back to full', e);
    }
  }

  const full = await syncInbox(options);
  return { ...full, mode: 'full' };
}

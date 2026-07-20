import { google, type gmail_v1 } from 'googleapis';

import {
  getDb,
  getPrimaryAccount,
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
  const threadId = thread.id;
  if (!threadId) return;

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

  const tx = db.transaction(() => {
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

      const bodies = { text: '', html: '', attachments: [] as Omit<AttachmentRow, 'message_id'>[] };
      collectParts(msg.payload ?? undefined, bodies, msg.id);
      if (bodies.attachments.length) hasAttachments = 1;

      const internal = msg.internalDate ? Number(msg.internalDate) : dateMs ?? now;
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

    db.prepare(
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
    ).run({
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
  const account = getPrimaryAccount();
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
  const account = getPrimaryAccount();
  if (!account) throw new Error('No Gmail account connected');

  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: {
      addLabelIds: add,
      removeLabelIds: remove,
    },
  });

  if (remove.includes('INBOX')) {
    // Drop from local inbox cache (messages cascade)
    getDb().prepare(`DELETE FROM threads WHERE id = ?`).run(threadId);
    return;
  }

  const full = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });
  if (full.data) {
    upsertThreadAndMessages(account, full.data);
  }
}

export async function sendReply(input: {
  threadId: string;
  bodyText: string;
  to?: string;
  subject?: string;
}): Promise<{ id: string }> {
  const account = getPrimaryAccount();
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

  const to = input.to ?? last.from_header;
  const subject =
    input.subject ??
    (last.subject.toLowerCase().startsWith('re:')
      ? last.subject
      : `Re: ${last.subject}`);

  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${last.id}`,
    `References: ${last.id}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    input.bodyText,
  ].join('\r\n');

  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId: input.threadId,
    },
  });

  // Pull thread again
  const full = await gmail.users.threads.get({
    userId: 'me',
    id: input.threadId,
    format: 'full',
  });
  if (full.data) upsertThreadAndMessages(account, full.data);

  return { id: res.data.id ?? '' };
}

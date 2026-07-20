import { google } from 'googleapis';

import { getDb, type AttachmentRow } from '../db/index.js';
import { getAuthedClient } from './oauth.js';
import { getActiveAccount } from '../db/accounts.js';

export async function downloadAttachment(attachmentRowId: string): Promise<{
  filename: string;
  mimeType: string;
  data: Buffer;
}> {
  const account = getActiveAccount();
  if (!account) throw new Error('No Gmail account connected');

  const row = getDb()
    .prepare(`SELECT * FROM attachments WHERE id = ?`)
    .get(attachmentRowId) as AttachmentRow | undefined;

  if (!row?.gmail_attachment_id) {
    throw new Error('Attachment not found');
  }

  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });

  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: row.message_id,
    id: row.gmail_attachment_id,
  });

  const b64 = res.data.data;
  if (!b64) throw new Error('Empty attachment data from Gmail');

  const data = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return {
    filename: row.filename || 'attachment',
    mimeType: row.mime_type || 'application/octet-stream',
    data,
  };
}

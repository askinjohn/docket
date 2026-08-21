import { google } from 'googleapis';

import { getActiveAccount } from '../db/accounts.js';
import { getAuthedClient } from './oauth.js';

const nameToId = new Map<string, string>();
const idToName = new Map<string, string>();

export function labelDisplayName(id: string): string | undefined {
  return idToName.get(id);
}

export function knownLabelNames(): { id: string; name: string }[] {
  return [...idToName.entries()].map(([id, name]) => ({ id, name }));
}

export async function refreshLabelDirectory(): Promise<Map<string, string>> {
  const account = getActiveAccount();
  if (!account) return idToName;
  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });
  const listed = await gmail.users.labels.list({ userId: 'me' });
  nameToId.clear();
  idToName.clear();
  for (const lab of listed.data.labels ?? []) {
    if (!lab.id || !lab.name) continue;
    nameToId.set(lab.name.toLowerCase(), lab.id);
    idToName.set(lab.id, lab.name);
  }
  return idToName;
}

/** Resolve or create a user-visible Gmail label by display name. */
export async function ensureUserLabel(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Label name required');
  const key = trimmed.toLowerCase();
  await refreshLabelDirectory();
  const existing = nameToId.get(key);
  if (existing) return existing;

  const account = getActiveAccount();
  if (!account) throw new Error('No Gmail account connected');
  const auth = await getAuthedClient(account);
  const gmail = google.gmail({ version: 'v1', auth });

  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: trimmed,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });
  const id = created.data.id;
  if (!id) throw new Error(`Failed to create label ${trimmed}`);
  nameToId.set(key, id);
  idToName.set(id, trimmed);
  return id;
}

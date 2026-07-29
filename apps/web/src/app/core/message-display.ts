import { formatPlainBody, prefersHtml } from './email-body';
import type { ShellMessage } from './ui-shell.service';

/** Strip tags for plain-text fallback when bodyHtml is the only source. */
export function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function messageUsesHtml(msg: ShellMessage): boolean {
  return prefersHtml(msg.bodyHtml);
}

/** True when From matches the active Gmail account (sent by you). */
export function isMine(msg: ShellMessage, accountEmail: string | null): boolean {
  const me = accountEmail?.toLowerCase().trim();
  if (!me) return false;
  const from = (msg.from || '').toLowerCase();
  if (from.includes(`<${me}>`)) return true;
  if (from === me) return true;
  const m = from.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return m?.[0] === me;
}

export function messagePlainText(msg: ShellMessage): string {
  const raw = msg.body?.trim() ? msg.body : stripTags(msg.bodyHtml || '');
  return formatPlainBody(raw);
}

export function iconForAttachment(kind: string): string {
  switch (kind) {
    case 'pdf':
      return '📕';
    case 'image':
      return '🖼️';
    case 'doc':
      return '📘';
    default:
      return '📎';
  }
}

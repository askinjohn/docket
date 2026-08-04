import {
  formatPlainBody,
  prefersHtml,
  stripEmailSignature,
  stripQuotedReplyHtml,
  stripQuotedReplyPlain,
} from './email-body';
import type { ShellMessage } from './ui-shell.service';

/** Decode common HTML entities for chat plain text. */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

/** Strip tags for plain-text fallback when bodyHtml is the only source. */
export function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );
}

export function messageUsesHtml(msg: ShellMessage): boolean {
  return prefersHtml(msg.bodyHtml);
}

/** True when From matches the active Gmail account (sent by you). */
export function isMine(msg: ShellMessage, accountEmail: string | null): boolean {
  const me = accountEmail?.toLowerCase().trim();
  if (!me) return false;
  const from = (msg.from || '').toLowerCase().trim();
  if (!from) return false;
  if (from === me) return true;
  if (from.includes(`<${me}>`)) return true;
  // "Name me@mail.com" without angle brackets
  if (from.includes(me)) return true;
  const emails = from.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
  return emails.some((e) => e === me);
}

export function messagePlainText(msg: ShellMessage, opts?: { full?: boolean }): string {
  // Prefer HTML→text after quote strip when HTML exists (body often still has full quote chain)
  let raw: string;
  if (msg.bodyHtml?.trim()) {
    const html = opts?.full
      ? msg.bodyHtml
      : stripQuotedReplyHtml(msg.bodyHtml);
    raw = stripTags(html);
  } else {
    raw = msg.body?.trim() ? msg.body : '';
  }
  let text = formatPlainBody(raw);
  if (!opts?.full) {
    text = stripQuotedReplyPlain(text);
    text = stripEmailSignature(text);
  }
  return text;
}

/** Display HTML for a card — quotes stripped unless full history requested. */
export function messageDisplayHtml(
  msg: ShellMessage,
  opts?: { full?: boolean },
): string {
  const html = msg.bodyHtml || '';
  if (opts?.full) return html;
  return stripQuotedReplyHtml(html);
}

/** How to render a message body inside the chat stream. */
export type ChatBodyMode = 'plain' | 'rich' | 'iframe';

/**
 * Pick render path:
 * - plain: short prose (clean chat)
 * - rich: code / tables / images in-bubble (sanitized HTML)
 * - iframe: heavy marketing HTML only
 */
export function chatBodyMode(msg: ShellMessage): ChatBodyMode {
  if (!messageUsesHtml(msg)) return 'plain';

  const html = stripQuotedReplyHtml(msg.bodyHtml || '');
  const tableCount = (html.match(/<table[\s>]/gi) || []).length;
  const imgCount = (html.match(/<img[\s>]/gi) || []).length;
  const hasCode = /<(pre|code)[\s>]/i.test(html);
  const hasList = /<(ul|ol)[\s>]/i.test(html);
  const heavyWidth =
    /width\s*=\s*["']?(6|7|8|9)\d{2}/i.test(html) && tableCount >= 2;

  // Newsletters / complex layouts
  if (tableCount >= 3 || imgCount >= 5 || heavyWidth) return 'iframe';

  // Structured content worth preserving in the bubble
  if (hasCode || tableCount >= 1) return 'rich';
  if (imgCount >= 2) return 'rich';
  if (imgCount === 1 && hasList) return 'rich';

  // Single logo + prose → plain chat
  const plain = messagePlainText(msg, { full: false });
  if (/\n\s*>/.test(plain) || /wrote:\s*\n/i.test(plain)) {
    // quote strip failed — still try rich (sanitized) over dump
    return hasCode || tableCount > 0 || imgCount > 0 ? 'rich' : 'plain';
  }
  if (plain.trim().length >= 8 && plain.trim().length <= 8000) return 'plain';

  // Short image-only / HTML fragment
  if (imgCount >= 1) return 'rich';
  return plain.trim().length > 0 ? 'plain' : 'rich';
}

/** @deprecated use chatBodyMode(msg) === 'plain' */
export function preferChatPlain(msg: ShellMessage): boolean {
  return chatBodyMode(msg) === 'plain';
}

/** First letter for chat avatar. */
export function messageAvatarLetter(
  msg: ShellMessage,
  accountEmail: string | null,
): string {
  if (isMine(msg, accountEmail)) return 'Y';
  const from = msg.from || '?';
  const m = from.match(/([A-Za-z0-9])/);
  return (m?.[1] || '?').toUpperCase();
}

/** Short display name for chat meta line. */
export function messageDisplayName(
  msg: ShellMessage,
  accountEmail: string | null,
): string {
  if (isMine(msg, accountEmail)) return 'You';
  const from = (msg.from || 'Unknown').trim();
  const angle = from.match(/^"?([^"<]+)"?\s*</);
  if (angle?.[1]?.trim()) return angle[1].trim();
  return from;
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

import type { WorkflowMatcher } from './catalog.js';

export interface MailTarget {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  unread: boolean;
  hasAttachments: boolean;
  labelIds: string[];
  bodyPreview: string;
  lastMessageAt: number | null;
}

export function matches(target: MailTarget, matcher?: WorkflowMatcher): boolean {
  if (!matcher) return true;
  const from = `${target.fromName} ${target.fromEmail}`.toLowerCase();
  const subject = (target.subject || '').toLowerCase();
  const hay =
    `${from} ${subject} ${target.snippet} ${target.bodyPreview}`.toLowerCase();
  const labels = target.labelIds.map((l) => l.toLowerCase());

  if (matcher.fromIncludes?.length) {
    const ok = matcher.fromIncludes.some((s) => from.includes(s.toLowerCase()));
    if (!ok) return false;
  }
  if (matcher.subjectIncludes?.length) {
    const ok = matcher.subjectIncludes.some((s) =>
      subject.includes(s.toLowerCase()),
    );
    if (!ok) return false;
  }
  if (matcher.query?.trim()) {
    const tokens = matcher.query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!tokens.every((t) => hay.includes(t))) return false;
  }
  if (matcher.hasAttachment != null && matcher.hasAttachment !== target.hasAttachments) {
    return false;
  }
  if (matcher.unread != null && matcher.unread !== target.unread) {
    return false;
  }
  if (matcher.labelIncludes?.length) {
    const ok = matcher.labelIncludes.some((s) =>
      labels.some((l) => l.includes(s.toLowerCase())),
    );
    if (!ok) return false;
  }
  if (matcher.maxAgeDays != null) {
    const ts = target.lastMessageAt;
    if (!ts) return false;
    const cutoff = Date.now() - matcher.maxAgeDays * 86_400_000;
    if (ts < cutoff) return false;
  }
  return true;
}

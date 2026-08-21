export interface MailAddress {
  name: string;
  email: string;
  display: string;
}

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSameMailbox(a: string, b: string | null | undefined): boolean {
  if (!b) return false;
  return normalizeEmail(a) === normalizeEmail(b);
}

export function parseAddressList(header: string | null | undefined): MailAddress[] {
  const raw = (header || '').trim();
  if (!raw) return [];
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of raw) {
    if (ch === '<') depth += 1;
    if (ch === '>') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);

  const out: MailAddress[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const p = part.trim().replace(/\s+/g, ' ');
    if (!p) continue;
    const angle = p.match(/^(.*?)<([^>]+)>/);
    let email = '';
    let name = '';
    if (angle) {
      name = angle[1]!.replace(/^["']|["']$/g, '').trim();
      email = angle[2]!.trim();
    } else {
      const m = p.match(EMAIL_RE);
      email = m ? m[0] : '';
      name = email ? p.replace(email, '').trim() : p;
    }
    if (!email) continue;
    const key = normalizeEmail(email);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      email,
      display: name || email,
    });
  }
  return out;
}

export function uniqueAddresses(
  lists: (string | null | undefined)[],
): MailAddress[] {
  const seen = new Set<string>();
  const out: MailAddress[] = [];
  for (const h of lists) {
    for (const a of parseAddressList(h)) {
      const key = normalizeEmail(a.email);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

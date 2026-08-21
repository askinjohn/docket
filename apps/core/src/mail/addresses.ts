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

/** Parse a From/To/Cc header into addresses. */
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
    const display = name ? `${name} <${email}>` : email;
    out.push({ name, email, display });
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

export function formatAddressList(addrs: MailAddress[]): string {
  return addrs.map((a) => a.display).join(', ');
}

/** Reply-all To/Cc from the last message. Drops `me`. */
export function replyAllTargets(
  last: { from: string; to: string; cc?: string },
  me: string | null,
): { to: string; cc: string } {
  const from = parseAddressList(last.from);
  const toList = parseAddressList(last.to);
  const ccList = parseAddressList(last.cc);
  const others = uniqueAddresses([last.from, last.to, last.cc]).filter(
    (a) => !isSameMailbox(a.email, me),
  );
  if (!others.length) {
    return { to: last.from || last.to, cc: '' };
  }
  const fromMe = from.some((a) => isSameMailbox(a.email, me));
  if (fromMe) {
    const primary = toList.filter((a) => !isSameMailbox(a.email, me));
    const rest = others.filter(
      (a) => !primary.some((p) => normalizeEmail(p.email) === normalizeEmail(a.email)),
    );
    return {
      to: formatAddressList(primary.length ? primary : others.slice(0, 1)),
      cc: formatAddressList(rest),
    };
  }
  const to = from.length ? from : others.slice(0, 1);
  const toKeys = new Set(to.map((a) => normalizeEmail(a.email)));
  const cc = others.filter((a) => !toKeys.has(normalizeEmail(a.email)));
  return { to: formatAddressList(to), cc: formatAddressList(cc) };
}

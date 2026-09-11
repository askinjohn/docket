/**
 * Display-only split of in-body reply quotes (`On … wrote:` + `>` lines).
 * Same idea as forwarded-mail: one Gmail message, nested letters in an accordion.
 */

export interface QuotedBlock {
  from?: string;
  date?: string;
  body: string;
}

export interface QuotedView {
  intro: string;
  blocks: QuotedBlock[];
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<blockquote[^>]*>/gi, '\n> ')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Strip one or more leading `>` quote markers. */
export function unwrapQuotePrefix(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^[ \t]*>[ \t]?/g, '').replace(/^[ \t]*>[ \t]?/g, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .trim();
}

function stripAllQuoteMarks(text: string): string {
  let prev = '';
  let out = text;
  while (out !== prev) {
    prev = out;
    out = out
      .split('\n')
      .map((line) => line.replace(/^[ \t]*>[ \t]?/, ''))
      .join('\n');
  }
  return out.replace(/^\n+/, '').trim();
}

function parseOnWroteHeader(raw: string): { from?: string; date?: string } {
  const header = stripAllQuoteMarks(raw)
    .replace(/\s+/g, ' ')
    .replace(/\s*wrote:\s*$/i, '')
    .trim();
  const on = header.replace(/^On\s+/i, '');
  const angle = on.match(/<([^>]+)>/);
  const email = angle?.[1]?.trim();
  const beforeAngle = on.replace(/<[^>]+>/, '').trim().replace(/,\s*$/, '');
  // Gmail: "Thu, 26 Mar 2026 at 12:32, Asaph Abraham"
  const lastComma = beforeAngle.lastIndexOf(',');
  let date: string | undefined;
  let name = beforeAngle;
  if (lastComma > 8) {
    date = beforeAngle.slice(0, lastComma).trim();
    name = beforeAngle.slice(lastComma + 1).trim();
  }
  const from = [name, email ? `<${email}>` : ''].filter(Boolean).join(' ');
  return { from: from || undefined, date };
}

const ON_WROTE_RE =
  /(?:^|\n)((?:[ \t]*>[ \t]*)*)On\s[\s\S]{5,500}?wrote:[ \t]*(?=\n|$)/gi;

export function splitQuotedMail(opts: {
  text?: string;
  html?: string;
}): QuotedView | null {
  const blob = (opts.text ?? '').trim() || (opts.html ? htmlToText(opts.html) : '');
  if (!blob) return null;

  const source = blob.replace(/\r\n/g, '\n');
  const hits: { start: number; end: number; header: string }[] = [];
  const re = new RegExp(ON_WROTE_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    hits.push({
      start: m.index + (m[0].startsWith('\n') ? 1 : 0),
      end: m.index + m[0].length,
      header: m[0].replace(/^\n/, ''),
    });
  }
  if (!hits.length) return null;

  const intro = source.slice(0, hits[0]!.start).trim();
  const blocks: QuotedBlock[] = [];
  for (let i = 0; i < hits.length; i++) {
    const from = hits[i]!.end;
    const to = i + 1 < hits.length ? hits[i + 1]!.start : source.length;
    const rawBody = source.slice(from, to);
    const meta = parseOnWroteHeader(hits[i]!.header);
    const body = stripAllQuoteMarks(rawBody);
    if (!meta.from && !body) continue;
    blocks.push({ ...meta, body });
  }
  if (!blocks.length) return null;
  // Need some new content, or it's the whole mail as a quote dump
  return { intro, blocks };
}

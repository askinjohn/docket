/**
 * Display-only split of a single Gmail message that *contains* other mail
 * (Fwd / Outlook “Original Message” / rasterized image00N.png).
 * Does not invent extra Gmail threads.
 */

export interface ForwardedBlock {
  from?: string;
  to?: string;
  cc?: string;
  date?: string;
  subject?: string;
  body: string;
}

export interface ForwardedImage {
  id: string;
  name: string;
}

export interface ForwardedView {
  intro: string;
  blocks: ForwardedBlock[];
  images: ForwardedImage[];
}

const FWD_SUBJECT = /^\s*(?:fwd|fw|fw\.|vs|tr|wg)\s*:/i;

const FWD_SPLIT =
  /(?:^|\n)[ \t]*(?:-{3,}\s*)?(?:Forwarded message|Original Message)(?:\s*-{3,})?[ \t]*(?:\n|$)|(?:^|\n)[ \t]*Begin forwarded message:?[ \t]*(?:\n|$)/gi;

const OUTLOOK_IMAGE = /^image0*\d+\.(png|jpe?g|gif|bmp|tiff?)$/i;

export function isOutlookForwardImageName(name: string): boolean {
  return OUTLOOK_IMAGE.test((name || '').trim());
}

export function looksLikeForward(opts: {
  subject?: string;
  text?: string;
  html?: string;
}): boolean {
  if (FWD_SUBJECT.test(opts.subject ?? '')) return true;
  const blob = `${opts.text ?? ''}\n${opts.html ?? ''}`;
  if (
    /forwarded message|begin forwarded message|-----original message-----/i.test(
      blob,
    )
  ) {
    return true;
  }
  if (/divRplyFwdMsg|gmail_forward/i.test(opts.html ?? '')) return true;
  return false;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function parseHeaderChunk(chunk: string): ForwardedBlock {
  const lines = chunk.replace(/\r\n/g, '\n').split('\n');
  const headers: Record<string, string> = {};
  let field: string | null = null;
  let i = 0;

  const mapKey = (raw: string): string => {
    const k = raw.toLowerCase();
    if (k === 'sent' || k === 'datum' || k === 'date') return 'date';
    return k;
  };

  while (i < lines.length) {
    const line = lines[i]!;
    const header = line.match(
      /^(From|To|Cc|Bcc|Subject|Date|Sent|Datum)\s*:\s*(.*)$/i,
    );
    if (header) {
      field = mapKey(header[1]!);
      headers[field] = header[2]!.trim();
      i += 1;
      continue;
    }
    if (field && /^\s+\S/.test(line) && i < 12) {
      headers[field] = `${headers[field]} ${line.trim()}`.trim();
      i += 1;
      continue;
    }
    break;
  }
  while (i < lines.length && !lines[i]!.trim()) i += 1;
  const body = lines.slice(i).join('\n').trim();
  return {
    from: headers['from'] || undefined,
    to: headers['to'] || undefined,
    cc: headers['cc'] || undefined,
    date: headers['date'] || undefined,
    subject: headers['subject'] || undefined,
    body,
  };
}

function splitByForwardMarkers(text: string): {
  intro: string;
  chunks: string[];
} {
  const source = text.replace(/\r\n/g, '\n');
  const chunks: string[] = [];
  let intro = source;
  const re = new RegExp(FWD_SPLIT.source, 'gi');
  const hits: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    hits.push({ start: m.index, end: m.index + m[0].length });
  }
  if (!hits.length) return { intro: source.trim(), chunks: [] };

  intro = source.slice(0, hits[0]!.start).trim();
  for (let i = 0; i < hits.length; i++) {
    const from = hits[i]!.end;
    const to = i + 1 < hits.length ? hits[i + 1]!.start : source.length;
    const piece = source.slice(from, to).trim();
    if (piece) chunks.push(piece);
  }
  return { intro, chunks };
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function outlookImages(
  attachments: { id: string; name: string }[],
): ForwardedImage[] {
  return attachments
    .filter((a) => isOutlookForwardImageName(a.name))
    .map((a) => ({ id: a.id, name: a.name }));
}

/**
 * Returns a forward view, or null if this is a normal message / reply.
 */
export function splitForwardedMail(opts: {
  subject?: string;
  text?: string;
  html?: string;
  attachments?: { id: string; name: string }[];
}): ForwardedView | null {
  const text = (opts.text ?? '').trim();
  const html = opts.html ?? '';
  const blob = text || (html ? htmlToText(html) : '');
  const images = outlookImages(opts.attachments ?? []);
  const marked = looksLikeForward({
    subject: opts.subject,
    text: blob,
    html,
  });

  const { intro: rawIntro, chunks } = splitByForwardMarkers(blob);
  const blocks = chunks
    .map(parseHeaderChunk)
    .filter(
      (b) =>
        Boolean(b.from || b.subject || b.body.length > 0),
    );

  if (marked && blocks.length) {
    return {
      intro: rawIntro,
      blocks,
      images: [],
    };
  }

  // Outlook often rasterizes the forwarded letters as image001.png…
  const intro = rawIntro || blob;
  const shortIntro = wordCount(intro) <= 24;
  if (
    images.length >= 3 &&
    (marked || shortIntro)
  ) {
    return {
      intro: marked || shortIntro ? intro : '',
      blocks: [],
      images,
    };
  }

  if (marked && (intro || images.length)) {
    return {
      intro,
      blocks: [],
      images,
    };
  }

  return null;
}

export function countForwardedItems(view: ForwardedView): number {
  if (view.blocks.length) return view.blocks.length;
  return view.images.length;
}

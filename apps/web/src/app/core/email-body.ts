/** Helpers for displaying email bodies safely in the UI. */

export interface WrapEmailHtmlOptions {
  /** When true, remote http(s) images are replaced with a placeholder. */
  blockRemoteImages?: boolean;
  /**
   * When true (default), strip quoted reply history so each card shows only
   * that message’s new content. Pass false to show the full MIME body.
   */
  trimQuotedHistory?: boolean;
  /**
   * Chat-style surface: transparent background, app text color (not a white
   * “document frame” inside the thread).
   */
  chatSurface?: boolean;
  /** Text color for chatSurface (hex). Defaults to light-on-dark. */
  chatTextColor?: string;
  /** Link color for chatSurface. */
  chatLinkColor?: string;
}

/**
 * Remove quoted reply chains from HTML so conversation cards don’t each
 * repeat the whole thread (Gmail/Outlook paste “On … wrote:” + prior bodies).
 * Display-only — does not change stored mail.
 */
export function stripQuotedReplyHtml(html: string): string {
  if (!html?.trim()) return html;
  let out = html;

  // Gmail / common client quote containers (and everything after)
  const cutPatterns: RegExp[] = [
    /<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*$/i,
    /<div[^>]*class="[^"]*gmail_attr[^"]*"[^>]*>[\s\S]*$/i,
    /<div[^>]*class="[^"]*yahoo_quoted[^"]*"[^>]*>[\s\S]*$/i,
    /<div[^>]*id="divRplyFwdMsg"[^>]*>[\s\S]*$/i,
    /<div[^>]*class="[^"]*moz-cite-prefix[^"]*"[^>]*>[\s\S]*$/i,
    /<div[^>]*id="appendonsend"[^>]*>[\s\S]*$/i,
    /<blockquote[\s\S]*$/i,
    // “On Tue… wrote:” may wrap across tags/newlines (email mid-line)
    /(?:<br\s*\/?>|\r?\n|\s)*On\s+[\s\S]{5,500}?wrote:\s*(?:<br\s*\/?>|\s)*[\s\S]*$/i,
    /(?:<br\s*\/?>|\r?\n|\s)*-----Original Message-----[\s\S]*$/i,
    /(?:<br\s*\/?>|\r?\n|\s)*_{5,}\s*From:[\s\S]*$/i,
  ];

  for (const re of cutPatterns) {
    const next = out.replace(re, '');
    if (next !== out && next.replace(/<[^>]+>/g, '').trim().length > 0) {
      out = next;
    }
  }

  // Trailing empty markup
  out = out
    .replace(/(?:<br\s*\/?>|&nbsp;|\s)*$/i, '')
    .replace(/(?:<div[^>]*>\s*<\/div>\s*)+$/i, '')
    .trim();

  // Never leave a blank card — fall back to original
  const textLen = out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  if (textLen < 2) return html;
  return out;
}

/** True if HTML looks like it still contains a reply quote chain. */
export function htmlHasQuotedHistory(html: string | undefined | null): boolean {
  if (!html) return false;
  if (/gmail_quote|yahoo_quoted|moz-cite-prefix|divRplyFwdMsg/i.test(html)) {
    return true;
  }
  if (/<blockquote[\s>]/i.test(html)) return true;
  if (/On\s+[\s\S]{5,400}?wrote:/i.test(html)) return true;
  if (/-----Original Message-----/i.test(html)) return true;
  return false;
}

/**
 * Strip plain-text quote tails.
 * Handles wrapped “On … wrote:” (address split across lines) and `>` blocks.
 */
export function stripQuotedReplyPlain(text: string): string {
  if (!text?.trim()) return text;
  let t = text.replace(/\r\n/g, '\n');

  // Multi-line “On … wrote:” — Gmail often wraps mid <email>
  const onWrote = t.search(/(?:^|\n)On\s+[\s\S]{5,500}?wrote:\s*(?:\n|$)/i);
  if (onWrote >= 0) {
    t = t.slice(0, onWrote);
  }

  const lines = t.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const tr = line.trim();
    if (/^-{2,}\s*Original Message/i.test(tr)) break;
    // First quoted line ends the new content
    if (/^>/.test(tr) && out.some((l) => l.trim().length > 0)) break;
    if (/^From:\s*.+@/i.test(tr) && out.length > 1) break;
    out.push(line);
  }
  while (out.length && !out[out.length - 1]!.trim()) out.pop();
  const joined = out.join('\n').trim();
  return joined.length >= 2 ? joined : text;
}

/**
 * Drop email signatures / legal footers so chat shows the actual message only.
 */
export function stripEmailSignature(text: string): string {
  if (!text?.trim()) return text;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i]!.trim();
    if (!tr) {
      // blank line: only keep if we still have body; stop if next looks like sig
      const next = lines.slice(i + 1).find((l) => l.trim())?.trim() ?? '';
      if (
        out.length > 0 &&
        next &&
        /^(med vänlig hälsning|kind regards|best regards|warm regards|regards[,!]?|cheers[,!]?|thanks[,!]?|thank you|hälsningar|sent from my|get outlook|switchboard\s*:|support\s*:|tel\s*:|phone\s*:|mobile\s*:|www\.|http)/i.test(
          next,
        )
      ) {
        break;
      }
      out.push(lines[i]!);
      continue;
    }
    if (/^--\s*$|^—$|^_{3,}$|^-{3,}$/.test(tr) && out.length > 0) break;
    if (
      /^(med vänlig hälsning|kind regards|best regards|warm regards|regards[,!]?|cheers[,!]?|thanks[,!]?|thank you|hälsningar|sent from my|get outlook for)/i.test(
        tr,
      ) &&
      out.length > 0
    ) {
      break;
    }
    if (
      /^(switchboard|support|tel|phone|mobile|fax)\s*:/i.test(tr) &&
      out.length > 1
    ) {
      break;
    }
    // Privacy / legal one-liners
    if (
      /personuppgifter|privacy policy|confidential|disclaimer/i.test(tr) &&
      out.length > 2
    ) {
      break;
    }
    out.push(lines[i]!);
  }
  while (out.length && !out[out.length - 1]!.trim()) out.pop();
  // Drop trailing URL-only lines
  while (
    out.length > 1 &&
    /^https?:\/\/\S+$/i.test(out[out.length - 1]!.trim())
  ) {
    out.pop();
  }
  const joined = out.join('\n').trim();
  return joined.length >= 2 ? joined : text;
}

function buildSafetyStyle(opts: WrapEmailHtmlOptions = {}): string {
  const chat = opts.chatSurface === true;
  // Chat HTML: keep a soft paper surface with *dark* text so nested white
  // tables stay readable (light-on-white was the washed-out Creditsafe bug).
  const text = opts.chatTextColor || (chat ? '#1a1a1a' : '#1a1a1a');
  const link = opts.chatLinkColor || (chat ? '#2563eb' : '#1a73e8');
  const bg = chat ? '#f4f5f7' : '#ffffff';

  return `
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: ${bg} !important;
    color: ${text};
  }
  html {
    overflow-x: auto !important;
    overflow-y: visible !important;
  }
  body {
    font: 14.5px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: ${chat ? '10px 12px' : '8px 4px 16px'} !important;
    overflow-x: auto !important;
    overflow-wrap: break-word;
    word-break: normal;
    min-width: 0;
    text-align: left !important;
    color: ${text} !important;
  }
  ${
    chat
      ? `
  body, body p, body div, body td, body th, body li, body span, body font {
    text-align: left !important;
  }
  body center, body [align="center"],
  body [style*="text-align:center"], body [style*="text-align: center"] {
    text-align: left !important;
  }
  `
      : ''
  }
  img, video {
    max-width: 100% !important;
    height: auto !important;
    display: inline-block;
    vertical-align: middle;
    border-radius: ${chat ? '6px' : '0'};
  }
  img[src^="http://127.0.0.1"],
  img[src^="https://127.0.0.1"] {
    /* docket attachment proxy — keep visible */
  }
  table {
    max-width: 100% !important;
    width: auto !important;
    border-collapse: collapse;
  }
  td, th {
    word-break: normal !important;
    overflow-wrap: break-word;
    white-space: normal;
    vertical-align: top;
    text-align: left !important;
  }
  th {
    white-space: nowrap;
  }
  a { color: ${link} !important; }
  pre, code {
    white-space: pre;
    overflow-x: auto;
    max-width: 100%;
    font-size: 12px;
  }
  img.lm-blocked-img-ph {
    display: inline-block !important;
    vertical-align: middle;
    max-width: 100% !important;
    height: auto !important;
    background: #eef0f4 !important;
    border: 1px dashed #d0d5dd !important;
    border-radius: 4px;
    object-fit: contain;
    box-sizing: border-box;
  }
`;
}

/** Prefer HTML when present; plain text cleaned for readability. */
export function prefersHtml(bodyHtml: string | undefined | null): boolean {
  return Boolean(bodyHtml && bodyHtml.trim().length > 0);
}

export function isLocalOrDataImageSrc(src: string): boolean {
  const s = src.trim();
  return (
    s.startsWith('data:') ||
    /^(https?:)?\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(s) ||
    s.startsWith('http://127.0.0.1') ||
    s.startsWith('https://127.0.0.1') ||
    s.startsWith('http://localhost') ||
    s.startsWith('https://localhost')
  );
}

export function isRemoteHttpSrc(src: string): boolean {
  const s = src.trim();
  if (isLocalOrDataImageSrc(s)) return false;
  return /^(https?:)?\/\//i.test(s) || /^https?:/i.test(s);
}

/** True if HTML still references remote http(s) images (for “Show images” banner). */
export function htmlHasRemoteImages(html: string | undefined | null): boolean {
  if (!html) return false;
  for (const m of html.matchAll(/\bsrc\s*=\s*(['"])([^'"]+)\1/gi)) {
    if (isRemoteHttpSrc(m[2] || '')) return true;
  }
  return false;
}

/**
 * Size-preserving placeholder so marketing emails keep layout.
 * Uses a tiny SVG data-URI (never long text inside the table cell).
 */
export function blockedImagePlaceholder(
  attrBlob: string,
  fullTag: string,
): string {
  const wMatch =
    attrBlob.match(/\bwidth\s*=\s*["']?(\d+)/i) ||
    fullTag.match(/\bwidth\s*[:=]\s*["']?(\d+)/i) ||
    attrBlob.match(/\bwidth\s*:\s*(\d+)px/i);
  const hMatch =
    attrBlob.match(/\bheight\s*=\s*["']?(\d+)/i) ||
    fullTag.match(/\bheight\s*[:=]\s*["']?(\d+)/i) ||
    attrBlob.match(/\bheight\s*:\s*(\d+)px/i);

  let w = wMatch ? Number(wMatch[1]) : 24;
  let h = hMatch ? Number(hMatch[1]) : 24;
  // Clamp nonsense / missing sizes — keep icons small, banners reasonable
  if (!Number.isFinite(w) || w <= 0) w = 24;
  if (!Number.isFinite(h) || h <= 0) h = 24;
  w = Math.min(Math.max(w, 8), 600);
  h = Math.min(Math.max(h, 8), 400);

  // Minimal SVG; grey tile with a simple mountain icon
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="100%" height="100%" fill="#eef0f4"/>` +
    `<rect x="1" y="1" width="${Math.max(w - 2, 0)}" height="${Math.max(h - 2, 0)}" fill="none" stroke="#d0d5dd" stroke-dasharray="3 2" rx="3"/>` +
    (w >= 20 && h >= 16
      ? `<path d="M${w * 0.2} ${h * 0.72} L${w * 0.42} ${h * 0.38} L${w * 0.58} ${h * 0.55} L${w * 0.72} ${h * 0.42} L${w * 0.88} ${h * 0.72} Z" fill="#c5cad3"/>` +
        `<circle cx="${w * 0.72}" cy="${h * 0.28}" r="${Math.min(w, h) * 0.08}" fill="#d8dce3"/>`
      : '') +
    `</svg>`;
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return (
    `<img class="lm-blocked-img-ph" src="${dataUri}" width="${w}" height="${h}" ` +
    `alt="" title="Remote image blocked — use Show images to load" ` +
    `style="width:${w}px;max-width:100%;height:auto;" />`
  );
}

/**
 * Strip active content and optionally remote images before iframe srcdoc.
 */
export function sanitizeEmailHtml(
  html: string,
  opts: WrapEmailHtmlOptions = {},
): string {
  let cleaned = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/<link[\s\S]*?>/gi, '')
    .replace(/<meta[^>]+http-equiv[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"')
    .replace(/javascript:/gi, '');

  if (opts.blockRemoteImages) {
    // Block remote http(s) images, but keep:
    // - data: URLs
    // - localhost / 127.0.0.1 attachment proxy (cid rewrites)
    cleaned = cleaned.replace(
      /<img\b([^>]*?)\bsrc\s*=\s*(['"])([^'"]+)\2([^>]*)>/gi,
      (full, pre: string, _q: string, src: string, post: string) => {
        const s = src.trim();
        if (isLocalOrDataImageSrc(s)) return full;
        if (isRemoteHttpSrc(s)) {
          return blockedImagePlaceholder(pre + post, full);
        }
        // leave relative / cid unresolved as-is (may fail; cid should already be rewritten)
        return full;
      },
    );
    // CSS background-image remote urls (not local core)
    cleaned = cleaned.replace(
      /url\(\s*(['"]?)(https?:\/\/(?!127\.0\.0\.1|localhost)[^)'"]+)\1\s*\)/gi,
      'none',
    );
  } else {
    // Still clamp huge images via CSS; ensure broken src="" doesn't explode layout
    cleaned = cleaned.replace(
      /<img\b([^>]*?)\bsrc\s*=\s*(['"])\s*\2/gi,
      '<img$1src=$2about:blank$2',
    );
  }

  return cleaned;
}

/**
 * Last-chance client rewrite: if any cid: remains (stale cache / missed
 * Content-ID), map by alt filename or single remaining image attachment.
 */
export function rewriteRemainingCids(
  html: string,
  attachments: { id: string; name: string; kind?: string; mimeType?: string }[],
  attachBaseUrl: string,
): string {
  if (!html || !attachments.length || !/cid:/i.test(html)) return html;

  const base = attachBaseUrl.replace(/\/$/, '');
  let out = html;
  const cids = [
    ...html.matchAll(/\bcid:([^"'\s>]+)/gi),
  ].map((m) => m[1]!.replace(/^<|>$/g, '').trim());
  const unique = [...new Set(cids.filter(Boolean))];
  const used = new Set<string>();

  const images = () =>
    attachments.filter(
      (a) =>
        !used.has(a.id) &&
        (a.kind === 'image' ||
          (a.mimeType || '').startsWith('image/') ||
          /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name)),
    );

  for (const cid of unique) {
    let att: (typeof attachments)[0] | undefined;

    // Match alt="filename" on the same <img>
    const tag = [...out.matchAll(/<img\b[^>]*>/gi)].find((m) =>
      new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(
        m[0],
      ),
    )?.[0];
    if (tag) {
      const alt = tag.match(/\balt=["']([^"']+)["']/i)?.[1]?.trim();
      if (alt) {
        att = attachments.find(
          (a) =>
            a.name === alt ||
            alt.includes(a.name) ||
            a.name.includes(alt),
        );
      }
    }
    if (!att) {
      const imgs = images();
      if (imgs.length === 1) att = imgs[0];
    }
    if (!att) continue;

    const url = `${base}/${encodeURIComponent(att.id)}`;
    out = out.replace(
      new RegExp(
        `cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'gi',
      ),
      url,
    );
    used.add(att.id);
  }

  // Order fallback
  const still = [
    ...out.matchAll(/\bcid:([^"'\s>]+)/gi),
  ].map((m) => m[1]!.replace(/^<|>$/g, '').trim());
  const stillU = [...new Set(still.filter(Boolean))];
  const leftover = images();
  for (let i = 0; i < stillU.length; i++) {
    const att = leftover[i];
    if (!att) break;
    const url = `${base}/${encodeURIComponent(att.id)}`;
    out = out.replace(
      new RegExp(
        `cid:${stillU[i]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'gi',
      ),
      url,
    );
    used.add(att.id);
  }

  return out;
}

/**
 * Sanitized HTML fragment for in-bubble rich chat (code / tables / images).
 * Quotes stripped by default; no full-document wrapper (use with [innerHTML]).
 */
export function prepareChatBubbleHtml(
  html: string,
  opts: WrapEmailHtmlOptions & {
    attachments?: { id: string; name: string; kind?: string; mimeType?: string }[];
    attachBaseUrl?: string;
  } = {},
): string {
  const trimQuotes = opts.trimQuotedHistory !== false;
  let h = trimQuotes ? stripQuotedReplyHtml(html) : html;
  h = sanitizeEmailHtml(h, opts);
  // Drop author styles so chat CSS controls look (code/tables/images)
  h = h.replace(/<style[\s\S]*?<\/style>/gi, '');
  h = h.replace(/<\/?font\b[^>]*>/gi, '');
  // Extract body if full document
  const bodyMatch = h.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) h = bodyMatch[1] ?? h;
  h = h
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<\/?html\b[^>]*>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');
  if (opts.attachments?.length && opts.attachBaseUrl) {
    h = rewriteRemainingCids(h, opts.attachments, opts.attachBaseUrl);
  }
  return h.trim();
}

/**
 * Prepare message HTML for iframe srcdoc.
 * Gmail often sends a full HTML document — nest that inside another <html>
 * and the browser shows a blank white page. We detect full docs and inject
 * safety CSS + base target instead of double-wrapping.
 */
export function wrapEmailHtml(
  html: string,
  opts: WrapEmailHtmlOptions = {},
): string {
  const trimQuotes = opts.trimQuotedHistory !== false;
  let cleaned = sanitizeEmailHtml(
    trimQuotes ? stripQuotedReplyHtml(html) : html,
    opts,
  );

  const inject = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base target="_blank" rel="noopener noreferrer" />
<style>${buildSafetyStyle(opts)}</style>
`;

  const looksFullDoc =
    /<!DOCTYPE/i.test(cleaned) || /<html[\s>]/i.test(cleaned);

  if (looksFullDoc) {
    if (/<head[\s>]/i.test(cleaned)) {
      cleaned = cleaned.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
    } else if (/<html([^>]*)>/i.test(cleaned)) {
      cleaned = cleaned.replace(
        /<html([^>]*)>/i,
        `<html$1><head>${inject}</head>`,
      );
    } else {
      cleaned = inject + cleaned;
    }
    return cleaned;
  }

  return `<!DOCTYPE html>
<html>
<head>${inject}</head>
<body>${cleaned}</body>
</html>`;
}

/**
 * Clean plain-text bodies: unwrap &lt;https://…&gt; tracking links, normalize newlines.
 */
export function formatPlainBody(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/<((?:https?|mailto):[^>\s]+)>/gi, '\n$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Helpers for displaying email bodies safely in the UI. */

export interface WrapEmailHtmlOptions {
  /** When true, remote http(s) images are replaced with a placeholder. */
  blockRemoteImages?: boolean;
}

const SAFETY_STYLE = `
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
    color: #1a1a1a;
  }
  body {
    font: 14px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: 8px 4px 16px !important;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  img, video {
    max-width: 100% !important;
    height: auto !important;
    display: inline-block;
    vertical-align: middle;
  }
  img[src^="http://127.0.0.1"],
  img[src^="https://127.0.0.1"] {
    /* local-mail attachment proxy — keep visible */
  }
  table { max-width: 100% !important; }
  a { color: #1a73e8; }
  pre, code {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    font-size: 12px;
  }
  /* Compact placeholder — must NOT inject long text (destroys Amazon-style layouts) */
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
 * Prepare message HTML for iframe srcdoc.
 * Gmail often sends a full HTML document — nest that inside another <html>
 * and the browser shows a blank white page. We detect full docs and inject
 * safety CSS + base target instead of double-wrapping.
 */
export function wrapEmailHtml(
  html: string,
  opts: WrapEmailHtmlOptions = {},
): string {
  let cleaned = sanitizeEmailHtml(html, opts);

  const inject = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base target="_blank" rel="noopener noreferrer" />
<style>${SAFETY_STYLE}</style>
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

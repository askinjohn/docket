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
  .lm-blocked-img {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 8px 12px;
    margin: 4px 0;
    font: 12px/1.4 system-ui, sans-serif;
    color: #475467;
    background: linear-gradient(180deg, #f9fafb 0%, #f2f4f7 100%);
    border: 1px dashed #d0d5dd;
    border-radius: 8px;
  }
  .lm-blocked-img::before {
    content: "🖼";
    font-size: 14px;
  }
`;

/** Prefer HTML when present; plain text cleaned for readability. */
export function prefersHtml(bodyHtml: string | undefined | null): boolean {
  return Boolean(bodyHtml && bodyHtml.trim().length > 0);
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
      (full, pre: string, q: string, src: string, post: string) => {
        const s = src.trim();
        if (
          s.startsWith('data:') ||
          /^(https?:)?\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(s) ||
          s.startsWith('http://127.0.0.1') ||
          s.startsWith('https://127.0.0.1') ||
          s.startsWith('http://localhost') ||
          s.startsWith('https://localhost')
        ) {
          return full;
        }
        if (/^(https?:)?\/\//i.test(s) || /^https?:/i.test(s)) {
          return '<span class="lm-blocked-img" title="Remote image blocked — enable in Settings → Privacy">Remote image blocked</span>';
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

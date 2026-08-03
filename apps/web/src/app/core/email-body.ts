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
  img, video { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
  a { color: #1a73e8; }
  pre, code {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    font-size: 12px;
  }
  .lm-blocked-img {
    display: inline-block;
    padding: 4px 8px;
    margin: 2px 0;
    font: 12px/1.4 system-ui, sans-serif;
    color: #667085;
    background: #f2f4f7;
    border: 1px dashed #d0d5dd;
    border-radius: 4px;
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
    cleaned = cleaned.replace(
      /<img\b([^>]*?)\bsrc\s*=\s*(['"])(https?:)?\/\/[^'"]+\2([^>]*)>/gi,
      '<span class="lm-blocked-img" title="Remote image blocked">[image blocked]</span>',
    );
    // CSS background-image urls
    cleaned = cleaned.replace(
      /url\(\s*(['"]?)https?:\/\/[^)'"]+\1\s*\)/gi,
      'none',
    );
  }

  return cleaned;
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

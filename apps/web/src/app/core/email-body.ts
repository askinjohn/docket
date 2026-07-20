/** Helpers for displaying email bodies safely in the UI. */

/** Prefer HTML when present; plain text cleaned for readability. */
export function prefersHtml(bodyHtml: string | undefined | null): boolean {
  return Boolean(bodyHtml && bodyHtml.trim().length > 0);
}

/**
 * Wrap raw message HTML in a minimal document for iframe srcdoc.
 * No scripts; links open in a new tab via <base target="_blank">.
 */
export function wrapEmailHtml(html: string): string {
  // Strip scripts/styles that could be noisy; full sanitizer can come later
  const cleaned = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base target="_blank" rel="noopener noreferrer" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #1a1a1a;
    }
    body {
      font: 14px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      padding: 4px 2px 12px;
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
    blockquote {
      margin: 0.5em 0;
      padding-left: 0.75em;
      border-left: 3px solid #dadce0;
      color: #5f6368;
    }
  </style>
</head>
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

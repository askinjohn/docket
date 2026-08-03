/**
 * Build a Content-Disposition header that is valid as an HTTP header
 * (ByteString / Latin-1). macOS screenshot names often contain U+202F
 * (narrow no-break space) which crashes Node when set as a raw header.
 */
export function contentDispositionHeader(
  filename: string,
  mode: 'inline' | 'attachment',
): string {
  const raw = (filename || 'file').trim() || 'file';
  // ASCII fallback for the classic filename= parameter
  const ascii =
    raw
      .normalize('NFKD')
      // eslint-disable-next-line no-control-regex
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'file';
  // RFC 5987 for the real Unicode name
  const star = encodeURIComponent(raw)
    .replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${star}`;
}

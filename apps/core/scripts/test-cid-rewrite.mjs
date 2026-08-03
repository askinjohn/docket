/**
 * Quick node check for cid rewrite + content-disposition (no tsx needed).
 * Run: node apps/core/scripts/test-cid-rewrite.mjs
 */
import assert from 'node:assert/strict';

// --- content disposition (inline copy of logic for smoke) ---
function contentDispositionHeader(filename, mode) {
  const raw = (filename || 'file').trim() || 'file';
  const ascii =
    raw
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'file';
  const star = encodeURIComponent(raw);
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${star}`;
}

const nbspName = 'Screenshot 2026-07-31 at 7.38.15\u202fPM.png';
const hdr = contentDispositionHeader(nbspName, 'inline');
assert.ok(!/[^\x00-\xFF]/.test(hdr), 'header must be latin1-safe');
assert.ok(hdr.includes('filename='));
assert.ok(hdr.includes("filename*=UTF-8''"));
console.log('content-disposition OK:', hdr.slice(0, 80) + '…');

// --- cid rewrite: import via dynamic would need build; reimplement smoke ---
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function rewriteCidImages(html, atts, attachBase) {
  const usedIds = new Set();
  if (!html || !atts.length) return { html, usedIds };
  let out = html;
  const cidRefs = [...html.matchAll(/\bcid:([^"'\s>]+)/gi)].map((m) =>
    m[1].replace(/^<|>$/g, '').trim(),
  );
  const uniqueCids = [...new Set(cidRefs.filter(Boolean))];
  const images = () =>
    atts.filter((a) => (a.mime_type || '').startsWith('image/') && !usedIds.has(a.id));
  for (const cid of uniqueCids) {
    let att = atts.find(
      (a) =>
        a.content_id &&
        a.content_id.replace(/^<|>$/g, '').toLowerCase() === cid.toLowerCase(),
    );
    if (!att) {
      const loose = [...html.matchAll(/<img\b[^>]*>/gi)].find((m) =>
        new RegExp(`cid:${escapeRegExp(cid)}`, 'i').test(m[0]),
      )?.[0];
      if (loose) {
        const alt = loose.match(/\balt=["']([^"']+)["']/i)?.[1]?.trim();
        if (alt) {
          att = atts.find(
            (a) =>
              a.filename === alt ||
              (a.filename && (alt.includes(a.filename) || a.filename.includes(alt))),
          );
        }
      }
    }
    if (!att) {
      const imgs = images();
      if (imgs.length === 1) att = imgs[0];
    }
    if (!att) continue;
    const url = `${attachBase}/${encodeURIComponent(att.id)}`;
    out = out.replace(new RegExp(`cid:${escapeRegExp(cid)}`, 'gi'), url);
    usedIds.add(att.id);
  }
  return { html: out, usedIds };
}

const html =
  '<img src="cid:ii_msb3ljqt0" alt="CleanShot 2026-08-01 at 18.04.19.png" width="514">';
const atts = [
  {
    id: 'msg1:att1',
    filename: 'CleanShot 2026-08-01 at 18.04.19.png',
    mime_type: 'image/png',
    content_id: null,
  },
];
const { html: out, usedIds } = rewriteCidImages(
  html,
  atts,
  'http://127.0.0.1:8787/attachments',
);
assert.ok(out.includes('http://127.0.0.1:8787/attachments/'), out);
assert.ok(!out.includes('cid:'), out);
assert.equal(usedIds.size, 1);
console.log('cid rewrite OK');
console.log('all smoke checks passed');

import { describe, expect, it } from 'vitest';

import { sanitizeEmailHtml, wrapEmailHtml } from './email-body';

describe('email-body sanitizer', () => {
  it('strips scripts and event handlers', () => {
    const dirty =
      '<p onclick="alert(1)">Hi</p><script>evil()</script><img src=x onerror=alert(1)>';
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/onerror/i);
  });

  it('blocks remote images with a compact placeholder (no long text)', () => {
    const html =
      '<p>x</p><img src="https://tracker.example/pixel.gif" width="24" height="24" alt="t">';
    const blocked = sanitizeEmailHtml(html, { blockRemoteImages: true });
    expect(blocked).toContain('lm-blocked-img-ph');
    expect(blocked).toContain('data:image/svg+xml');
    expect(blocked).not.toContain('tracker.example');
    // Must not inject layout-breaking label text into table cells
    expect(blocked).not.toMatch(/>Remote image blocked</);
  });

  it('keeps local attachment proxy images when remote block is on', () => {
    const html =
      '<img src="http://127.0.0.1:8787/attachments/1%3Aabc">';
    const kept = sanitizeEmailHtml(html, { blockRemoteImages: true });
    expect(kept).toContain('127.0.0.1:8787/attachments');
  });

  it('keeps remote images when not blocked', () => {
    const html = '<img src="https://cdn.example/a.png">';
    const open = sanitizeEmailHtml(html, { blockRemoteImages: false });
    expect(open).toContain('cdn.example');
  });

  it('wrapEmailHtml produces a full document for fragments', () => {
    const doc = wrapEmailHtml('<p>Hello</p>');
    expect(doc).toMatch(/<!DOCTYPE html>/i);
    expect(doc).toContain('Hello');
  });
});

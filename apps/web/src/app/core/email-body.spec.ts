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

  it('blocks remote images when requested', () => {
    const html = '<p>x</p><img src="https://tracker.example/pixel.gif" alt="t">';
    const blocked = sanitizeEmailHtml(html, { blockRemoteImages: true });
    expect(blocked).toContain('image blocked');
    expect(blocked).not.toContain('tracker.example');
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

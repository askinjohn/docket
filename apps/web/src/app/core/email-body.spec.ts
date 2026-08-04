import { describe, expect, it } from 'vitest';

import {
  htmlHasQuotedHistory,
  prepareChatBubbleHtml,
  sanitizeEmailHtml,
  stripEmailSignature,
  stripQuotedReplyHtml,
  stripQuotedReplyPlain,
  wrapEmailHtml,
} from './email-body';

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

  it('allows wide tables to scroll horizontally instead of crushing columns', () => {
    const doc = wrapEmailHtml('<table><tr><th>Change</th></tr></table>');
    expect(doc).toMatch(/overflow-x:\s*auto/i);
    expect(doc).toMatch(/table\s*\{[^}]*max-width:\s*(?:none|100%)/i);
  });

  it('strips gmail quoted history so cards show only new content', () => {
    const html =
      '<div>Hi Emilia, need a reset link.</div>' +
      '<div class="gmail_quote">' +
      '<div class="gmail_attr">On Tue, Creditsafe wrote:</div>' +
      '<blockquote>Yes SURFNOIN is the same user…</blockquote></div>';
    const stripped = stripQuotedReplyHtml(html);
    expect(stripped).toContain('Hi Emilia');
    expect(stripped).not.toContain('gmail_quote');
    expect(stripped).not.toContain('SURFNOIN');
    expect(htmlHasQuotedHistory(html)).toBe(true);
  });

  it('strips plain-text On…wrote tails', () => {
    const text =
      'Hi Emilia,\n\nPlease resend.\n\n/Askin\n\nOn Tue, 4 Aug 2026 Creditsafe wrote:\n> older body';
    const stripped = stripQuotedReplyPlain(text);
    expect(stripped).toContain('Please resend');
    expect(stripped).not.toContain('older body');
  });

  it('strips wrapped On…wrote (email split across lines)', () => {
    const text = [
      'Hi Emilia,',
      '',
      'Need a reset link.',
      '/Askin',
      '',
      'On Tue, 4 Aug 2026 at 17:20, Creditsafe Integration <',
      'integration@creditsafe.se> wrote:',
      '> Hi Askin,',
      '> Yes SURFNOIN is the same',
    ].join('\n');
    const stripped = stripQuotedReplyPlain(text);
    expect(stripped).toContain('Need a reset link');
    expect(stripped).not.toContain('SURFNOIN');
    expect(stripped).not.toContain('wrote:');
  });

  it('strips email signatures from chat text', () => {
    const text = [
      'Hi Askin,',
      '',
      'SURFNOIN is the same user.',
      '',
      'Med vänlig hälsning / Kind regards,',
      'Emilia Seipel',
      'Switchboard: +46 31',
    ].join('\n');
    const stripped = stripEmailSignature(text);
    expect(stripped).toContain('SURFNOIN is the same user');
    expect(stripped).not.toContain('Emilia Seipel');
    expect(stripped).not.toContain('Switchboard');
  });

  it('wrapEmailHtml keeps quotes when trimQuotedHistory is false', () => {
    const html =
      '<p>New</p><div class="gmail_quote"><blockquote>Old</blockquote></div>';
    const full = wrapEmailHtml(html, { trimQuotedHistory: false });
    expect(full).toContain('Old');
    const trimmed = wrapEmailHtml(html, { trimQuotedHistory: true });
    expect(trimmed).toContain('New');
    expect(trimmed).not.toContain('Old');
  });

  it('prepareChatBubbleHtml keeps code/tables and strips scripts', () => {
    const html =
      '<p>See:</p><pre><code>const x = 1;</code></pre>' +
      '<table><tr><th>A</th></tr><tr><td>1</td></tr></table>' +
      '<script>evil()</script>';
    const frag = prepareChatBubbleHtml(html);
    expect(frag).toContain('<pre>');
    expect(frag).toContain('const x = 1');
    expect(frag).toContain('<table>');
    expect(frag).not.toMatch(/script/i);
    expect(frag).not.toMatch(/<!DOCTYPE/i);
  });
});

import { describe, expect, it } from 'vitest';

import {
  chatBodyMode,
  iconForAttachment,
  isMine,
  messagePlainText,
  messageUsesHtml,
  stripTags,
} from './message-display';
import type { ShellMessage } from './ui-shell.service';

function msg(partial: Partial<ShellMessage>): ShellMessage {
  return {
    id: '1',
    from: 'a@example.com',
    to: 'b@example.com',
    cc: '',
    bcc: '',
    time: '',
    body: '',
    bodyHtml: '',
    attachments: [],
    ...partial,
  };
}

describe('message-display', () => {
  it('stripTags removes markup', () => {
    expect(stripTags('<p>Hi <b>there</b></p>')).toContain('Hi');
    expect(stripTags('<p>Hi <b>there</b></p>')).toContain('there');
  });

  it('detects HTML vs plain', () => {
    expect(messageUsesHtml(msg({ bodyHtml: '<p>Hello</p>' }))).toBe(true);
    expect(messageUsesHtml(msg({ bodyHtml: '' }))).toBe(false);
  });

  it('isMine matches account email forms', () => {
    const mine = msg({ from: 'Ada <me@mail.com>' });
    expect(isMine(mine, 'me@mail.com')).toBe(true);
    expect(isMine(msg({ from: 'me@mail.com' }), 'me@mail.com')).toBe(true);
    expect(isMine(msg({ from: 'Ada Lovelace me@mail.com' }), 'me@mail.com')).toBe(
      true,
    );
    expect(isMine(msg({ from: 'other@x.com' }), 'me@mail.com')).toBe(false);
    expect(isMine(mine, null)).toBe(false);
  });

  it('messagePlainText prefers body then strips html', () => {
    expect(messagePlainText(msg({ body: 'Plain', bodyHtml: '' }))).toBe('Plain');
    expect(messagePlainText(msg({ body: '', bodyHtml: '<p>Hi</p>' }))).toContain('Hi');
  });

  it('chatBodyMode picks plain / rich / iframe', () => {
    expect(chatBodyMode(msg({ body: 'Hello there friend', bodyHtml: '' }))).toBe(
      'plain',
    );
    expect(
      chatBodyMode(
        msg({
          bodyHtml: '<p>Run:</p><pre><code>npm test</code></pre>',
        }),
      ),
    ).toBe('rich');
    expect(
      chatBodyMode(
        msg({
          bodyHtml: '<table><tr><td>a</td></tr></table><p>note</p>',
        }),
      ),
    ).toBe('rich');
    expect(
      chatBodyMode(
        msg({
          bodyHtml:
            '<table></table><table></table><table></table><img src="https://x/a.png"><img src="https://x/b.png"><img src="https://x/c.png"><img src="https://x/d.png"><img src="https://x/e.png">',
        }),
      ),
    ).toBe('iframe');
  });

  it('iconForAttachment maps kinds', () => {
    expect(iconForAttachment('pdf')).toBe('📕');
    expect(iconForAttachment('other')).toBe('📎');
  });
});

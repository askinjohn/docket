import { describe, expect, it } from 'vitest';

import {
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
    time: '',
    body: '',
    bodyHtml: '',
    attachments: [],
    ...partial,
  };
}

describe('message-display', () => {
  it('stripTags removes markup', () => {
    expect(stripTags('<p>Hi <b>there</b></p>')).toBe('Hi there');
  });

  it('detects HTML vs plain', () => {
    expect(messageUsesHtml(msg({ bodyHtml: '<p>Hello</p>' }))).toBe(true);
    expect(messageUsesHtml(msg({ bodyHtml: '' }))).toBe(false);
  });

  it('isMine matches account email forms', () => {
    const mine = msg({ from: 'Ada <me@mail.com>' });
    expect(isMine(mine, 'me@mail.com')).toBe(true);
    expect(isMine(msg({ from: 'other@x.com' }), 'me@mail.com')).toBe(false);
    expect(isMine(mine, null)).toBe(false);
  });

  it('messagePlainText prefers body then strips html', () => {
    expect(messagePlainText(msg({ body: 'Plain' }))).toBe('Plain');
    expect(messagePlainText(msg({ body: '', bodyHtml: '<p>Hi</p>' }))).toContain('Hi');
  });

  it('iconForAttachment maps kinds', () => {
    expect(iconForAttachment('pdf')).toBe('📕');
    expect(iconForAttachment('other')).toBe('📎');
  });
});

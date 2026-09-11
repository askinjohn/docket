import { describe, expect, it } from 'vitest';

import {
  looksLikeForward,
  splitForwardedMail,
} from './forwarded-mail';

describe('forwarded-mail', () => {
  it('does not treat a normal reply quote as a forward', () => {
    const text =
      'Please resend.\n\nOn Tue, 4 Aug 2026 Creditsafe wrote:\n> older body';
    expect(
      looksLikeForward({ subject: 'Re: reset', text }),
    ).toBe(false);
    expect(splitForwardedMail({ subject: 'Re: reset', text })).toBeNull();
  });

  it('splits a Gmail forwarded message from the FYI intro', () => {
    const text = [
      'FYI,',
      '',
      '---------- Forwarded message ---------',
      'From: Alice <alice@x.com>',
      'Date: Mon, 1 Sep 2026 at 10:00',
      'Subject: Invoice',
      'To: Bob <bob@y.com>',
      '',
      'Please pay this week.',
    ].join('\n');
    const view = splitForwardedMail({
      subject: 'Fwd: Invoice',
      text,
    });
    expect(view).not.toBeNull();
    expect(view!.intro).toContain('FYI');
    expect(view!.intro).not.toContain('Please pay');
    expect(view!.blocks).toHaveLength(1);
    expect(view!.blocks[0]!.from).toMatch(/Alice/);
    expect(view!.blocks[0]!.subject).toBe('Invoice');
    expect(view!.blocks[0]!.body).toContain('Please pay this week');
  });

  it('splits two Original Message blocks', () => {
    const text = [
      'See below.',
      '',
      '-----Original Message-----',
      'From: One <one@x.com>',
      'Sent: Monday, 1 September 2026 10:00',
      'To: Two <two@x.com>',
      'Subject: First',
      '',
      'Hello one',
      '',
      '-----Original Message-----',
      'From: Two <two@x.com>',
      'To: One <one@x.com>',
      'Subject: Second',
      '',
      'Hello two',
    ].join('\n');
    const view = splitForwardedMail({ subject: 'FYI', text });
    expect(view?.blocks).toHaveLength(2);
    expect(view!.blocks[0]!.subject).toBe('First');
    expect(view!.blocks[1]!.subject).toBe('Second');
  });

  it('uses Outlook image00N.png as forwarded pages when intro is short', () => {
    const view = splitForwardedMail({
      subject: 'FYI',
      text: 'FYI,\n\nKugesh Rajasekaran Systems Architect',
      attachments: [
        { id: 'a1', name: 'image005.png' },
        { id: 'a2', name: 'image002.png' },
        { id: 'a3', name: 'image003.png' },
        { id: 'a4', name: 'image001.png' },
        { id: 'a5', name: 'image004.png' },
      ],
    });
    expect(view).not.toBeNull();
    expect(view!.intro).toMatch(/FYI/i);
    expect(view!.blocks).toHaveLength(0);
    expect(view!.images).toHaveLength(5);
  });

  it('does not treat a couple of signature images as a forward', () => {
    const view = splitForwardedMail({
      subject: 'Hello',
      text: 'Can we meet tomorrow at 10?\n\nThanks',
      attachments: [
        { id: 'l', name: 'image001.png' },
        { id: 'l2', name: 'image002.png' },
      ],
    });
    expect(view).toBeNull();
  });
});

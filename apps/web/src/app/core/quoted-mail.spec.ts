import { describe, expect, it } from 'vitest';

import { splitQuotedMail, unwrapQuotePrefix } from './quoted-mail';

const SAMPLE = [
  'Hi,',
  '',
  'Do you have shipping details for NPT20260202367?',
  '',
  'Best regards,',
  'Tim',
  '',
  'On Thu, 26 Mar 2026 at 12:32, Asaph Abraham',
  '<abraham@surfboard.se> wrote:',
  '',
  '> Hi Carmen,',
  '>',
  '> Attached is the signed PI.',
  '>',
  '> Can you help me with an answer to the following? Do we',
  '> know the delivery',
  '> dates for these?',
  '>',
  '> On 23 Mar 2026 at 17:02:40, Carmen Wang/王佳萌',
  '> <carmen.wang@newlandnpt.com>',
  '> wrote:',
  '>',
  '>> Hi Tim,',
  '>>',
  '>> Please refer to the PI for the 75 x N950.',
].join('\n');

describe('quoted-mail', () => {
  it('unwraps a single > prefix', () => {
    expect(unwrapQuotePrefix('> Hi Carmen,\n> Attached')).toBe(
      'Hi Carmen,\nAttached',
    );
  });

  it('splits Tim’s note from the On…wrote chain', () => {
    const view = splitQuotedMail({ text: SAMPLE });
    expect(view).not.toBeNull();
    expect(view!.intro).toContain('NPT20260202367');
    expect(view!.intro).toContain('Tim');
    expect(view!.intro).not.toContain('Hi Carmen');
    expect(view!.blocks.length).toBeGreaterThanOrEqual(2);
    expect(view!.blocks[0]!.from).toMatch(/Asaph Abraham/);
    expect(view!.blocks[0]!.body).toContain('signed PI');
    expect(view!.blocks[0]!.body).not.toMatch(/^>/m);
    expect(view!.blocks[1]!.from).toMatch(/Carmen/);
    expect(view!.blocks[1]!.body).toContain('75 x N950');
  });

  it('returns null when there is no quote chain', () => {
    expect(splitQuotedMail({ text: 'Just a short note.' })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { parseInsightText, stripMd } from './ai-insight';

describe('ai-insight', () => {
  it('strips markdown emphasis', () => {
    expect(stripMd('**Hello** _world_')).toBe('Hello world');
  });

  it('parses template summary into rows and points', () => {
    const raw = [
      '**Summary** (template — no LLM configured)',
      '',
      '**Subject:** Ordered: "Pampers"',
      '**From:** Amazon.in',
      '**Messages:** 1',
      '',
      '**Recent points:**',
      '- Amazon.in: Your order shipped',
    ].join('\n');

    const p = parseInsightText(raw);
    expect(p.title).toBe('Thread summary');
    expect(p.modeNote).toContain('template');
    expect(p.rows.find((r) => r.label === 'Subject')?.value).toContain('Pampers');
    expect(p.rows.find((r) => r.label === 'From')?.value).toBe('Amazon.in');
    expect(p.points[0]).toContain('order shipped');
    expect(p.plainText).not.toContain('**');
  });
});

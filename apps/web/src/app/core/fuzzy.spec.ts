import { describe, expect, it } from 'vitest';

import { fuzzyFilter, fuzzyScore } from './fuzzy';

describe('fuzzy', () => {
  it('ranks exact substring higher', () => {
    expect(fuzzyScore('arch', 'Archive')).toBeGreaterThan(
      fuzzyScore('arch', 'Search'),
    );
  });

  it('matches non-contiguous characters', () => {
    expect(fuzzyScore('sy', 'Sync inbox')).toBeGreaterThan(0);
  });

  it('filters and sorts a list', () => {
    const items = [
      { label: 'Archive' },
      { label: 'Compose' },
      { label: 'AI draft reply' },
    ];
    const out = fuzzyFilter(items, 'ar', (i) => i.label);
    expect(out[0]?.label).toBe('Archive');
    expect(out.every((i) => fuzzyScore('ar', i.label) > 0)).toBe(true);
  });
});

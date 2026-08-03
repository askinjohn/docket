/** Tiny fuzzy scorer for command palette (no deps). Higher = better; 0 = no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 + (t.startsWith(q) ? 20 : 0) - t.indexOf(q);

  let ti = 0;
  let score = 0;
  let consecutive = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    if (found === ti) {
      consecutive += 1;
      score += 4 + consecutive;
    } else {
      consecutive = 0;
      score += 1;
    }
    ti = found + 1;
  }
  return score;
}

export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  textOf: (item: T) => string,
): T[] {
  if (!query.trim()) return [...items];
  return items
    .map((item) => ({ item, score: fuzzyScore(query, textOf(item)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

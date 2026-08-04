/** Parse AI / template summary text into structured UI rows. */

export interface InsightRow {
  label: string;
  value: string;
}

export interface ParsedInsight {
  title: string;
  modeNote: string | null;
  rows: InsightRow[];
  points: string[];
  /** Clean plain text for copy / insert into reply */
  plainText: string;
}

/** Strip simple markdown emphasis and normalize whitespace. */
export function stripMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim();
}

export function parseInsightText(raw: string): ParsedInsight {
  const text = (raw || '').trim();
  const lines = text.split(/\r?\n/);
  const rows: InsightRow[] = [];
  const points: string[] = [];
  let title = 'Thread summary';
  let modeNote: string | null = null;
  let inPoints = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // **Summary** (template — no LLM configured)
    const titleM = t.match(/^\*\*Summary\*\*\s*(?:\(([^)]+)\))?/i);
    if (titleM) {
      title = 'Thread summary';
      if (titleM[1]) modeNote = titleM[1].trim();
      continue;
    }

    // **Subject:** value — strip ** then split on first colon
    const bare = t.replace(/\*\*/g, '').trim();
    const colon = bare.indexOf(':');
    if (colon > 0 && !inPoints) {
      const label = bare.slice(0, colon).trim();
      const value = bare.slice(colon + 1).trim();
      if (/^recent points$/i.test(label)) {
        inPoints = true;
        continue;
      }
      if (/^(subject|from|messages|to|date)$/i.test(label)) {
        rows.push({
          label: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
          value,
        });
        continue;
      }
    }

    if (/^recent points/i.test(bare)) {
      inPoints = true;
      continue;
    }

    if (/^[-•*]\s+/.test(t) || inPoints) {
      const point = stripMd(t.replace(/^[-•*]\s+/, '')).trim();
      if (point && !/^account\s/i.test(point)) points.push(point);
      continue;
    }

    // footer like _Account x_
    if (/^_?Account\s/i.test(stripMd(t))) continue;
  }

  // Fallback: if nothing structured, show full cleaned text as points
  if (!rows.length && !points.length && text) {
    const cleaned = stripMd(text)
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    points.push(...cleaned.slice(0, 12));
  }

  const plainParts: string[] = [];
  if (rows.length) {
    for (const r of rows) plainParts.push(`${r.label}: ${r.value}`);
  }
  if (points.length) {
    plainParts.push('');
    plainParts.push(...points.map((p) => `• ${p}`));
  }
  const plainText = plainParts.join('\n').trim() || stripMd(text);

  return { title, modeNote, rows, points, plainText };
}

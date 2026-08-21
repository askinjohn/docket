/** 5-field cron (minute hour day-of-month month day-of-week), local time. */

function parseField(
  field: string,
  min: number,
  max: number,
): Set<number> | null {
  const out = new Set<number>();
  const addRange = (a: number, b: number, step: number) => {
    for (let n = a; n <= b; n += step) {
      if (n >= min && n <= max) out.add(n);
    }
  };
  for (const part of field.split(',')) {
    const p = part.trim();
    if (!p) return null;
    const [range, stepRaw] = p.split('/');
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) return null;
    if (range === '*') {
      addRange(min, max, step);
      continue;
    }
    if (!range) return null;
    const [aRaw, bRaw] = range.split('-');
    const a = Number(aRaw);
    if (!Number.isInteger(a)) return null;
    if (bRaw == null) {
      if (a < min || a > max) return null;
      if (step === 1) out.add(a);
      else addRange(a, max, step);
      continue;
    }
    const b = Number(bRaw);
    if (!Number.isInteger(b) || b < a) return null;
    addRange(a, b, step);
  }
  return out;
}

export function parseCron(expr: string): {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
} | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minute = parseField(parts[0]!, 0, 59);
  const hour = parseField(parts[1]!, 0, 23);
  const dom = parseField(parts[2]!, 1, 31);
  const month = parseField(parts[3]!, 1, 12);
  const dow = parseField(parts[4]!, 0, 6);
  if (!minute || !hour || !dom || !month || !dow) return null;
  return { minute, hour, dom, month, dow };
}

export function cronMatches(expr: string, date: Date): boolean {
  const c = parseCron(expr);
  if (!c) return false;
  return (
    c.minute.has(date.getMinutes()) &&
    c.hour.has(date.getHours()) &&
    c.dom.has(date.getDate()) &&
    c.month.has(date.getMonth() + 1) &&
    c.dow.has(date.getDay())
  );
}

/** Most recent matching minute in the last 24 hours (inclusive of now). */
export function lastScheduledAt(expr: string, now: Date): Date | null {
  if (!parseCron(expr)) return null;
  const d = new Date(now);
  d.setSeconds(0, 0);
  for (let i = 0; i < 24 * 60; i++) {
    if (cronMatches(expr, d)) return d;
    d.setMinutes(d.getMinutes() - 1);
  }
  return null;
}

export function cronDue(
  expr: string,
  lastRunAt: string | null | undefined,
  now = new Date(),
): boolean {
  const scheduled = lastScheduledAt(expr, now);
  if (!scheduled) return false;
  if (now.getTime() - scheduled.getTime() > 12 * 3600_000) return false;
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt);
  if (Number.isNaN(last.getTime())) return true;
  return last < scheduled;
}

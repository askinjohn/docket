import { getDb } from '../db/index.js';

export interface MailViewRow {
  id: number;
  name: string;
  query: string;
  created_at: number;
}

export function listMailViews(): MailViewRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, query, created_at FROM mail_views ORDER BY name COLLATE NOCASE`,
    )
    .all() as MailViewRow[];
}

export function createMailView(name: string, query: string): MailViewRow {
  const n = name.trim();
  const q = query.trim();
  if (!n) throw new Error('name required');
  if (!q) throw new Error('query required');
  const now = Date.now();
  const info = getDb()
    .prepare(
      `INSERT INTO mail_views (name, query, created_at) VALUES (?, ?, ?)`,
    )
    .run(n, q, now);
  return {
    id: Number(info.lastInsertRowid),
    name: n,
    query: q,
    created_at: now,
  };
}

export function deleteMailView(id: number): boolean {
  const res = getDb().prepare(`DELETE FROM mail_views WHERE id = ?`).run(id);
  return res.changes > 0;
}

export function getMailView(id: number): MailViewRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT id, name, query, created_at FROM mail_views WHERE id = ?`,
      )
      .get(id) as MailViewRow | undefined) ?? null
  );
}

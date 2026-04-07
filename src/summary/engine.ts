import type { Database } from 'sqlite';

function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export async function rebuildSummaries(db: Database): Promise<void> {
  const rows = await db.all<{ category: string; ts: string }[]>('SELECT category, ts FROM health_events ORDER BY ts ASC');

  const daily = new Map<string, Record<string, number>>();
  const weekly = new Map<string, Record<string, number>>();

  for (const row of rows) {
    const d = new Date(row.ts);
    const day = d.toISOString().slice(0, 10);
    const week = weekKey(d);

    daily.set(day, { ...(daily.get(day) ?? {}), [row.category]: (daily.get(day)?.[row.category] ?? 0) + 1 });
    weekly.set(week, { ...(weekly.get(week) ?? {}), [row.category]: (weekly.get(week)?.[row.category] ?? 0) + 1 });
  }

  await db.exec('BEGIN;');
  try {
    await db.run('DELETE FROM summaries_daily');
    await db.run('DELETE FROM summaries_weekly');

    const now = new Date().toISOString();
    for (const [day, summary] of daily) {
      await db.run('INSERT INTO summaries_daily (day, summary_json, updated_at) VALUES (?, ?, ?)', [day, JSON.stringify(summary), now]);
    }
    for (const [week, summary] of weekly) {
      await db.run('INSERT INTO summaries_weekly (week, summary_json, updated_at) VALUES (?, ?, ?)', [week, JSON.stringify(summary), now]);
    }

    await db.exec('COMMIT;');
  } catch (error) {
    await db.exec('ROLLBACK;');
    throw error;
  }
}

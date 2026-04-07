import Fastify from 'fastify';
import type { Database } from 'sqlite';
import type { AppConfig } from '../config/schema.js';
import { applySensitivityPolicy } from '../policy/index.js';

export function buildServer(db: Database, config: AppConfig) {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ ok: true }));

  app.get('/v1/context/agent', async () => {
    const events = await db.all<any[]>('SELECT source_event_id, category, ts, payload_json FROM health_events ORDER BY ts DESC LIMIT 500');
    const filtered = applySensitivityPolicy(events, config).map((e) => ({
      id: e.source_event_id,
      category: e.category,
      ts: e.ts,
      payload: JSON.parse(e.payload_json)
    }));

    const daily = await db.all<any[]>('SELECT day, summary_json FROM summaries_daily ORDER BY day DESC LIMIT 30');
    const weekly = await db.all<any[]>('SELECT week, summary_json FROM summaries_weekly ORDER BY week DESC LIMIT 12');

    return {
      generatedAt: new Date().toISOString(),
      events: filtered,
      summaries: {
        daily: daily.map((d) => ({ day: d.day, summary: JSON.parse(d.summary_json) })),
        weekly: weekly.map((w) => ({ week: w.week, summary: JSON.parse(w.summary_json) }))
      }
    };
  });

  app.get('/v1/events', async () => {
    const events = await db.all<any[]>('SELECT source_event_id, category, ts, payload_json FROM health_events ORDER BY ts DESC LIMIT 500');
    return applySensitivityPolicy(events, config);
  });

  app.get('/v1/summaries/daily', async () => db.all('SELECT day, summary_json, updated_at FROM summaries_daily ORDER BY day DESC LIMIT 30'));
  app.get('/v1/summaries/weekly', async () => db.all('SELECT week, summary_json, updated_at FROM summaries_weekly ORDER BY week DESC LIMIT 12'));

  return app;
}

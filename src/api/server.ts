import Fastify from 'fastify';
import type { Database } from 'sqlite';
import type { AppConfig } from '../config/schema.js';
import {
  buildHealthStatusResponse,
  buildNutritionListResponse,
  buildPrListResponse,
  buildRecoveryListResponse,
  buildSnapshotResponse,
  buildSummaryResponse,
  buildWorkoutListResponse
} from './bridge.js';
import { applySensitivityPolicy } from '../policy/index.js';

export function buildServer(db: Database, config: AppConfig) {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ ok: true }));
  app.get('/v1/health', async () => buildHealthStatusResponse(db));

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

  app.get('/v1/snapshot', async (request, reply) => {
    const date = typeof request.query === 'object' && request.query !== null && 'date' in request.query && typeof request.query.date === 'string'
      ? request.query.date
      : new Date().toISOString().slice(0, 10);
    const response = await buildSnapshotResponse(db, config, date);
    return reply.code(response.statusCode).send(response.body);
  });

  app.get('/v1/summary', async (request) => {
    const today = new Date().toISOString().slice(0, 10);
    const end = typeof request.query === 'object' && request.query !== null && 'end' in request.query && typeof request.query.end === 'string'
      ? request.query.end
      : today;
    const start = typeof request.query === 'object' && request.query !== null && 'start' in request.query && typeof request.query.start === 'string'
      ? request.query.start
      : (() => {
        const defaultStart = new Date(`${end}T00:00:00.000Z`);
        defaultStart.setUTCDate(defaultStart.getUTCDate() - 6);
        return defaultStart.toISOString().slice(0, 10);
      })();

    return buildSummaryResponse(db, config, start, end);
  });

  app.get('/v1/workouts', async (request) => {
    const limit = typeof request.query === 'object' && request.query !== null && 'limit' in request.query && typeof request.query.limit === 'string'
      ? request.query.limit
      : undefined;
    return buildWorkoutListResponse(db, config, limit);
  });

  app.get('/v1/nutrition', async (request) => {
    const limit = typeof request.query === 'object' && request.query !== null && 'limit' in request.query && typeof request.query.limit === 'string'
      ? request.query.limit
      : undefined;
    return buildNutritionListResponse(db, config, limit);
  });

  app.get('/v1/recovery', async (request) => {
    const limit = typeof request.query === 'object' && request.query !== null && 'limit' in request.query && typeof request.query.limit === 'string'
      ? request.query.limit
      : undefined;
    return buildRecoveryListResponse(db, config, limit);
  });

  app.get('/v1/prs', async (request) => {
    const limit = typeof request.query === 'object' && request.query !== null && 'limit' in request.query && typeof request.query.limit === 'string'
      ? request.query.limit
      : undefined;
    return buildPrListResponse(db, config, limit);
  });

  app.get('/v1/summaries/daily', async () => db.all('SELECT day, summary_json, updated_at FROM summaries_daily ORDER BY day DESC LIMIT 30'));
  app.get('/v1/summaries/weekly', async () => db.all('SELECT week, summary_json, updated_at FROM summaries_weekly ORDER BY week DESC LIMIT 12'));

  return app;
}

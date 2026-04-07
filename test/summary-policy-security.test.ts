import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import { openDb, runMigrations } from '../src/db/index.js';
import { rebuildSummaries } from '../src/summary/engine.js';
import { applySensitivityPolicy } from '../src/policy/index.js';
import { buildServer } from '../src/api/server.js';

describe('summaries, policy, and api security defaults', () => {
  it('builds daily/weekly summaries and hides sensitive categories', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ohc-test-'));
    const db = await openDb(path.join(temp, 'db.sqlite'));
    await runMigrations(db);

    await db.run(
      'INSERT INTO health_events (source_event_id, category, ts, payload_json, bundle_id) VALUES (?, ?, ?, ?, ?)',
      ['e1', 'activity', '2026-01-03T12:00:00.000Z', JSON.stringify({
        steps: 3200,
        activeCaloriesBurned: 300,
        totalCaloriesBurned: 2100
      }), 'b1']
    );
    await db.run(
      'INSERT INTO health_events (source_event_id, category, ts, payload_json, bundle_id) VALUES (?, ?, ?, ?, ?)',
      ['e2', 'mental_health', '2026-01-03T13:00:00.000Z', '{}', 'b1']
    );
    await db.run(
      'INSERT INTO health_events (source_event_id, category, ts, payload_json, bundle_id) VALUES (?, ?, ?, ?, ?)',
      ['e3', 'activity', '2026-01-03T14:00:00.000Z', JSON.stringify({
        workoutType: 'Strength',
        startTime: '2026-01-03T14:00:00.000Z',
        endTime: '2026-01-03T15:00:00.000Z',
        completed: true
      }), 'b1']
    );
    await db.run(
      'INSERT INTO health_events (source_event_id, category, ts, payload_json, bundle_id) VALUES (?, ?, ?, ?, ?)',
      ['e4', 'nutrition', '2026-01-03T10:00:00.000Z', JSON.stringify({
        mealName: 'Lunch',
        calories: 650,
        proteinGrams: 45,
        carbsGrams: 60,
        fatGrams: 20
      }), 'b1']
    );
    await db.run(
      'INSERT INTO health_events (source_event_id, category, ts, payload_json, bundle_id) VALUES (?, ?, ?, ?, ?)',
      ['e5', 'sleep', '2026-01-03T07:00:00.000Z', JSON.stringify({
        sleepHours: 7.25,
        fatigueLevel: 2,
        stressLevel: 3,
        recoveryScore: 78
      }), 'b1']
    );
    await db.run(
      'INSERT INTO health_events (source_event_id, category, ts, payload_json, bundle_id) VALUES (?, ?, ?, ?, ?)',
      ['e6', 'activity', '2026-01-03T16:00:00.000Z', JSON.stringify({
        exerciseName: 'Squat',
        prType: 'MAX_WEIGHT',
        value: 100,
        unit: 'kg',
        achievedAt: '2026-01-03T16:00:00.000Z'
      }), 'b1']
    );
    await db.run(
      'INSERT INTO health_events (source_event_id, category, ts, payload_json, bundle_id) VALUES (?, ?, ?, ?, ?)',
      ['e7', 'activity', '2026-01-02T12:00:00.000Z', JSON.stringify({
        weightKg: 80.5,
        heightM: 1.78
      }), 'b1']
    );

    await rebuildSummaries(db);

    const daily = await db.all<any[]>('SELECT day, summary_json FROM summaries_daily WHERE day = ?', ['2026-01-03']);
    expect(daily.length).toBe(1);
    expect(JSON.parse(daily[0].summary_json).activity).toBe(3);

    const filtered = applySensitivityPolicy(
      [
        { source_event_id: 'e1', category: 'activity', ts: '', payload_json: '{}' },
        { source_event_id: 'e2', category: 'mental_health', ts: '', payload_json: '{}' }
      ],
      {
        dataDir: temp,
        inboxDir: temp,
        dbPath: '',
        host: '127.0.0.1',
        port: 18432,
        encryptionKeyB64: 'abc',
        hiddenCategoriesByDefault: ['mental_health', 'sexual_health', 'reproductive_health', 'substance_use']
      }
    );
    expect(filtered).toHaveLength(1);

    const app = buildServer(db, {
      dataDir: temp,
      inboxDir: temp,
      dbPath: '',
      host: '127.0.0.1',
      port: 18432,
      encryptionKeyB64: 'abc',
      hiddenCategoriesByDefault: ['mental_health', 'sexual_health', 'reproductive_health', 'substance_use']
    });
    const res = await app.inject({ method: 'GET', url: '/v1/context/agent' });
    const payload = res.json();
    expect(payload.events.find((e: any) => e.category === 'mental_health')).toBeUndefined();

    const healthRes = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.json().schema_version).toBe('1.0');

    const snapshotRes = await app.inject({ method: 'GET', url: '/v1/snapshot?date=2026-01-03' });
    expect(snapshotRes.statusCode).toBe(200);
    expect(snapshotRes.json().snapshot.stepCount).toBe(3200);
    expect(snapshotRes.json().snapshot.workoutCount).toBe(1);

    const summaryRes = await app.inject({ method: 'GET', url: '/v1/summary?start=2026-01-03&end=2026-01-03' });
    expect(summaryRes.statusCode).toBe(200);
    expect(summaryRes.json().summary.newPrCount).toBe(1);

    const workoutsRes = await app.inject({ method: 'GET', url: '/v1/workouts' });
    expect(workoutsRes.json().items).toHaveLength(1);

    const nutritionRes = await app.inject({ method: 'GET', url: '/v1/nutrition' });
    expect(nutritionRes.json().items[0].mealName).toBe('Lunch');

    const recoveryRes = await app.inject({ method: 'GET', url: '/v1/recovery' });
    expect(recoveryRes.json().items[0].sleepHours).toBe(7.25);

    const prsRes = await app.inject({ method: 'GET', url: '/v1/prs' });
    expect(prsRes.json().items[0].exerciseName).toBe('Squat');

    await app.close();
    await db.close();
  });

  it('fails decryption with incorrect key', async () => {
    await sodium.ready;
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const keyA = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
    const keyB = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
    const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt('hello', null, null, nonce, keyA);

    expect(() => sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher, null, nonce, keyB)).toThrow();
  });
});

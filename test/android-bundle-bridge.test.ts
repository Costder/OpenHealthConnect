import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import { openDb, runMigrations } from '../src/db/index.js';
import { ingestBundleDir } from '../src/ingest/pipeline.js';
import { buildServer } from '../src/api/server.js';
import { encryptPayload, sha256Hex } from '../src/utils/crypto.js';

async function createAndroidBundle(base: string, keyB64: string) {
  await sodium.ready;
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const nonceB64 = sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL);
  const payloadObj = {
    events: [
      {
        id: 'activity-daily:2026-04-07',
        category: 'activity',
        ts: '2026-04-07T23:59:59.000Z',
        payload: {
          snapshotDate: '2026-04-07',
          stepCount: 8450,
          activeCaloriesBurned: 420,
          totalCaloriesBurned: 2500,
          sourceType: 'HEALTH_CONNECT'
        }
      },
      {
        id: 'body:2026-04-07',
        category: 'activity',
        ts: '2026-04-07T08:15:00.000Z',
        payload: {
          weightKg: 80.5,
          heightM: 1.78,
          recordedAt: '2026-04-07T08:15:00.000Z',
          sourceType: 'HEALTH_CONNECT'
        }
      },
      {
        id: 'nutrition:n-1',
        category: 'nutrition',
        ts: '2026-04-07T12:00:00.000Z',
        payload: {
          timestamp: '2026-04-07T12:00:00.000Z',
          mealName: 'Lunch',
          calories: 650,
          proteinGrams: 45,
          carbsGrams: 60,
          fatGrams: 20,
          sourceType: 'MANUAL'
        }
      },
      {
        id: 'recovery:r-1',
        category: 'sleep',
        ts: '2026-04-07T07:00:00.000Z',
        payload: {
          timestamp: '2026-04-07T07:00:00.000Z',
          sleepHours: 7.25,
          sleepQuality: 4,
          sorenessLevel: 2,
          fatigueLevel: 3,
          painLevel: 1,
          stressLevel: 2,
          recoveryScore: 81
        }
      },
      {
        id: 'workout:w-1',
        category: 'activity',
        ts: '2026-04-07T18:00:00.000Z',
        payload: {
          startTime: '2026-04-07T18:00:00.000Z',
          endTime: '2026-04-07T19:00:00.000Z',
          workoutType: 'Strength',
          completed: true,
          perceivedDifficulty: 7,
          painFlag: false,
          exerciseSets: [
            { id: 's-1', exerciseName: 'Squat', setIndex: 1, reps: 5, weightKg: 100, isBodyweight: false }
          ],
          sourceType: 'MANUAL'
        }
      },
      {
        id: 'reproductive:c-1',
        category: 'reproductive_health',
        ts: '2026-04-07T09:00:00.000Z',
        payload: {
          flow: 1,
          isStartOfCycle: false
        }
      },
      {
        id: 'sexual:a-1',
        category: 'sexual_health',
        ts: '2026-04-07T21:00:00.000Z',
        payload: {
          wasProtected: true
        }
      }
    ]
  };
  const plaintext = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const ciphertext = await encryptPayload(plaintext, nonceB64, keyB64);
  const manifest = {
    formatVersion: 1,
    bundleType: 'snapshot',
    bundleId: 'android-pixel7-000001-20260407T150000Z',
    sequence: 1,
    createdAt: '2026-04-07T15:00:00.000Z',
    transportMode: 'syncthing',
    integrity: { algorithm: 'sha256', ciphertextSha256: sha256Hex(ciphertext) },
    encryption: { algorithm: 'xchacha20poly1305', nonceB64 }
  };

  const bundleDir = path.join(base, manifest.bundleId);
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(path.join(bundleDir, 'payload.enc'), Buffer.from(ciphertext));
  fs.writeFileSync(path.join(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return bundleDir;
}

describe('android bridge bundle compatibility', () => {
  it('ingests Android-shaped snapshot bundles and serves the mirrored loopback API', async () => {
    await sodium.ready;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ohc-android-'));
    const key = sodium.to_base64(
      sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES),
      sodium.base64_variants.ORIGINAL
    );
    const db = await openDb(path.join(temp, 'db.sqlite'));
    await runMigrations(db);

    const bundleDir = await createAndroidBundle(temp, key);
    const result = await ingestBundleDir(db, bundleDir, key);
    expect(result.ingested).toBe(true);

    const app = buildServer(db, {
      dataDir: temp,
      inboxDir: temp,
      dbPath: path.join(temp, 'db.sqlite'),
      host: '127.0.0.1',
      port: 18432,
      encryptionKeyB64: key,
      directUploadToken: 'direct-upload-token-123456',
      hiddenCategoriesByDefault: ['mental_health', 'sexual_health', 'reproductive_health', 'substance_use']
    });

    expect((await app.inject({ method: 'GET', url: '/v1/health' })).json().schema_version).toBe('1.0');

    const snapshot = (await app.inject({ method: 'GET', url: '/v1/snapshot?date=2026-04-07' })).json();
    expect(snapshot.snapshot.stepCount).toBe(8450);
    expect(snapshot.snapshot.workoutCount).toBe(1);
    expect(snapshot.snapshot.weightKg).toBe(80.5);
    expect(snapshot.snapshot.caloriesConsumed).toBe(650);
    expect(snapshot.snapshot.recoveryScore).toBe(81);

    const summary = (await app.inject({ method: 'GET', url: '/v1/summary?start=2026-04-07&end=2026-04-07' })).json();
    expect(summary.summary.avgSteps).toBe(8450);
    expect(summary.summary.avgWeight).toBe(80.5);
    expect(summary.summary.avgCaloriesConsumed).toBe(650);

    const workouts = (await app.inject({ method: 'GET', url: '/v1/workouts?limit=5' })).json();
    expect(workouts.items).toHaveLength(1);
    expect(workouts.items[0].workoutType).toBe('Strength');

    const nutrition = (await app.inject({ method: 'GET', url: '/v1/nutrition?limit=5' })).json();
    expect(nutrition.items[0].mealName).toBe('Lunch');

    const recovery = (await app.inject({ method: 'GET', url: '/v1/recovery?limit=5' })).json();
    expect(recovery.items[0].sleepHours).toBe(7.25);

    const prs = (await app.inject({ method: 'GET', url: '/v1/prs?limit=5' })).json();
    expect(prs.items).toHaveLength(0);

    const context = (await app.inject({ method: 'GET', url: '/v1/context/agent' })).json();
    expect(context.events.find((event: any) => event.category === 'reproductive_health')).toBeUndefined();
    expect(context.events.find((event: any) => event.category === 'sexual_health')).toBeUndefined();

    await app.close();
    await db.close();
  });
});

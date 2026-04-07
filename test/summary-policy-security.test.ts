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
      ['e1', 'activity', '2026-01-03T12:00:00.000Z', '{}', 'b1']
    );
    await db.run(
      'INSERT INTO health_events (source_event_id, category, ts, payload_json, bundle_id) VALUES (?, ?, ?, ?, ?)',
      ['e2', 'mental_health', '2026-01-03T13:00:00.000Z', '{}', 'b1']
    );

    await rebuildSummaries(db);

    const daily = await db.all<any[]>('SELECT day, summary_json FROM summaries_daily');
    expect(daily.length).toBe(1);
    expect(JSON.parse(daily[0].summary_json).activity).toBe(1);

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
        port: 8787,
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
      port: 8787,
      encryptionKeyB64: 'abc',
      hiddenCategoriesByDefault: ['mental_health', 'sexual_health', 'reproductive_health', 'substance_use']
    });
    const res = await app.inject({ method: 'GET', url: '/v1/context/agent' });
    const payload = res.json();
    expect(payload.events.find((e: any) => e.category === 'mental_health')).toBeUndefined();

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

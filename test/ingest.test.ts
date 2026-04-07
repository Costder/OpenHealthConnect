import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import { openDb, runMigrations } from '../src/db/index.js';
import { ingestBundleDir } from '../src/ingest/pipeline.js';
import { sha256Hex, encryptPayload } from '../src/utils/crypto.js';

async function createBundle(base: string, keyB64: string, overrides: Record<string, any> = {}) {
  await sodium.ready;
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const nonceB64 = sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL);
  const payloadObj = {
    events: [
      { id: 'ev1', category: 'activity', ts: '2026-01-01T12:00:00.000Z', payload: { steps: 1000 } },
      { id: 'ev2', category: 'mental_health', ts: '2026-01-01T13:00:00.000Z', payload: { mood: 'ok' } }
    ]
  };
  const plaintext = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const ciphertext = await encryptPayload(plaintext, nonceB64, keyB64);
  const manifest = {
    formatVersion: 1,
    bundleType: 'snapshot',
    bundleId: 'bundle-1',
    sequence: 1,
    createdAt: '2026-01-01T12:10:00.000Z',
    transportMode: 'syncthing',
    integrity: { algorithm: 'sha256', ciphertextSha256: sha256Hex(ciphertext) },
    encryption: { algorithm: 'xchacha20poly1305', nonceB64 },
    ...overrides
  };
  const bundleDir = path.join(base, manifest.bundleId);
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(path.join(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(bundleDir, 'payload.enc'), Buffer.from(ciphertext));
  return bundleDir;
}

describe('ingest pipeline', () => {
  it('ingests bundle idempotently with integrity check', async () => {
    await sodium.ready;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ohc-test-'));
    const key = sodium.to_base64(sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES), sodium.base64_variants.ORIGINAL);
    const db = await openDb(path.join(temp, 'db.sqlite'));
    await runMigrations(db);

    const bundleDir = await createBundle(temp, key);
    const first = await ingestBundleDir(db, bundleDir, key);
    const second = await ingestBundleDir(db, bundleDir, key);
    const count = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM health_events');

    expect(first.ingested).toBe(true);
    expect(second.ingested).toBe(false);
    expect(count?.count).toBe(2);
    await db.close();
  });
});

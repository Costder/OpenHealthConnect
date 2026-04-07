import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import { buildServer } from '../src/api/server.js';
import { openDb, runMigrations } from '../src/db/index.js';
import { encryptPayload, randomToken, sha256Hex } from '../src/utils/crypto.js';

async function buildDirectUploadRequest(keyB64: string) {
  await sodium.ready;
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const nonceB64 = sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL);
  const plaintext = Buffer.from(JSON.stringify({
    events: [
      {
        id: 'direct-1',
        category: 'activity',
        ts: '2026-04-07T12:00:00.000Z',
        payload: {
          stepCount: 1234
        }
      }
    ]
  }), 'utf8');
  const ciphertext = await encryptPayload(plaintext, nonceB64, keyB64);

  return {
    manifest: {
      formatVersion: 1,
      bundleType: 'snapshot',
      bundleId: 'direct-upload-bundle-1',
      sequence: 1,
      createdAt: '2026-04-07T12:05:00.000Z',
      transportMode: 'tailscale',
      integrity: { algorithm: 'sha256', ciphertextSha256: sha256Hex(ciphertext) },
      encryption: { algorithm: 'xchacha20poly1305', nonceB64 }
    },
    payloadCiphertextB64: Buffer.from(ciphertext).toString('base64')
  };
}

describe('direct upload api', () => {
  it('ingests uploaded bundles when bearer token matches', async () => {
    await sodium.ready;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ohc-direct-'));
    const key = sodium.to_base64(
      sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES),
      sodium.base64_variants.ORIGINAL
    );
    const db = await openDb(path.join(temp, 'db.sqlite'));
    await runMigrations(db);
    const directUploadToken = await randomToken();

    const app = buildServer(db, {
      dataDir: temp,
      inboxDir: path.join(temp, 'inbox'),
      dbPath: path.join(temp, 'db.sqlite'),
      host: '127.0.0.1',
      port: 18432,
      encryptionKeyB64: key,
      directUploadToken,
      hiddenCategoriesByDefault: ['mental_health', 'sexual_health', 'reproductive_health', 'substance_use']
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/direct-upload',
      headers: {
        authorization: `Bearer ${directUploadToken}`
      },
      payload: await buildDirectUploadRequest(key)
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ingested).toBe(true);

    const snapshotRes = await app.inject({ method: 'GET', url: '/v1/snapshot?date=2026-04-07' });
    expect(snapshotRes.json().snapshot.stepCount).toBe(1234);

    await app.close();
    await db.close();
  });
});

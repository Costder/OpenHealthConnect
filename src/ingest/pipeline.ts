import type { Database } from 'sqlite';
import { eventSchema, type Manifest } from '../types/bundle.js';
import { decryptPayload } from '../utils/crypto.js';
import { validateBundle } from './validator.js';

export async function ingestBundleDir(db: Database, bundleDir: string, keyB64: string): Promise<{ ingested: boolean; reason?: string }> {
  const { manifest, ciphertext } = validateBundle(bundleDir);
  return ingestBundleParts(db, manifest, ciphertext, keyB64);
}

export async function ingestBundleParts(
  db: Database,
  manifest: Manifest,
  ciphertext: Uint8Array,
  keyB64: string
): Promise<{ ingested: boolean; reason?: string }> {
  const existing = await db.get<{ bundle_id: string }>('SELECT bundle_id FROM ingested_bundles WHERE bundle_id = ?', manifest.bundleId);
  if (existing) {
    return { ingested: false, reason: 'already-ingested' };
  }

  const plaintext = await decryptPayload(ciphertext, manifest.encryption.nonceB64, keyB64);
  const decoded = JSON.parse(Buffer.from(plaintext).toString('utf8')) as { events: unknown[] };
  const events = (decoded.events ?? []).map((e) => eventSchema.parse(e));

  await db.exec('BEGIN;');
  try {
    if (manifest.bundleType === 'snapshot') {
      await db.run('DELETE FROM health_events');
    }

    for (const event of events) {
      await db.run(
        `INSERT OR IGNORE INTO health_events (source_event_id, category, ts, payload_json, bundle_id)
         VALUES (?, ?, ?, ?, ?)`,
        [event.id, event.category, event.ts, JSON.stringify(event.payload), manifest.bundleId]
      );
    }

    await db.run(
      `INSERT INTO ingested_bundles
      (bundle_id, bundle_type, sequence, prev_bundle_id, transport_mode, created_at, ingested_at, ciphertext_sha256)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        manifest.bundleId,
        manifest.bundleType,
        manifest.sequence,
        manifest.prevBundleId ?? null,
        manifest.transportMode,
        manifest.createdAt,
        new Date().toISOString(),
        manifest.integrity.ciphertextSha256
      ]
    );

    await db.exec('COMMIT;');
    return { ingested: true };
  } catch (error) {
    await db.exec('ROLLBACK;');
    throw error;
  }
}

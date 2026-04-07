import type { Database } from 'sqlite';
import { manifestSchema, type Manifest } from '../types/bundle.js';
import { sha256Hex } from '../utils/crypto.js';
import { ingestBundleParts } from './pipeline.js';

export interface UploadBundleRequest {
  manifest: unknown;
  payloadCiphertextB64: string;
}

export async function ingestUploadedBundle(
  db: Database,
  keyB64: string,
  request: UploadBundleRequest
): Promise<{ ingested: boolean; reason?: string; manifest: Manifest }> {
  const manifest = manifestSchema.parse(request.manifest);
  const ciphertext = Buffer.from(request.payloadCiphertextB64, 'base64');

  if (sha256Hex(ciphertext) !== manifest.integrity.ciphertextSha256) {
    throw new Error(`Integrity mismatch for bundle ${manifest.bundleId}`);
  }

  const result = await ingestBundleParts(db, manifest, ciphertext, keyB64);
  return { ...result, manifest };
}

import fs from 'node:fs';
import path from 'node:path';
import { manifestSchema, type Manifest } from '../types/bundle.js';
import { sha256Hex } from '../utils/crypto.js';

export interface ValidatedBundle {
  manifest: Manifest;
  ciphertext: Uint8Array;
}

export function validateBundle(bundleDir: string): ValidatedBundle {
  const manifestPath = path.join(bundleDir, 'manifest.json');
  const payloadPath = path.join(bundleDir, 'payload.enc');

  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = manifestSchema.parse(JSON.parse(manifestRaw));
  const ciphertext = fs.readFileSync(payloadPath);

  if (sha256Hex(ciphertext) !== manifest.integrity.ciphertextSha256) {
    throw new Error(`Integrity mismatch for bundle ${manifest.bundleId}`);
  }

  return { manifest, ciphertext };
}

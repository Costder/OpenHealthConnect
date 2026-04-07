import { createHash } from 'node:crypto';
import qrcode from 'qrcode-terminal';
import { transportModeSchema } from '../types/bundle.js';
import {
  pairingPayloadSchema,
  type DirectPairingPayload,
  type FolderSyncPairingPayload,
  type LegacyPairingPayload,
  type PairingPayload
} from '../types/pairing.js';

function keyFingerprint(keyB64: string): string {
  return createHash('sha256').update(keyB64).digest('hex').slice(0, 12);
}

export function buildPairingPayload(keyB64: string, transportMode = 'syncthing'): LegacyPairingPayload {
  return pairingPayloadSchema.parse({
    type: 'ohc-pairing',
    version: 1,
    transportMode: transportModeSchema.parse(transportMode),
    keyB64,
    fingerprint: keyFingerprint(keyB64)
  }) as LegacyPairingPayload;
}

export function buildFolderSyncPairingPayload(keyB64: string, transportMode = 'syncthing'): FolderSyncPairingPayload {
  return pairingPayloadSchema.parse({
    type: 'ohc-pairing',
    version: 2,
    pairingMode: 'folder-sync',
    transportMode: transportModeSchema.parse(transportMode),
    keyB64,
    fingerprint: keyFingerprint(keyB64)
  }) as FolderSyncPairingPayload;
}

export function buildDirectPairingPayload(
  keyB64: string,
  directHostUrl: string,
  directUploadToken: string
): DirectPairingPayload {
  return pairingPayloadSchema.parse({
    type: 'ohc-pairing',
    version: 2,
    pairingMode: 'direct',
    directHostUrl,
    directUploadToken,
    keyB64,
    fingerprint: keyFingerprint(keyB64)
  }) as DirectPairingPayload;
}

export function renderPairingQr(keyB64: string, transportMode = 'syncthing'): string {
  const payload = buildPairingPayload(keyB64, transportMode);
  return JSON.stringify(payload);
}

export function renderFolderSyncPairingQr(keyB64: string, transportMode = 'syncthing'): string {
  return JSON.stringify(buildFolderSyncPairingPayload(keyB64, transportMode));
}

export function renderDirectPairingQr(keyB64: string, directHostUrl: string, directUploadToken: string): string {
  return JSON.stringify(buildDirectPairingPayload(keyB64, directHostUrl, directUploadToken));
}

export function printPairingQr(keyB64: string, transportMode = 'syncthing'): void {
  const serialized = renderPairingQr(keyB64, transportMode);
  console.log(serialized);
  qrcode.generate(serialized, { small: true });
}

export function printSerializedQr(serialized: string): void {
  console.log(serialized);
  qrcode.generate(serialized, { small: true });
}

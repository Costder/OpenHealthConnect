import { describe, expect, it } from 'vitest';
import { buildDirectPairingPayload, buildFolderSyncPairingPayload, buildPairingPayload } from '../src/pairing/qr.js';

describe('pairing qr payload', () => {
  it('supports all transport modes', () => {
    expect(buildPairingPayload('abcdefghijklmnopqrstuvwxyz1234567890==', 'syncthing').transportMode).toBe('syncthing');
    expect(buildPairingPayload('abcdefghijklmnopqrstuvwxyz1234567890==', 'nextcloud').transportMode).toBe('nextcloud');
    expect(buildPairingPayload('abcdefghijklmnopqrstuvwxyz1234567890==', 'tailscale').transportMode).toBe('tailscale');
  });

  it('builds explicit folder-sync pairing payloads', () => {
    const payload = buildFolderSyncPairingPayload('abcdefghijklmnopqrstuvwxyz1234567890==', 'syncthing');
    expect(payload.pairingMode).toBe('folder-sync');
    expect(payload.version).toBe(2);
  });

  it('builds direct pairing payloads', () => {
    const payload = buildDirectPairingPayload(
      'abcdefghijklmnopqrstuvwxyz1234567890==',
      'http://192.168.1.50:18432',
      'direct-upload-token-123456'
    );
    expect(payload.pairingMode).toBe('direct');
    expect(payload.directHostUrl).toBe('http://192.168.1.50:18432');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildDirectPairingInstructions,
  buildInitInstructions,
  buildLegacyPairingInstructions,
  buildServeInstructions,
  buildUsage
} from '../src/cliGuidance.js';
import type { AppConfig } from '../src/config/schema.js';

const config: AppConfig = {
  dataDir: 'C:\\OpenHealthConnect\\.ohc',
  inboxDir: 'C:\\OpenHealthConnect\\.ohc\\inbox',
  dbPath: 'C:\\OpenHealthConnect\\.ohc\\ohc.sqlite',
  host: '127.0.0.1',
  port: 18432,
  encryptionKeyB64: 'abcdefghijklmnopqrstuvwxyz1234567890==',
  directUploadToken: 'direct-upload-token-123456',
  hiddenCategoriesByDefault: ['mental_health', 'sexual_health', 'reproductive_health', 'substance_use']
};

describe('cli guidance', () => {
  it('shows onboarding steps after init', () => {
    const text = buildInitInstructions(config);
    expect(text).toContain('Folder-sync pairing');
    expect(text).toContain('pair qr direct');
    expect(text).toContain(config.inboxDir);
  });

  it('shows serve-time setup hints', () => {
    const text = buildServeInstructions(config);
    expect(text).toContain('/v1/health');
    expect(text).toContain('/v1/direct-upload');
  });

  it('shows pairing metadata for the Android flow', () => {
    const text = buildLegacyPairingInstructions(config, 'nextcloud');
    expect(text).toContain('Nextcloud / WebDAV');
    expect(text).toContain(config.inboxDir);
    expect(text).toContain('Fingerprint');
  });

  it('shows direct pairing metadata for instant pairing', () => {
    const text = buildDirectPairingInstructions(config, 'http://192.168.1.50:18432');
    expect(text).toContain('Pairing mode: Direct upload');
    expect(text).toContain('/v1/direct-upload');
  });

  it('prints a useful help message', () => {
    const text = buildUsage();
    expect(text).toContain('Common commands');
    expect(text).toContain('pair qr direct');
    expect(text).toContain('config set host 0.0.0.0');
  });
});

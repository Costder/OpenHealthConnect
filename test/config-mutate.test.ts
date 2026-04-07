import { describe, expect, it } from 'vitest';
import { applyConfigMutation } from '../src/config/mutate.js';
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

describe('config mutation', () => {
  it('updates host', () => {
    expect(applyConfigMutation(config, 'host', '0.0.0.0').host).toBe('0.0.0.0');
  });

  it('updates port', () => {
    expect(applyConfigMutation(config, 'port', '9999').port).toBe(9999);
  });

  it('rejects unsupported keys', () => {
    expect(() => applyConfigMutation(config, 'inboxDir', 'x')).toThrow(/Unsupported config key/);
  });
});

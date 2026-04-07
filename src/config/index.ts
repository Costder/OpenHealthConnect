import fs from 'node:fs';
import path from 'node:path';
import { configSchema, type AppConfig } from './schema.js';
import { randomToken, randomTokenSync } from '../utils/crypto.js';

const defaultConfigPath = path.resolve(process.cwd(), 'ohc.config.json');

export function loadConfig(configPath = defaultConfigPath): AppConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found at ${configPath}. Run "npm run init" or "node dist/src/cli.js init" first.`);
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (typeof parsed.directUploadToken !== 'string' || parsed.directUploadToken.length < 16) {
    parsed.directUploadToken = randomTokenSync();
    writeConfig(configSchema.parse(parsed), configPath);
  }
  return configSchema.parse(parsed);
}

export async function defaultConfigTemplate(baseDir: string, encryptionKeyB64: string): Promise<AppConfig> {
  return {
    dataDir: baseDir,
    inboxDir: path.join(baseDir, 'inbox'),
    dbPath: path.join(baseDir, 'ohc.sqlite'),
    host: '127.0.0.1',
    port: 18432,
    encryptionKeyB64,
    directUploadToken: await randomToken(),
    hiddenCategoriesByDefault: ['mental_health', 'sexual_health', 'reproductive_health', 'substance_use']
  };
}

export function writeConfig(config: AppConfig, configPath = defaultConfigPath): void {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

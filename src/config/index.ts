import fs from 'node:fs';
import path from 'node:path';
import { configSchema, type AppConfig } from './schema.js';

const defaultConfigPath = path.resolve(process.cwd(), 'ohc.config.json');

export function loadConfig(configPath = defaultConfigPath): AppConfig {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  return configSchema.parse(parsed);
}

export function defaultConfigTemplate(baseDir: string, encryptionKeyB64: string): AppConfig {
  return {
    dataDir: baseDir,
    inboxDir: path.join(baseDir, 'inbox'),
    dbPath: path.join(baseDir, 'ohc.sqlite'),
    host: '127.0.0.1',
    port: 8787,
    encryptionKeyB64,
    hiddenCategoriesByDefault: ['mental_health', 'sexual_health', 'reproductive_health', 'substance_use']
  };
}

export function writeConfig(config: AppConfig, configPath = defaultConfigPath): void {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

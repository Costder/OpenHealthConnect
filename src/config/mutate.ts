import type { AppConfig } from './schema.js';

export function applyConfigMutation(config: AppConfig, key: string, value: string): AppConfig {
  switch (key) {
    case 'host':
      if (!value.trim()) {
        throw new Error('Host must not be empty.');
      }
      return { ...config, host: value.trim() };
    case 'port': {
      const port = Number.parseInt(value, 10);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Port must be an integer between 1 and 65535.');
      }
      return { ...config, port };
    }
    default:
      throw new Error(`Unsupported config key "${key}". Supported keys: host, port`);
  }
}

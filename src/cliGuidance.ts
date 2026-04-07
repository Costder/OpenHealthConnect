import path from 'node:path';
import type { AppConfig } from './config/schema.js';
import { buildDirectPairingPayload, buildFolderSyncPairingPayload } from './pairing/qr.js';

const builtCliCommand = 'node dist/src/cli.js';

function transportLabel(transportMode: string): string {
  switch (transportMode) {
    case 'nextcloud':
      return 'Nextcloud / WebDAV';
    case 'tailscale':
      return 'Tailscale';
    default:
      return 'Syncthing';
  }
}

function configPath(): string {
  return path.resolve(process.cwd(), 'ohc.config.json');
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost';
}

export function buildInitInstructions(config: AppConfig): string {
  return [
    '',
    'Setup',
    `- Config: ${configPath()}`,
    `- Host API: http://${config.host}:${config.port}`,
    `- Host inbox: ${config.inboxDir}`,
    `- Direct upload token created: yes`,
    '',
    'Next steps',
    `1. Folder-sync pairing: ${builtCliCommand} pair qr folder-sync syncthing`,
    `2. Direct pairing: ${builtCliCommand} pair qr direct http://YOUR-HOST:18432`,
    `3. Start the service: ${builtCliCommand} serve`,
    `4. Check ingest status: ${builtCliCommand} status`,
    '',
    'Folder-sync transport variants',
    `- Nextcloud / WebDAV: ${builtCliCommand} pair qr folder-sync nextcloud`,
    `- Tailscale: ${builtCliCommand} pair qr folder-sync tailscale`
  ].join('\n');
}

export function buildServeInstructions(config: AppConfig): string {
  return [
    `- Waiting for encrypted bundles in: ${config.inboxDir}`,
    `- Folder-sync pairing: ${builtCliCommand} pair qr folder-sync syncthing`,
    `- Direct pairing: ${builtCliCommand} pair qr direct http://YOUR-HOST:${config.port}`,
    `- Direct upload endpoint: POST http://${config.host}:${config.port}/v1/direct-upload`,
    ...(isLoopbackHost(config.host)
      ? [`- Direct mode note: current bind host is ${config.host}; run ${builtCliCommand} config set host 0.0.0.0 before pairing phones directly.`]
      : []),
    `- Health check: http://${config.host}:${config.port}/v1/health`,
    `- Status command: ${builtCliCommand} status`
  ].join('\n');
}

export function buildLegacyPairingInstructions(config: AppConfig, transportMode: string): string {
  const payload = buildFolderSyncPairingPayload(config.encryptionKeyB64, transportMode);

  return [
    'Open Health Android Pairing',
    `- Pairing mode: Folder sync`,
    `- Transport: ${transportLabel(payload.transportMode)}`,
    `- Fingerprint: ${payload.fingerprint}`,
    `- Host inbox target: ${config.inboxDir}`,
    `- Host API: http://${config.host}:${config.port}`,
    '- Scan the QR in the Android app.',
    '- Then choose an Android export folder that syncs to the host inbox path above.',
    '',
    'Fallback JSON payload'
  ].join('\n');
}

export function buildDirectPairingInstructions(config: AppConfig, directHostUrl: string): string {
  const payload = buildDirectPairingPayload(config.encryptionKeyB64, directHostUrl, config.directUploadToken);

  return [
    'Open Health Android Pairing',
    '- Pairing mode: Direct upload',
    `- Fingerprint: ${payload.fingerprint}`,
    `- Direct host URL: ${payload.directHostUrl}`,
    `- Direct upload endpoint: ${payload.directHostUrl.replace(/\/$/, '')}/v1/direct-upload`,
    '- Scan the QR in the Android app.',
    '- The app should store the direct host URL and upload token, then export directly with no folder picker.',
    ...(isLoopbackHost(config.host)
      ? [`- Host bind warning: OHC is still configured to listen on ${config.host}; run ${builtCliCommand} config set host 0.0.0.0 before using direct pairing from another device.`]
      : []),
    '',
    'Fallback JSON payload'
  ].join('\n');
}

export function buildUsage(): string {
  return [
    'Usage: ohc <init|serve|status|config show|config set <host|port> <value>|pair [base64key]|pair qr [syncthing|nextcloud|tailscale]|pair qr folder-sync [syncthing|nextcloud|tailscale]|pair qr direct <hostUrl>|policy|rescan|reindex>',
    '',
    'Common commands',
    `- Initialize host state: ${builtCliCommand} init`,
    `- Make direct mode reachable on your LAN: ${builtCliCommand} config set host 0.0.0.0`,
    `- Start API + inbox watcher: ${builtCliCommand} serve`,
    `- Show folder-sync pairing QR: ${builtCliCommand} pair qr folder-sync syncthing`,
    `- Show direct pairing QR: ${builtCliCommand} pair qr direct http://YOUR-HOST:18432`,
    `- Check ingest counts: ${builtCliCommand} status`
  ].join('\n');
}

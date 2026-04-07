#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { loadConfig, defaultConfigTemplate, writeConfig } from './config/index.js';
import { applyConfigMutation } from './config/mutate.js';
import { openDb, runMigrations } from './db/index.js';
import { buildServer } from './api/server.js';
import { startInboxWatcher } from './watcher/inboxWatcher.js';
import { ingestBundleDir } from './ingest/pipeline.js';
import { rebuildSummaries } from './summary/engine.js';
import { randomKeyB64 } from './utils/crypto.js';
import { printPairingQr, printSerializedQr, renderDirectPairingQr, renderFolderSyncPairingQr } from './pairing/qr.js';
import {
  buildDirectPairingInstructions,
  buildInitInstructions,
  buildLegacyPairingInstructions,
  buildServeInstructions,
  buildUsage
} from './cliGuidance.js';

async function cmdInit(baseDir = path.resolve(process.cwd(), '.ohc')): Promise<void> {
  const key = await randomKeyB64();
  fs.mkdirSync(baseDir, { recursive: true });
  fs.mkdirSync(path.join(baseDir, 'inbox'), { recursive: true });
  const config = await defaultConfigTemplate(baseDir, key);
  writeConfig(config);
  const db = await openDb(config.dbPath);
  await runMigrations(db);
  await db.close();
  console.log('Initialized Open Health Connect at', baseDir);
  console.log(buildInitInstructions(config));
  if (process.stdout.isTTY) {
    console.log('');
    console.log('Default Android pairing QR (Syncthing)');
    console.log(buildLegacyPairingInstructions(config, 'syncthing'));
    printPairingQr(config.encryptionKeyB64, 'syncthing');
  }
}

async function cmdServe(): Promise<void> {
  const config = loadConfig();
  const db = await openDb(config.dbPath);
  await runMigrations(db);
  await rebuildSummaries(db);
  const closeWatcher = startInboxWatcher(db, config.inboxDir, config.encryptionKeyB64);
  const app = buildServer(db, config);
  await app.listen({ host: config.host, port: config.port });
  console.log(`Serving on http://${config.host}:${config.port}`);
  console.log(buildServeInstructions(config));

  const shutdown = async () => {
    await closeWatcher();
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function cmdStatus(): Promise<void> {
  const config = loadConfig();
  const db = await openDb(config.dbPath);
  const bundles = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM ingested_bundles');
  const events = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM health_events');
  console.log(JSON.stringify({ dbPath: config.dbPath, inboxDir: config.inboxDir, bundles: bundles?.count ?? 0, events: events?.count ?? 0 }, null, 2));
  await db.close();
}

async function cmdConfig(args: string[]): Promise<void> {
  const config = loadConfig();

  if (args[0] === 'show' || args.length === 0) {
    console.log(JSON.stringify({
      host: config.host,
      port: config.port,
      inboxDir: config.inboxDir,
      dbPath: config.dbPath,
      directUploadEnabled: true
    }, null, 2));
    return;
  }

  if (args[0] === 'set') {
    const key = args[1];
    const value = args[2];
    if (!key || !value) {
      throw new Error('Usage: ohc config set <host|port> <value>');
    }

    const updated = applyConfigMutation(config, key, value);
    writeConfig(updated);
    console.log(JSON.stringify({ key, value: updated[key as 'host' | 'port'] }, null, 2));
    return;
  }

  throw new Error('Usage: ohc config show | ohc config set <host|port> <value>');
}

async function cmdPair(keyB64?: string): Promise<void> {
  await sodium.ready;
  const config = loadConfig();
  const key = keyB64 ?? sodium.to_base64(sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES), sodium.base64_variants.ORIGINAL);
  config.encryptionKeyB64 = key;
  writeConfig(config);
  console.log('Pair key updated in config.');
}

async function cmdPairQr(transportMode?: string): Promise<void> {
  const config = loadConfig();
  const selectedTransport = transportMode ?? 'syncthing';
  console.log(buildLegacyPairingInstructions(config, selectedTransport));
  printPairingQr(config.encryptionKeyB64, selectedTransport);
}

async function cmdPairQrFolderSync(transportMode?: string): Promise<void> {
  const config = loadConfig();
  const selectedTransport = transportMode ?? 'syncthing';
  console.log(buildLegacyPairingInstructions(config, selectedTransport));
  printSerializedQr(renderFolderSyncPairingQr(config.encryptionKeyB64, selectedTransport));
}

async function cmdPairQrDirect(directHostUrl?: string): Promise<void> {
  if (!directHostUrl) {
    throw new Error('Direct pairing requires a reachable host URL, for example: node dist/src/cli.js pair qr direct http://192.168.1.50:18432');
  }

  const config = loadConfig();
  console.log(buildDirectPairingInstructions(config, directHostUrl));
  printSerializedQr(renderDirectPairingQr(config.encryptionKeyB64, directHostUrl, config.directUploadToken));
}

async function cmdPolicy(args: string[]): Promise<void> {
  const config = loadConfig();
  if (args[0] === 'show') {
    console.log(JSON.stringify({ hiddenCategoriesByDefault: config.hiddenCategoriesByDefault }, null, 2));
  } else if (args[0] === 'set') {
    config.hiddenCategoriesByDefault = args.slice(1) as any;
    writeConfig(config);
    console.log('Policy updated.');
  } else {
    console.log('Usage: ohc policy show|set <category...>');
  }
}

async function cmdRescan(): Promise<void> {
  const config = loadConfig();
  const db = await openDb(config.dbPath);
  await runMigrations(db);
  const entries = fs.readdirSync(config.inboxDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const entry of entries) {
    const dir = path.join(config.inboxDir, entry.name);
    if (fs.existsSync(path.join(dir, 'manifest.json')) && fs.existsSync(path.join(dir, 'payload.enc'))) {
      await ingestBundleDir(db, dir, config.encryptionKeyB64);
    }
  }
  await rebuildSummaries(db);
  await db.close();
  console.log('Rescan complete.');
}

async function cmdReindex(): Promise<void> {
  const config = loadConfig();
  const db = await openDb(config.dbPath);
  await rebuildSummaries(db);
  await db.close();
  console.log('Reindex complete.');
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'init':
      await cmdInit(args[0]);
      break;
    case 'serve':
      await cmdServe();
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'config':
      await cmdConfig(args);
      break;
    case 'pair':
      if (args[0] === 'qr') {
        if (args[1] === 'folder-sync') {
          await cmdPairQrFolderSync(args[2]);
        } else if (args[1] === 'direct') {
          await cmdPairQrDirect(args[2]);
        } else {
          await cmdPairQr(args[1]);
        }
      } else {
        await cmdPair(args[0]);
      }
      break;
    case 'policy':
      await cmdPolicy(args);
      break;
    case 'rescan':
      await cmdRescan();
      break;
    case 'reindex':
      await cmdReindex();
      break;
    default:
      console.log(buildUsage());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

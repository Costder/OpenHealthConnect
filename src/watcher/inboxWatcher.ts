import fs from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';
import type { Database } from 'sqlite';
import { ingestBundleDir } from '../ingest/pipeline.js';
import { rebuildSummaries } from '../summary/engine.js';

export function startInboxWatcher(db: Database, inboxDir: string, keyB64: string): () => Promise<void> {
  fs.mkdirSync(inboxDir, { recursive: true });

  const maybeIngest = async (filePath: string): Promise<void> => {
    if (!filePath.endsWith('manifest.json')) return;
    const bundleDir = path.dirname(filePath);
    await ingestBundleDir(db, bundleDir, keyB64);
    await rebuildSummaries(db);
  };

  const watcher = chokidar.watch(path.join(inboxDir, '*', 'manifest.json'), {
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  });

  watcher.on('add', (p) => {
    maybeIngest(p).catch((err) => {
      console.error('Ingest failed for', p, err);
    });
  });

  return async () => {
    await watcher.close();
  };
}

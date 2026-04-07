import fs from 'node:fs';
import path from 'node:path';
import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';

export async function openDb(dbPath: string): Promise<Database> {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return db;
}

export async function runMigrations(db: Database): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), 'src', 'migrations');
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL);');
  const rows = await db.all<{ name: string }[]>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.exec('BEGIN;');
    try {
      await db.exec(sql);
      await db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [file, new Date().toISOString()]);
      await db.exec('COMMIT;');
    } catch (error) {
      await db.exec('ROLLBACK;');
      throw error;
    }
  }
}

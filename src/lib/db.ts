import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA } from './schema';
import { seedExercises } from './seed';
import { translateLegacyPlan } from './templates';

export type Db = DatabaseSync;

/** CREATE TABLE IF NOT EXISTS never alters a table that already exists, so new columns are added here. */
function addColumnIfMissing(db: Db, table: string, column: string, type: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  addColumnIfMissing(db, 'routine_exercises', 'reps_label', 'TEXT');
  addColumnIfMissing(db, 'routine_exercises', 'note', 'TEXT');
  seedExercises(db);
  translateLegacyPlan(db);
  return db;
}

let instance: Db | undefined;

/** Process-wide connection. The file location comes from DB_PATH (default ./data/gym.db). */
export function getDb(): Db {
  return (instance ??= openDb(process.env.DB_PATH ?? './data/gym.db'));
}

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db';
import { getRoutineItems, listExercises } from './repo';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gym-db-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('openDb migration', () => {
  it('upgrades a database created before reps_label/note existed, keeping its data', () => {
    const path = join(dir, 'old.db');
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE exercises (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, equipment TEXT NOT NULL, muscle_group TEXT NOT NULL);
      CREATE TABLE routines (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE routine_exercises (
        id INTEGER PRIMARY KEY, routine_id INTEGER NOT NULL, exercise_id INTEGER NOT NULL,
        position INTEGER NOT NULL, target_sets INTEGER NOT NULL, target_reps INTEGER NOT NULL, rest_seconds INTEGER NOT NULL
      );
      INSERT INTO exercises (id, name, equipment, muscle_group) VALUES (1, 'Dumbbell bench press', 'dumbbells', 'chest');
      INSERT INTO routines (id, name) VALUES (1, 'Old routine');
      INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets, target_reps, rest_seconds)
        VALUES (1, 1, 0, 3, 10, 90);
    `);
    old.close();

    const db = openDb(path);
    // The English row is renamed in place: same id, so the routine keeps pointing at it.
    expect(getRoutineItems(db, 1)).toEqual([
      expect.objectContaining({
        name: 'Press de banca con mancuernas',
        targetSets: 3,
        repsLabel: null,
        note: null,
      }),
    ]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM exercises WHERE name = 'Dumbbell bench press'").get()).toEqual({ n: 0 });
    expect(listExercises(db).length).toBeGreaterThan(1);
    db.close();

    // Opening it again must not fail on the already-added columns.
    expect(() => openDb(path).close()).not.toThrow();
  });
});

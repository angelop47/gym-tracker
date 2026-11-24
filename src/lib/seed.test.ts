import { describe, expect, it } from 'vitest';
import { openDb } from './db';
import { EXERCISES } from './seed';
import { listExercises } from './repo';

describe('exercise catalogue', () => {
  it('is stored in Spanish, with unique names', () => {
    const db = openDb(':memory:');
    const exercises = listExercises(db);
    expect(exercises).toHaveLength(EXERCISES.length);
    expect(new Set(exercises.map((e) => e.name)).size).toBe(EXERCISES.length);
    expect(exercises.map((e) => e.name)).toContain('Press de banca con mancuernas');
    expect(new Set(exercises.map((e) => e.muscleGroup))).toEqual(
      new Set(['pecho', 'espalda', 'hombros', 'bíceps', 'tríceps', 'piernas', 'core']),
    );
  });
});

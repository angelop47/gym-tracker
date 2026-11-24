import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './db';
import { getRoutineItems, getWeekPlan, listRoutines } from './repo';
import { FIVE_DAY_PLAN, installPlan, translateLegacyPlan } from './templates';

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
});

describe('installPlan(FIVE_DAY_PLAN)', () => {
  it('creates five routines on Mon, Tue, Thu, Fri and Sat', () => {
    const { created } = installPlan(db, FIVE_DAY_PLAN);
    expect(created).toHaveLength(5);
    const routines = listRoutines(db);
    expect(routines.map((r) => r.exerciseCount).sort()).toEqual([5, 5, 6, 6, 6]);
    const week = getWeekPlan(db);
    expect(week.map((id) => (id === null ? null : routines.find((r) => r.id === id)!.name.slice(0, 5)))).toEqual([
      null, // Sunday
      'Día 1',
      'Día 2',
      null, // Wednesday
      'Día 3',
      'Día 4',
      'Día 5',
    ]);
  });

  it('keeps the rep range, rest and notes of the source plan', () => {
    installPlan(db, FIVE_DAY_PLAN);
    const day1 = listRoutines(db).find((r) => r.name.startsWith('Día 1'))!;
    const [bench, pullUp] = getRoutineItems(db, day1.id);
    expect(bench).toMatchObject({ name: 'Press de banca con mancuernas', targetSets: 4, repsLabel: '6–8', restSeconds: 180 });
    expect(pullUp).toMatchObject({ name: 'Dominadas agarre ancho', targetSets: 4, repsLabel: '5–8' });
    const day3 = listRoutines(db).find((r) => r.name.startsWith('Día 3'))!;
    expect(getRoutineItems(db, day3.id).at(-1)).toMatchObject({ targetSets: 2, repsLabel: 'al fallo' });
  });

  it('is idempotent: a second run creates nothing and does not duplicate routines', () => {
    installPlan(db, FIVE_DAY_PLAN);
    const second = installPlan(db, FIVE_DAY_PLAN);
    expect(second.created).toEqual([]);
    expect(second.kept).toHaveLength(5);
    expect(listRoutines(db)).toHaveLength(5);
  });

  it('leaves other weekdays untouched and refuses unknown exercises without creating anything', () => {
    expect(() =>
      installPlan(db, [{ weekday: 3, name: 'Bad', items: [{ exercise: 'Nope', sets: 1, reps: 1, repsLabel: '1', restSeconds: 30 }] }]),
    ).toThrow('Unknown exercise');
    expect(listRoutines(db)).toEqual([]);
  });
});

describe('translateLegacyPlan', () => {
  it('translates a plan loaded in English in place, keeping ids, and leaves nothing to reinstall', () => {
    installPlan(db, FIVE_DAY_PLAN);
    const day1 = listRoutines(db).find((r) => r.name.startsWith('Día 1'))!;
    // Put the database back in the state it had when the plan was in English.
    db.prepare('UPDATE routines SET name = ? WHERE id = ?').run('Day 1 · Chest + back (strength)', day1.id);
    db.prepare("UPDATE routine_exercises SET note = 'per arm, bench-supported' WHERE note = 'por brazo, apoyado en banco' AND routine_id = ?").run(day1.id);
    db.prepare("UPDATE routine_exercises SET reps_label = 'max' WHERE reps_label = 'máx'").run();

    translateLegacyPlan(db);

    expect(listRoutines(db).find((r) => r.id === day1.id)!.name).toBe('Día 1 · Pecho + espalda (fuerza)');
    expect(getRoutineItems(db, day1.id).map((i) => i.note)).toContain('por brazo, apoyado en banco');
    expect(installPlan(db, FIVE_DAY_PLAN).created).toEqual([]);
    expect(listRoutines(db)).toHaveLength(5);
  });

  it('does not touch routines the user wrote themselves', () => {
    db.prepare("INSERT INTO routines (name) VALUES ('My own routine')").run();
    translateLegacyPlan(db);
    expect(listRoutines(db).map((r) => r.name)).toEqual(['My own routine']);
  });
});

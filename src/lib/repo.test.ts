import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './db';
import {
  addSet,
  applyWorkoutEdit,
  createRoutine,
  deleteSet,
  deleteWorkout,
  finishWorkout,
  getActiveWorkoutId,
  getExerciseSetHistory,
  getRoutine,
  getRoutineItems,
  getSession,
  getWeekPlan,
  getWorkoutSummary,
  listExercises,
  listExercisesWithHistory,
  listRecentWorkouts,
  listRoutines,
  listWorkoutsBetween,
  setWeekPlan,
  startWorkout,
  updateRoutine,
} from './repo';

let db: Db;
let exA: number;
let exB: number;

beforeEach(() => {
  db = openDb(':memory:');
  [exA, exB] = listExercises(db).map((e) => e.id);
});

const item = (exerciseId: number) => ({ exerciseId, targetSets: 3, targetReps: 10, restSeconds: 90 });

describe('exercises', () => {
  it('seeds the home-gym exercise catalogue', () => {
    const equipment = new Set(listExercises(db).map((e) => e.equipment));
    expect(equipment).toContain('anillas');
    expect(equipment).toContain('barra de dominadas');
  });
});

describe('routines', () => {
  it('stores exercises in the given order with their targets', () => {
    const id = createRoutine(db, ' Push ', [item(exB), item(exA)]);
    expect(listRoutines(db)).toEqual([{ id, name: 'Push', exerciseCount: 2 }]);
    const items = getRoutineItems(db, id);
    expect(items.map((i) => i.exerciseId)).toEqual([exB, exA]);
    expect(items[0]).toMatchObject({ targetSets: 3, targetReps: 10, restSeconds: 90 });
  });

  it('rejects an invalid routine without leaving a partial row', () => {
    expect(() => createRoutine(db, 'Bad', [item(exA), { ...item(exB), targetSets: 0 }])).toThrow();
    expect(() => createRoutine(db, 'Bad', [item(99999)])).toThrow();
    expect(() => createRoutine(db, '  ', [item(exA)])).toThrow('obligatorio');
    expect(() => createRoutine(db, 'Empty', [])).toThrow('al menos un ejercicio');
    expect(listRoutines(db)).toEqual([]);
  });
});

describe('week plan', () => {
  it('assigns routines to weekdays and can clear them', () => {
    const id = createRoutine(db, 'Push', [item(exA)]);
    setWeekPlan(db, [null, id, null, id, null, null, null]);
    expect(getWeekPlan(db)).toEqual([null, id, null, id, null, null, null]);
    setWeekPlan(db, Array(7).fill(null));
    expect(getWeekPlan(db)).toEqual(Array(7).fill(null));
  });

  it('empties the day when its routine is deleted', () => {
    const id = createRoutine(db, 'Push', [item(exA)]);
    setWeekPlan(db, [null, id, null, null, null, null, null]);
    db.prepare('DELETE FROM routines WHERE id = ?').run(id);
    expect(getWeekPlan(db)[1]).toBeNull();
  });
});

describe('workouts', () => {
  let routineId: number;
  beforeEach(() => {
    routineId = createRoutine(db, 'Push', [item(exA), item(exB)]);
  });

  it('tracks start, sets and finish', () => {
    const w = startWorkout(db, routineId, 1000);
    expect(getActiveWorkoutId(db)).toBe(w);
    const s1 = addSet(db, { workoutId: w, exerciseId: exA, reps: 10, weightKg: 20, now: 2000 });
    const s2 = addSet(db, { workoutId: w, exerciseId: exA, reps: 8, weightKg: 22.5, now: 3000 });
    addSet(db, { workoutId: w, exerciseId: exB, reps: 12, weightKg: 10, now: 4000 });
    expect([s1.setNumber, s2.setNumber]).toEqual([1, 2]);
    finishWorkout(db, w, 5000);
    expect(getActiveWorkoutId(db)).toBeNull();
    const summary = getWorkoutSummary(db, w);
    expect(summary.volumeKg).toBe(10 * 20 + 8 * 22.5 + 12 * 10);
    expect(summary.exercises.map((e) => e.sets.length)).toEqual([2, 1]);
    expect(listRecentWorkouts(db, 5)[0]).toMatchObject({ id: w, setCount: 3, endedAt: 5000 });
  });

  it('lists the workouts that started inside a range, oldest first, with half-open bounds', () => {
    const early = startWorkout(db, routineId, 1000);
    const mid = startWorkout(db, routineId, 2000);
    addSet(db, { workoutId: mid, exerciseId: exA, reps: 10, weightKg: 10, now: 2100 });
    startWorkout(db, routineId, 3000); // exactly at the (exclusive) upper bound
    const inRange = listWorkoutsBetween(db, 1000, 3000);
    expect(inRange.map((w) => w.id)).toEqual([early, mid]);
    expect(inRange[1]).toMatchObject({ setCount: 1, volumeKg: 100 });
    expect(listWorkoutsBetween(db, 5000, 6000)).toEqual([]);
  });

  it('exposes rep totals and the per-exercise history used for progress', () => {
    const w1 = startWorkout(db, routineId, 1000);
    addSet(db, { workoutId: w1, exerciseId: exA, reps: 10, weightKg: 20, now: 1100 });
    addSet(db, { workoutId: w1, exerciseId: exB, reps: 12, weightKg: 5, now: 1200 });
    const w2 = startWorkout(db, routineId, 2000);
    addSet(db, { workoutId: w2, exerciseId: exA, reps: 8, weightKg: 25, now: 2100 });

    expect(listRecentWorkouts(db, 5).find((w) => w.id === w1)).toMatchObject({ setCount: 2, repCount: 22 });
    expect(getExerciseSetHistory(db, exA)).toEqual([
      { workoutId: w1, startedAt: 1000, reps: 10, weightKg: 20 },
      { workoutId: w2, startedAt: 2000, reps: 8, weightKg: 25 },
    ]);
    const withHistory = listExercisesWithHistory(db);
    expect(withHistory.map((e) => [e.id, e.sessions])).toEqual(
      expect.arrayContaining([[exA, 2], [exB, 1]]),
    );
    expect(withHistory[0].id).toBe(exA); // most trained first
    expect(withHistory).toHaveLength(2); // exercises never logged are left out
  });

  it('rejects unknown routines, bad input and writes after finish', () => {
    expect(() => startWorkout(db, 999, 1)).toThrow('Rutina no encontrada');
    const w = startWorkout(db, routineId, 1000);
    expect(() => addSet(db, { workoutId: w, exerciseId: exA, reps: 0, weightKg: 20, now: 1 })).toThrow();
    expect(() => addSet(db, { workoutId: w, exerciseId: exA, reps: 5, weightKg: -1, now: 1 })).toThrow();
    finishWorkout(db, w, 2000);
    expect(() => addSet(db, { workoutId: w, exerciseId: exA, reps: 5, weightKg: 5, now: 3 })).toThrow('ya terminó');
    expect(() => finishWorkout(db, w, 3000)).toThrow();
  });

  it('removes a set from an open or a finished workout and renumbers the ones that remain', () => {
    const w = startWorkout(db, routineId, 1000);
    const s1 = addSet(db, { workoutId: w, exerciseId: exA, reps: 10, weightKg: 20, now: 2000 });
    const s2 = addSet(db, { workoutId: w, exerciseId: exA, reps: 9, weightKg: 20, now: 3000 });
    const s3 = addSet(db, { workoutId: w, exerciseId: exA, reps: 8, weightKg: 20, now: 4000 });
    deleteSet(db, s2.id);
    const numbers = () =>
      db.prepare('SELECT id, set_number AS n FROM sets WHERE workout_id = ? ORDER BY set_number').all(w).map((r) => ({ ...r }));
    expect(numbers()).toEqual([{ id: s1.id, n: 1 }, { id: s3.id, n: 2 }]);
    // A new set must not reuse a number that is still taken.
    expect(addSet(db, { workoutId: w, exerciseId: exA, reps: 7, weightKg: 20, now: 5000 }).setNumber).toBe(3);

    finishWorkout(db, w, 6000);
    deleteSet(db, s1.id);
    expect(numbers().map((r) => r.n)).toEqual([1, 2]);
    expect(() => deleteSet(db, 99999)).toThrow('Serie no encontrada');
  });

  it('offers the previous session as default for the same exercise', () => {
    const w1 = startWorkout(db, routineId, 1000);
    addSet(db, { workoutId: w1, exerciseId: exA, reps: 9, weightKg: 24, now: 2000 });
    finishWorkout(db, w1, 3000);
    const w2 = startWorkout(db, routineId, 10_000);
    const session = getSession(db, w2)!;
    expect(session.items[0].last).toEqual({ reps: 9, weightKg: 24 });
    expect(session.items[1].last).toBeNull();
    expect(getSession(db, 12345)).toBeNull();
  });
});

describe('editing history', () => {
  let routineId: number;
  let w: number;
  let setIds: number[];
  beforeEach(() => {
    routineId = createRoutine(db, 'Push', [item(exA), item(exB)]);
    w = startWorkout(db, routineId, 10_000);
    setIds = [
      addSet(db, { workoutId: w, exerciseId: exA, reps: 10, weightKg: 20, now: 11_000 }).id,
      addSet(db, { workoutId: w, exerciseId: exA, reps: 9, weightKg: 20, now: 12_000 }).id,
      addSet(db, { workoutId: w, exerciseId: exB, reps: 12, weightKg: 5, now: 13_000 }).id,
    ];
    finishWorkout(db, w, 20_000);
  });

  it('deletes a workout with its sets and leaves other workouts, routines and exercises alone', () => {
    const other = startWorkout(db, routineId, 50_000);
    addSet(db, { workoutId: other, exerciseId: exA, reps: 5, weightKg: 5, now: 51_000 });
    deleteWorkout(db, w);
    expect(getSession(db, w)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sets WHERE workout_id = ?').get(w)).toEqual({ n: 0 });
    expect(listRecentWorkouts(db, 10).map((x) => x.id)).toEqual([other]);
    expect(listRoutines(db)).toHaveLength(1);
    expect(listExercises(db).length).toBeGreaterThan(2);
    expect(() => deleteWorkout(db, w)).toThrow('Entrenamiento no encontrado');
  });

  it('edits reps and weight of sets of a finished workout and drops removed sets', () => {
    applyWorkoutEdit(db, w, {
      sets: [
        { setId: setIds[0], reps: 8, weightKg: 22.5 },
        { setId: setIds[1], reps: 9, weightKg: 20, remove: true },
        { setId: setIds[2], reps: 12, weightKg: 5 },
      ],
    });
    const summary = getWorkoutSummary(db, w);
    expect(summary.exercises.map((e) => e.sets.map((s) => [s.reps, s.weightKg]))).toEqual([[[8, 22.5]], [[12, 5]]]);
    expect(summary.volumeKg).toBe(8 * 22.5 + 12 * 5);
  });

  it('applies nothing when any edit is invalid (all or nothing)', () => {
    const before = getWorkoutSummary(db, w);
    expect(() =>
      applyWorkoutEdit(db, w, {
        sets: [{ setId: setIds[0], reps: 1, weightKg: 1 }, { setId: setIds[1], reps: 0, weightKg: 1 }],
      }),
    ).toThrow('repeticiones');
    expect(() =>
      applyWorkoutEdit(db, w, { sets: [{ setId: setIds[0], reps: 1, weightKg: 1 }, { setId: 99999, reps: 1, weightKg: 1 }] }),
    ).toThrow('Serie no encontrada');
    expect(() => applyWorkoutEdit(db, w, { sets: [{ setId: setIds[0], reps: 5, weightKg: -2 }] })).toThrow('peso');
    expect(getWorkoutSummary(db, w)).toEqual(before);
  });

  it("refuses to touch another workout's sets", () => {
    const other = startWorkout(db, routineId, 50_000);
    const foreign = addSet(db, { workoutId: other, exerciseId: exA, reps: 5, weightKg: 5, now: 51_000 });
    expect(() => applyWorkoutEdit(db, w, { sets: [{ setId: foreign.id, reps: 99, weightKg: 99 }] })).toThrow();
    expect(getWorkoutSummary(db, other).exercises[0].sets[0]).toMatchObject({ reps: 5, weightKg: 5 });
  });

  it('moves the start time and shifts the end and every set by the same amount', () => {
    applyWorkoutEdit(db, w, { startedAt: 10_000 + 86_400_000, sets: [] });
    const [moved] = listWorkoutsBetween(db, 0, 1e12);
    expect(moved).toMatchObject({ id: w, startedAt: 10_000 + 86_400_000, endedAt: 20_000 + 86_400_000 });
    const times = db.prepare('SELECT completed_at AS t FROM sets WHERE workout_id = ? ORDER BY completed_at').all(w).map((r) => r.t);
    expect(times).toEqual([11_000, 12_000, 13_000].map((t) => t + 86_400_000));
    expect(() => applyWorkoutEdit(db, w, { startedAt: Number.NaN, sets: [] })).toThrow('Fecha');
    expect(() => applyWorkoutEdit(db, 999, { sets: [] })).toThrow('Entrenamiento no encontrado');
  });

  it('keeps an unfinished workout unfinished when its start moves', () => {
    const open = startWorkout(db, routineId, 100_000);
    applyWorkoutEdit(db, open, { startedAt: 90_000, sets: [] });
    expect(listWorkoutsBetween(db, 0, 1e12).find((x) => x.id === open)).toMatchObject({ startedAt: 90_000, endedAt: null });
  });
});

describe('editing routines', () => {
  it('replaces the exercises, keeps the id, the weekday and the finished workouts', () => {
    const id = createRoutine(db, 'Push', [item(exA), item(exB)]);
    setWeekPlan(db, [null, id, null, null, null, null, null]);
    const w = startWorkout(db, id, 1000);
    addSet(db, { workoutId: w, exerciseId: exA, reps: 10, weightKg: 20, now: 2000 });
    finishWorkout(db, w, 3000);

    updateRoutine(db, id, ' Push v2 ', [
      { exerciseId: exB, targetSets: 4, targetReps: 8, restSeconds: 120, repsLabel: '6–8', note: 'lento' },
    ]);

    expect(getRoutine(db, id)).toMatchObject({ id, name: 'Push v2' });
    expect(getRoutineItems(db, id)).toEqual([
      expect.objectContaining({ exerciseId: exB, targetSets: 4, restSeconds: 120, repsLabel: '6–8', note: 'lento' }),
    ]);
    expect(getWeekPlan(db)[1]).toBe(id);
    expect(getWorkoutSummary(db, w).exercises[0].sets).toHaveLength(1); // history intact
  });

  it('rejects invalid updates without changing anything, and unknown routines', () => {
    const id = createRoutine(db, 'Push', [item(exA)]);
    expect(() => updateRoutine(db, id, 'X', [])).toThrow('al menos un ejercicio');
    expect(() => updateRoutine(db, id, '  ', [item(exA)])).toThrow('obligatorio');
    expect(() => updateRoutine(db, id, 'Nuevo', [item(exA), item(99999)])).toThrow(); // unknown exercise: FK error
    expect(getRoutine(db, id)).toMatchObject({ name: 'Push' });
    expect(getRoutineItems(db, id)).toHaveLength(1);
    expect(() => updateRoutine(db, 999, 'X', [item(exA)])).toThrow('Rutina no encontrada');
    expect(getRoutine(db, 999)).toBeNull();
  });
});

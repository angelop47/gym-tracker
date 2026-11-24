import type { Db } from './db';
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_EXERCISE, sniffImageMime } from './photos';

export type Exercise = {
  id: number;
  name: string;
  equipment: string;
  muscleGroup: string;
  /** Photo ids, oldest first: the image is served at /photos/<id>. */
  photoIds: number[];
};
export type RoutineItemInput = {
  exerciseId: number;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
  /** Display text for the rep target, e.g. "6–8" or "max". targetReps stays the top of the range. */
  repsLabel?: string | null;
  /** Free text such as "per arm" or "1 s pause". */
  note?: string | null;
};
export type RoutineItem = RoutineItemInput & {
  name: string;
  equipment: string;
  photoIds: number[];
};
export type SetRow = {
  id: number;
  exerciseId: number;
  setNumber: number;
  reps: number;
  weightKg: number;
  completedAt: number;
};
export type SessionItem = RoutineItem & {
  sets: Pick<SetRow, 'id' | 'reps' | 'weightKg' | 'completedAt'>[];
  last: { reps: number; weightKg: number } | null;
};

const isPosInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

/** node:sqlite returns null-prototype rows; copy them so they serialize as plain objects. */
function all<T>(db: Db, sql: string, ...params: (string | number | null)[]): T[] {
  return db
    .prepare(sql)
    .all(...params)
    .map((row) => ({ ...row }) as T);
}

function one<T>(db: Db, sql: string, ...params: (string | number | null)[]): T | null {
  const row = db.prepare(sql).get(...params);
  return row ? ({ ...row } as T) : null;
}

function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// ---------- exercises ----------

/** Photo ids per exercise, oldest first. One query for any number of exercises. */
function photoIdsByExercise(db: Db, exerciseIds?: number[]): Map<number, number[]> {
  const rows = exerciseIds
    ? exerciseIds.length === 0
      ? []
      : all<{ exerciseId: number; id: number }>(
          db,
          `SELECT exercise_id AS exerciseId, id FROM exercise_photos
            WHERE exercise_id IN (${exerciseIds.map(() => '?').join(',')}) ORDER BY id`,
          ...exerciseIds,
        )
    : all<{ exerciseId: number; id: number }>(
        db,
        'SELECT exercise_id AS exerciseId, id FROM exercise_photos ORDER BY id',
      );
  const byExercise = new Map<number, number[]>();
  for (const row of rows) byExercise.set(row.exerciseId, [...(byExercise.get(row.exerciseId) ?? []), row.id]);
  return byExercise;
}

export function listExercises(db: Db): Exercise[] {
  const photos = photoIdsByExercise(db);
  return all<Omit<Exercise, 'photoIds'>>(
    db,
    'SELECT id, name, equipment, muscle_group AS muscleGroup FROM exercises ORDER BY muscle_group, name',
  ).map((e) => ({ ...e, photoIds: photos.get(e.id) ?? [] }));
}

export function getExercise(db: Db, exerciseId: number): Exercise | null {
  const row = one<Omit<Exercise, 'photoIds'>>(
    db,
    'SELECT id, name, equipment, muscle_group AS muscleGroup FROM exercises WHERE id = ?',
    exerciseId,
  );
  return row ? { ...row, photoIds: photoIdsByExercise(db, [exerciseId]).get(exerciseId) ?? [] } : null;
}

// ---------- exercise photos (stored in the database) ----------

/** Stores a photo for an exercise and returns its id. Validates the real content, size and count. */
export function addExercisePhoto(db: Db, exerciseId: number, data: Uint8Array, now: number): number {
  const mime = sniffImageMime(data);
  if (!mime) throw new Error('El archivo no es una imagen válida (JPG, PNG, GIF o WebP)');
  if (data.byteLength > MAX_PHOTO_BYTES) throw new Error('La foto pesa más de 5 MB');
  return tx(db, () => {
    if (!one(db, 'SELECT id FROM exercises WHERE id = ?', exerciseId)) throw new Error('Ejercicio no encontrado');
    const { n } = one<{ n: number }>(
      db,
      'SELECT COUNT(*) AS n FROM exercise_photos WHERE exercise_id = ?',
      exerciseId,
    )!;
    if (n >= MAX_PHOTOS_PER_EXERCISE) throw new Error(`Máximo ${MAX_PHOTOS_PER_EXERCISE} fotos por ejercicio`);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO exercise_photos (exercise_id, mime, data, created_at) VALUES (?, ?, ?, ?)')
      .run(exerciseId, mime, data, now);
    return Number(lastInsertRowid);
  });
}

export function getExercisePhoto(db: Db, photoId: number): { mime: string; data: Uint8Array } | null {
  const row = db.prepare('SELECT mime, data FROM exercise_photos WHERE id = ?').get(photoId);
  return row ? { mime: row.mime as string, data: row.data as Uint8Array } : null;
}

export function deleteExercisePhoto(db: Db, photoId: number): void {
  const { changes } = db.prepare('DELETE FROM exercise_photos WHERE id = ?').run(photoId);
  if (changes === 0) throw new Error('Foto no encontrada');
}

// ---------- routines ----------

function validateRoutine(name: string, items: RoutineItemInput[]): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('El nombre de la rutina es obligatorio');
  if (items.length === 0) throw new Error('Una rutina necesita al menos un ejercicio');
  for (const it of items) {
    const valid =
      isPosInt(it.exerciseId) &&
      isPosInt(it.targetSets) &&
      isPosInt(it.targetReps) &&
      Number.isInteger(it.restSeconds) &&
      it.restSeconds >= 0;
    if (!valid) throw new Error('Ejercicio de rutina no válido');
  }
  return trimmed;
}

function insertRoutineItems(db: Db, routineId: number | bigint, items: RoutineItemInput[]): void {
  const insert = db.prepare(
    `INSERT INTO routine_exercises
       (routine_id, exercise_id, position, target_sets, target_reps, rest_seconds, reps_label, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  items.forEach((it, position) =>
    insert.run(
      routineId,
      it.exerciseId,
      position,
      it.targetSets,
      it.targetReps,
      it.restSeconds,
      it.repsLabel?.trim() || null,
      it.note?.trim() || null,
    ),
  );
}

export function createRoutine(db: Db, name: string, items: RoutineItemInput[]): number {
  const trimmed = validateRoutine(name, items);
  return tx(db, () => {
    const { lastInsertRowid } = db.prepare('INSERT INTO routines (name) VALUES (?)').run(trimmed);
    insertRoutineItems(db, lastInsertRowid, items);
    return Number(lastInsertRowid);
  });
}

/**
 * Replaces a routine's name and exercises. The routine keeps its id, so its weekday assignments and
 * the history of workouts already done with it are untouched (history lives in `sets`, not here).
 */
export function updateRoutine(db: Db, routineId: number, name: string, items: RoutineItemInput[]): void {
  const trimmed = validateRoutine(name, items);
  tx(db, () => {
    const { changes } = db.prepare('UPDATE routines SET name = ? WHERE id = ?').run(trimmed, routineId);
    if (changes === 0) throw new Error('Rutina no encontrada');
    db.prepare('DELETE FROM routine_exercises WHERE routine_id = ?').run(routineId);
    insertRoutineItems(db, routineId, items);
  });
}

export function getRoutine(
  db: Db,
  routineId: number,
): { id: number; name: string; items: RoutineItem[] } | null {
  const row = one<{ id: number; name: string }>(db, 'SELECT id, name FROM routines WHERE id = ?', routineId);
  return row ? { ...row, items: getRoutineItems(db, routineId) } : null;
}

export function listRoutines(db: Db): { id: number; name: string; exerciseCount: number }[] {
  return all(
    db,
    `SELECT r.id, r.name, COUNT(re.id) AS exerciseCount
       FROM routines r LEFT JOIN routine_exercises re ON re.routine_id = r.id
      GROUP BY r.id ORDER BY r.name`,
  );
}

export function getRoutineItems(db: Db, routineId: number): RoutineItem[] {
  const items = all<Omit<RoutineItem, 'photoIds'>>(
    db,
    `SELECT re.exercise_id AS exerciseId, e.name, e.equipment,
            re.target_sets AS targetSets, re.target_reps AS targetReps,
            re.rest_seconds AS restSeconds, re.reps_label AS repsLabel, re.note
       FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
      WHERE re.routine_id = ? ORDER BY re.position`,
    routineId,
  );
  const photos = photoIdsByExercise(db, [...new Set(items.map((i) => i.exerciseId))]);
  return items.map((i) => ({ ...i, photoIds: photos.get(i.exerciseId) ?? [] }));
}

export function deleteRoutine(db: Db, routineId: number): void {
  db.prepare('DELETE FROM routines WHERE id = ?').run(routineId);
}

// ---------- weekly plan ----------

/** Index = weekday (0 = Sunday, as in Date#getDay), value = routine id or null. */
export function getWeekPlan(db: Db): (number | null)[] {
  const plan: (number | null)[] = Array(7).fill(null);
  for (const row of all<{ weekday: number; routineId: number | null }>(
    db,
    'SELECT weekday, routine_id AS routineId FROM week_plan',
  )) {
    plan[row.weekday] = row.routineId;
  }
  return plan;
}

export function setWeekPlan(db: Db, plan: (number | null)[]): void {
  if (plan.length !== 7) throw new Error('Un plan semanal tiene exactamente 7 días');
  tx(db, () => {
    const upsert = db.prepare(
      `INSERT INTO week_plan (weekday, routine_id) VALUES (?, ?)
       ON CONFLICT(weekday) DO UPDATE SET routine_id = excluded.routine_id`,
    );
    plan.forEach((routineId, weekday) => upsert.run(weekday, routineId));
  });
}

// ---------- workouts ----------

export function startWorkout(db: Db, routineId: number, now: number): number {
  if (!one(db, 'SELECT id FROM routines WHERE id = ?', routineId)) {
    throw new Error('Rutina no encontrada');
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO workouts (routine_id, started_at) VALUES (?, ?)')
    .run(routineId, now);
  return Number(lastInsertRowid);
}

export function finishWorkout(db: Db, workoutId: number, now: number): void {
  const { changes } = db
    .prepare('UPDATE workouts SET ended_at = ? WHERE id = ? AND ended_at IS NULL')
    .run(now, workoutId);
  if (changes === 0) throw new Error('Entrenamiento no encontrado o ya terminado');
}

export function getActiveWorkoutId(db: Db): number | null {
  const row = one<{ id: number }>(
    db,
    'SELECT id FROM workouts WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
  );
  return row ? row.id : null;
}

export function lastPerformance(
  db: Db,
  exerciseId: number,
  excludeWorkoutId: number,
): { reps: number; weightKg: number } | null {
  return one(
    db,
    `SELECT reps, weight_kg AS weightKg FROM sets
      WHERE exercise_id = ? AND workout_id <> ?
      ORDER BY completed_at DESC, id DESC LIMIT 1`,
    exerciseId,
    excludeWorkoutId,
  );
}

export function addSet(
  db: Db,
  input: { workoutId: number; exerciseId: number; reps: number; weightKg: number; now: number },
): SetRow {
  if (!isPosInt(input.reps)) throw new Error('Las repeticiones deben ser un entero positivo');
  if (!Number.isFinite(input.weightKg) || input.weightKg < 0) {
    throw new Error('El peso debe ser cero o más');
  }
  return tx(db, () => {
    const workout = one<{ endedAt: number | null }>(
      db,
      'SELECT ended_at AS endedAt FROM workouts WHERE id = ?',
      input.workoutId,
    );
    if (!workout) throw new Error('Entrenamiento no encontrado');
    if (workout.endedAt !== null) throw new Error('El entrenamiento ya terminó');
    const { n } = one<{ n: number }>(
      db,
      'SELECT COUNT(*) AS n FROM sets WHERE workout_id = ? AND exercise_id = ?',
      input.workoutId,
      input.exerciseId,
    )!;
    const setNumber = n + 1;
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO sets (workout_id, exercise_id, set_number, reps, weight_kg, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.workoutId, input.exerciseId, setNumber, input.reps, input.weightKg, input.now);
    return {
      id: Number(lastInsertRowid),
      exerciseId: input.exerciseId,
      setNumber,
      reps: input.reps,
      weightKg: input.weightKg,
      completedAt: input.now,
    };
  });
}

/** Keeps each exercise's sets numbered 1..n without gaps (after a set was removed). */
function renumberSets(db: Db, workoutId: number): void {
  db.prepare(
    `UPDATE sets SET set_number = (
       SELECT n FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY exercise_id ORDER BY set_number, id) AS n
           FROM sets WHERE workout_id = ?
       ) numbered WHERE numbered.id = sets.id
     ) WHERE workout_id = ?`,
  ).run(workoutId, workoutId);
}

/** Removes one set, from an open or a finished workout (used by "undo last set" and by history editing). */
export function deleteSet(db: Db, setId: number): void {
  tx(db, () => {
    const set = one<{ workoutId: number }>(db, 'SELECT workout_id AS workoutId FROM sets WHERE id = ?', setId);
    if (!set) throw new Error('Serie no encontrada');
    db.prepare('DELETE FROM sets WHERE id = ?').run(setId);
    renumberSets(db, set.workoutId);
  });
}

/** Deletes a workout and, with it, all of its sets. Routines and the exercise catalogue are untouched. */
export function deleteWorkout(db: Db, workoutId: number): void {
  const { changes } = db.prepare('DELETE FROM workouts WHERE id = ?').run(workoutId);
  if (changes === 0) throw new Error('Entrenamiento no encontrado');
}

export type SetEdit = { setId: number; reps: number; weightKg: number; remove?: boolean };

/**
 * Corrects a workout after the fact: new reps/weight for some sets, removal of others, and optionally
 * a new start time (the end time and every set's timestamp move by the same amount, so the duration
 * and the order are preserved). All or nothing.
 */
export function applyWorkoutEdit(
  db: Db,
  workoutId: number,
  edit: { startedAt?: number; sets: SetEdit[] },
): void {
  for (const s of edit.sets) {
    if (s.remove) continue;
    if (!isPosInt(s.reps)) throw new Error('Las repeticiones deben ser un entero positivo');
    if (!Number.isFinite(s.weightKg) || s.weightKg < 0) throw new Error('El peso debe ser cero o más');
  }
  if (edit.startedAt !== undefined && !Number.isFinite(edit.startedAt)) throw new Error('Fecha no válida');

  tx(db, () => {
    const workout = one<{ startedAt: number }>(
      db,
      'SELECT started_at AS startedAt FROM workouts WHERE id = ?',
      workoutId,
    );
    if (!workout) throw new Error('Entrenamiento no encontrado');

    const update = db.prepare('UPDATE sets SET reps = ?, weight_kg = ? WHERE id = ? AND workout_id = ?');
    const remove = db.prepare('DELETE FROM sets WHERE id = ? AND workout_id = ?');
    for (const s of edit.sets) {
      const { changes } = s.remove
        ? remove.run(s.setId, workoutId)
        : update.run(s.reps, s.weightKg, s.setId, workoutId);
      if (changes === 0) throw new Error('Serie no encontrada en este entrenamiento');
    }
    renumberSets(db, workoutId);

    if (edit.startedAt !== undefined && edit.startedAt !== workout.startedAt) {
      const delta = edit.startedAt - workout.startedAt;
      db.prepare(
        'UPDATE workouts SET started_at = ?, ended_at = CASE WHEN ended_at IS NULL THEN NULL ELSE ended_at + ? END WHERE id = ?',
      ).run(edit.startedAt, delta, workoutId);
      db.prepare('UPDATE sets SET completed_at = completed_at + ? WHERE workout_id = ?').run(delta, workoutId);
    }
  });
}

export function getSession(
  db: Db,
  workoutId: number,
): {
  workout: { id: number; routineId: number | null; routineName: string | null; startedAt: number; endedAt: number | null };
  items: SessionItem[];
} | null {
  const workout = one<{
    id: number;
    routineId: number | null;
    routineName: string | null;
    startedAt: number;
    endedAt: number | null;
  }>(
    db,
    `SELECT w.id, w.routine_id AS routineId, r.name AS routineName,
            w.started_at AS startedAt, w.ended_at AS endedAt
       FROM workouts w LEFT JOIN routines r ON r.id = w.routine_id WHERE w.id = ?`,
    workoutId,
  );
  if (!workout) return null;
  const routineItems = workout.routineId === null ? [] : getRoutineItems(db, workout.routineId);
  const items = routineItems.map((item) => ({
    ...item,
    sets: all<SessionItem['sets'][number]>(
      db,
      `SELECT id, reps, weight_kg AS weightKg, completed_at AS completedAt
         FROM sets WHERE workout_id = ? AND exercise_id = ? ORDER BY set_number`,
      workoutId,
      item.exerciseId,
    ),
    last: lastPerformance(db, item.exerciseId, workoutId),
  }));
  return { workout, items };
}

export function getWorkoutSummary(
  db: Db,
  workoutId: number,
): { exercises: { name: string; sets: { id: number; reps: number; weightKg: number }[] }[]; volumeKg: number } {
  const rows = all<{ id: number; name: string; reps: number; weightKg: number }>(
    db,
    `SELECT s.id, e.name, s.reps, s.weight_kg AS weightKg
       FROM sets s JOIN exercises e ON e.id = s.exercise_id
      WHERE s.workout_id = ? ORDER BY s.completed_at, s.id`,
    workoutId,
  );
  const byName = new Map<string, { name: string; sets: { id: number; reps: number; weightKg: number }[] }>();
  let volumeKg = 0;
  for (const row of rows) {
    if (!byName.has(row.name)) byName.set(row.name, { name: row.name, sets: [] });
    byName.get(row.name)!.sets.push({ id: row.id, reps: row.reps, weightKg: row.weightKg });
    volumeKg += row.reps * row.weightKg;
  }
  return { exercises: [...byName.values()], volumeKg };
}

export type WorkoutListItem = {
  id: number;
  startedAt: number;
  endedAt: number | null;
  routineName: string | null;
  setCount: number;
  repCount: number;
  volumeKg: number;
};

const WORKOUT_LIST_SELECT = `
  SELECT w.id, w.started_at AS startedAt, w.ended_at AS endedAt, r.name AS routineName,
         COUNT(s.id) AS setCount, COALESCE(SUM(s.reps), 0) AS repCount,
         COALESCE(SUM(s.reps * s.weight_kg), 0) AS volumeKg
    FROM workouts w
    LEFT JOIN routines r ON r.id = w.routine_id
    LEFT JOIN sets s ON s.workout_id = w.id`;

export function listRecentWorkouts(db: Db, limit: number): WorkoutListItem[] {
  return all(db, `${WORKOUT_LIST_SELECT} GROUP BY w.id ORDER BY w.started_at DESC LIMIT ?`, limit);
}

/** Workouts that started in [fromMs, toMs), oldest first. */
export function listWorkoutsBetween(db: Db, fromMs: number, toMs: number): WorkoutListItem[] {
  return all(
    db,
    `${WORKOUT_LIST_SELECT} WHERE w.started_at >= ? AND w.started_at < ?
      GROUP BY w.id ORDER BY w.started_at`,
    fromMs,
    toMs,
  );
}

export type SetHistoryRow = { workoutId: number; startedAt: number; reps: number; weightKg: number };

/** Every logged set of one exercise, oldest first. */
export function getExerciseSetHistory(db: Db, exerciseId: number): SetHistoryRow[] {
  return all(
    db,
    `SELECT s.workout_id AS workoutId, w.started_at AS startedAt, s.reps, s.weight_kg AS weightKg
       FROM sets s JOIN workouts w ON w.id = s.workout_id
      WHERE s.exercise_id = ? ORDER BY w.started_at, s.id`,
    exerciseId,
  );
}

/** Exercises that have at least one logged set, most trained first. */
export function listExercisesWithHistory(
  db: Db,
): { id: number; name: string; sessions: number }[] {
  return all(
    db,
    `SELECT e.id, e.name, COUNT(DISTINCT s.workout_id) AS sessions
       FROM exercises e JOIN sets s ON s.exercise_id = e.id
      GROUP BY e.id ORDER BY sessions DESC, e.name`,
  );
}

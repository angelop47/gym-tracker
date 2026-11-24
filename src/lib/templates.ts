import type { Db } from './db';
import { createRoutine, getWeekPlan, listExercises, listRoutines, setWeekPlan } from './repo';

export type PlanItem = {
  exercise: string;
  sets: number;
  /** Top of the rep range: used as the default value in the session screen. */
  reps: number;
  repsLabel: string;
  /** Upper bound of the rest range in the source plan. */
  restSeconds: number;
  note?: string;
};
export type PlanDay = { weekday: number; name: string; items: PlanItem[] };

const it = (
  exercise: string,
  sets: number,
  reps: number,
  repsLabel: string,
  restSeconds: number,
  note?: string,
): PlanItem => ({ exercise, sets, reps, repsLabel, restSeconds, note });

/** Weekday follows Date#getDay: 0 = Sunday. */
export const FIVE_DAY_PLAN: PlanDay[] = [
  {
    weekday: 1,
    name: 'Día 1 · Pecho + espalda (fuerza)',
    items: [
      it('Press de banca con mancuernas', 4, 8, '6–8', 180),
      it('Dominadas agarre ancho', 4, 8, '5–8', 180, 'kg extra: 0 si es tu peso'),
      it('Press inclinado con mancuernas', 3, 10, '8–10', 120, 'banco a 30°'),
      it('Remo a una mano con mancuerna', 3, 10, '8–10', 90, 'por brazo, apoyado en banco'),
      it('Elevaciones laterales', 3, 15, '12–15', 60),
    ],
  },
  {
    weekday: 2,
    name: 'Día 2 · Pierna completa + core',
    items: [
      it('Sentadilla goblet', 4, 12, '10–12', 180, 'pausa de 1 s abajo'),
      it('Sentadilla búlgara', 3, 10, '8–10', 90, 'por pierna'),
      it('Peso muerto rumano con mancuernas', 3, 12, '10–12', 90),
      it('Hip thrust con mancuerna', 3, 12, '10–12', 90, 'espalda alta en el banco'),
      it('Gemelos a una pierna', 3, 15, '12–15', 60),
      it('Elevaciones de rodillas colgado', 3, 15, '10–15', 60),
    ],
  },
  {
    weekday: 4,
    name: 'Día 3 · Empuje (prioridad pecho)',
    items: [
      it('Press inclinado con mancuernas', 4, 12, '8–12', 180, 'banco a 30–45°'),
      it('Press plano agarre neutro con mancuernas', 3, 12, '10–12', 120, 'palmas enfrentadas, banco plano'),
      it('Aperturas en banco inclinado', 3, 15, '12–15', 90),
      it('Press militar con mancuernas', 3, 10, '8–10', 90, 'sentado, banco a 90°'),
      it('Extensión de tríceps sobre la cabeza', 3, 12, '10–12', 60),
      it('Flexiones con pies en el banco', 2, 10, 'al fallo', 60, 'pies en el banco'),
    ],
  },
  {
    weekday: 5,
    name: 'Día 4 · Tirón (prioridad espalda)',
    items: [
      it('Dominadas agarre neutro', 4, 8, 'máx', 180),
      it('Remo pecho apoyado en banco inclinado', 4, 12, '10–12', 90),
      it('Pullover con mancuerna', 3, 12, '12', 90, 'banco plano'),
      it('Pájaros (deltoides posterior)', 3, 15, '15', 60),
      it('Curl martillo', 3, 10, '10', 60),
    ],
  },
  {
    weekday: 6,
    name: 'Día 5 · Pecho + espalda (volumen) + brazos',
    items: [
      it('Press de banca con mancuernas', 3, 12, '10–12', 120, 'bajada de 3 s'),
      it('Dominadas supinas', 3, 8, 'máx', 120, 'palmas hacia ti'),
      it('Aperturas con mancuernas', 3, 15, '12–15', 90, 'banco plano'),
      it('Remo a una mano con mancuerna', 3, 12, '12', 90, 'por brazo, apoyado en banco'),
      it('Curl en banco inclinado', 3, 12, '10–12', 60, 'superserie con el siguiente'),
      it('Extensión de tríceps tumbado', 3, 12, '10–12', 60, 'superserie con el anterior'),
    ],
  },
];

/**
 * Creates the plan's routines and puts them on their weekdays. Idempotent by routine name:
 * a routine that already exists is kept as it is, and only its weekday is (re)assigned.
 * Other weekdays keep whatever they had.
 */
export function installPlan(db: Db, plan: PlanDay[]): { created: string[]; kept: string[] } {
  const exerciseIds = new Map(listExercises(db).map((e) => [e.name, e.id]));
  // Validate everything first so a typo cannot leave half a plan behind.
  for (const day of plan) {
    for (const item of day.items) {
      if (!exerciseIds.has(item.exercise)) throw new Error(`Unknown exercise: ${item.exercise}`);
    }
  }

  const routineIds = new Map(listRoutines(db).map((r) => [r.name, r.id]));
  const created: string[] = [];
  const kept: string[] = [];
  for (const day of plan) {
    if (routineIds.has(day.name)) {
      kept.push(day.name);
      continue;
    }
    const id = createRoutine(
      db,
      day.name,
      day.items.map((item) => ({
        exerciseId: exerciseIds.get(item.exercise)!,
        targetSets: item.sets,
        targetReps: item.reps,
        restSeconds: item.restSeconds,
        repsLabel: item.repsLabel,
        note: item.note,
      })),
    );
    routineIds.set(day.name, id);
    created.push(day.name);
  }

  const week = getWeekPlan(db);
  for (const day of plan) week[day.weekday] = routineIds.get(day.name)!;
  setWeekPlan(db, week);
  return { created, kept };
}

/** English names the plan had before it was translated: [old, new]. */
const LEGACY_ROUTINE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['Day 1 · Chest + back (strength)', 'Día 1 · Pecho + espalda (fuerza)'],
  ['Day 2 · Full legs + core', 'Día 2 · Pierna completa + core'],
  ['Day 3 · Push (chest priority)', 'Día 3 · Empuje (prioridad pecho)'],
  ['Day 4 · Pull (back priority)', 'Día 4 · Tirón (prioridad espalda)'],
  ['Day 5 · Chest + back (volume) + arms', 'Día 5 · Pecho + espalda (volumen) + brazos'],
];

/** English notes and rep labels the plan had before it was translated: [old, new]. */
const LEGACY_PLAN_TEXT: ReadonlyArray<readonly [string, string]> = [
  ['extra kg: 0 if bodyweight', 'kg extra: 0 si es tu peso'],
  ['bench at 30°', 'banco a 30°'],
  ['per arm, bench-supported', 'por brazo, apoyado en banco'],
  ['1 s pause at the bottom', 'pausa de 1 s abajo'],
  ['per leg', 'por pierna'],
  ['upper back on the bench', 'espalda alta en el banco'],
  ['bench at 30–45°', 'banco a 30–45°'],
  ['palms facing, flat bench', 'palmas enfrentadas, banco plano'],
  ['seated, bench at 90°', 'sentado, banco a 90°'],
  ['feet on the bench', 'pies en el banco'],
  ['flat bench', 'banco plano'],
  ['3 s lowering', 'bajada de 3 s'],
  ['palms toward you', 'palmas hacia ti'],
  ['superset with the next one', 'superserie con el siguiente'],
  ['superset with the previous one', 'superserie con el anterior'],
  ['max', 'máx'],
  ['to failure', 'al fallo'],
];

/**
 * Databases that loaded the plan while it was in English are translated in place, so the routines
 * keep their ids and history, and the "Load 5-day plan" button does not offer a second copy.
 */
export function translateLegacyPlan(db: Db): void {
  const renameRoutine = db.prepare('UPDATE routines SET name = ? WHERE name = ?');
  for (const [from, to] of LEGACY_ROUTINE_NAMES) renameRoutine.run(to, from);
  const renameNote = db.prepare('UPDATE routine_exercises SET note = ? WHERE note = ?');
  const renameLabel = db.prepare('UPDATE routine_exercises SET reps_label = ? WHERE reps_label = ?');
  for (const [from, to] of LEGACY_PLAN_TEXT) {
    renameNote.run(to, from);
    renameLabel.run(to, from);
  }
}

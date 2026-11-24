import type { Db } from './db';

type SeedExercise = {
  /** English name used before the catalogue was translated: lets older databases be renamed in place. */
  legacy: string;
  name: string;
  equipment: string;
  group: string;
};

const MB = 'mancuernas + banco';
const M = 'mancuernas';
const BARRA = 'barra de dominadas';
const ANILLAS = 'anillas';

const ex = (
  legacy: string,
  name: string,
  equipment: string,
  group: string,
): SeedExercise => ({ legacy, name, equipment, group });

export const EXERCISES: readonly SeedExercise[] = [
  ex('Dumbbell bench press', 'Press de banca con mancuernas', MB, 'pecho'),
  ex('Incline dumbbell press', 'Press inclinado con mancuernas', MB, 'pecho'),
  ex('Dumbbell fly', 'Aperturas con mancuernas', MB, 'pecho'),
  ex('Ring push-up', 'Flexiones en anillas', ANILLAS, 'pecho'),
  ex('Ring dip', 'Fondos en anillas', ANILLAS, 'pecho'),
  ex('Pull-up', 'Dominadas', BARRA, 'espalda'),
  ex('Chin-up', 'Dominadas supinas', BARRA, 'espalda'),
  ex('Ring row', 'Remo en anillas', ANILLAS, 'espalda'),
  ex('One-arm dumbbell row', 'Remo a una mano con mancuerna', MB, 'espalda'),
  ex('Dumbbell shoulder press', 'Press militar con mancuernas', M, 'hombros'),
  ex('Lateral raise', 'Elevaciones laterales', M, 'hombros'),
  ex('Rear delt fly', 'Pájaros (deltoides posterior)', M, 'hombros'),
  ex('Dumbbell curl', 'Curl de bíceps con mancuernas', M, 'bíceps'),
  ex('Hammer curl', 'Curl martillo', M, 'bíceps'),
  ex('Overhead triceps extension', 'Extensión de tríceps sobre la cabeza', M, 'tríceps'),
  ex('Bench dip', 'Fondos en banco', 'banco', 'tríceps'),
  ex('Goblet squat', 'Sentadilla goblet', M, 'piernas'),
  ex('Bulgarian split squat', 'Sentadilla búlgara', MB, 'piernas'),
  ex('Romanian deadlift', 'Peso muerto rumano con mancuernas', M, 'piernas'),
  ex('Walking lunge', 'Zancadas con mancuernas', M, 'piernas'),
  ex('Dumbbell hip thrust', 'Hip thrust con mancuerna', MB, 'piernas'),
  ex('Hanging knee raise', 'Elevaciones de rodillas colgado', BARRA, 'core'),
  ex('Ring body saw', 'Sierra en anillas', ANILLAS, 'core'),
  ex('Wide-grip pull-up', 'Dominadas agarre ancho', BARRA, 'espalda'),
  ex('Neutral-grip pull-up', 'Dominadas agarre neutro', BARRA, 'espalda'),
  ex('Chest-supported incline row', 'Remo pecho apoyado en banco inclinado', MB, 'espalda'),
  ex('Dumbbell pullover', 'Pullover con mancuerna', MB, 'espalda'),
  ex('Neutral-grip dumbbell press', 'Press plano agarre neutro con mancuernas', MB, 'pecho'),
  ex('Incline dumbbell fly', 'Aperturas en banco inclinado', MB, 'pecho'),
  ex('Feet-elevated push-up', 'Flexiones con pies en el banco', 'banco', 'pecho'),
  ex('Incline dumbbell curl', 'Curl en banco inclinado', MB, 'bíceps'),
  ex('Lying triceps extension', 'Extensión de tríceps tumbado', MB, 'tríceps'),
  ex('Single-leg calf raise', 'Gemelos a una pierna', 'peso corporal', 'piernas'),
];

export function seedExercises(db: Db): void {
  const rename = db.prepare(
    'UPDATE exercises SET name = ?, equipment = ?, muscle_group = ? WHERE name = ?',
  );
  const insert = db.prepare(
    'INSERT OR IGNORE INTO exercises (name, equipment, muscle_group) VALUES (?, ?, ?)',
  );
  for (const e of EXERCISES) {
    // Databases created with the English catalogue keep their ids, so routines and history survive.
    rename.run(e.name, e.equipment, e.group, e.legacy);
    insert.run(e.name, e.equipment, e.group);
  }
}

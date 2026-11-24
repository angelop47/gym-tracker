export const SCHEMA = `
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  equipment TEXT NOT NULL,
  muscle_group TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_exercises (
  id INTEGER PRIMARY KEY,
  routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL,
  target_sets INTEGER NOT NULL,
  target_reps INTEGER NOT NULL,
  rest_seconds INTEGER NOT NULL,
  reps_label TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS week_plan (
  weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  routine_id INTEGER REFERENCES routines(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY,
  routine_id INTEGER REFERENCES routines(id) ON DELETE SET NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS sets (
  id INTEGER PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  set_number INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  weight_kg REAL NOT NULL,
  completed_at INTEGER NOT NULL
);

-- The user's own exercise photos. AUTOINCREMENT: ids are never reused, because /photos/<id> is cached forever.
CREATE TABLE IF NOT EXISTS exercise_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_photos_exercise ON exercise_photos(exercise_id);
CREATE INDEX IF NOT EXISTS idx_sets_workout ON sets(workout_id);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON sets(exercise_id, completed_at);
`;

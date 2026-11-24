import { dayKey } from './calendar';
import type { SetHistoryRow, WorkoutListItem } from './repo';

// ---------- totals per period ----------

export type Granularity = 'dia' | 'semana' | 'mes';
export const GRANULARITIES: readonly Granularity[] = ['dia', 'semana', 'mes'];
export const PERIOD_COUNT: Record<Granularity, number> = { dia: 14, semana: 12, mes: 12 };

export type Period = { key: string; label: string; fromMs: number; toMs: number; current: boolean };

/** The last `count` periods, oldest first. Weeks start on Monday; the last period is the one that contains `now`. */
export function buildPeriods(
  granularity: Granularity,
  now: Date = new Date(),
  count: number = PERIOD_COUNT[granularity],
): Period[] {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const weekOffset = (now.getDay() + 6) % 7;
  const periods: Period[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let from: Date;
    let to: Date;
    let label: string;
    if (granularity === 'dia') {
      from = new Date(y, m, d - i);
      to = new Date(y, m, d - i + 1);
      label = from.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
    } else if (granularity === 'semana') {
      from = new Date(y, m, d - weekOffset - 7 * i);
      to = new Date(y, m, d - weekOffset - 7 * i + 7);
      label = from.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    } else {
      from = new Date(y, m - i, 1);
      to = new Date(y, m - i + 1, 1);
      label = from.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
    }
    periods.push({
      key: dayKey(from),
      label,
      fromMs: from.getTime(),
      toMs: to.getTime(),
      current: now.getTime() >= from.getTime() && now.getTime() < to.getTime(),
    });
  }
  return periods;
}

export type Totals = { workouts: number; sets: number; reps: number; volumeKg: number; minutes: number };

const emptyTotals = (): Totals => ({ workouts: 0, sets: 0, reps: 0, volumeKg: 0, minutes: 0 });

/**
 * Sums workouts into the period their start falls in ([from, to)). Workouts without any set are ignored,
 * so an accidental "start" does not count as training; minutes only count for finished workouts.
 */
export function aggregate(periods: Period[], workouts: WorkoutListItem[]): Totals[] {
  const totals = periods.map(() => emptyTotals());
  for (const w of workouts) {
    if (w.setCount === 0) continue;
    const index = periods.findIndex((p) => w.startedAt >= p.fromMs && w.startedAt < p.toMs);
    if (index === -1) continue;
    const t = totals[index];
    t.workouts += 1;
    t.sets += w.setCount;
    t.reps += w.repCount;
    t.volumeKg += w.volumeKg;
    if (w.endedAt !== null) t.minutes += (w.endedAt - w.startedAt) / 60000;
  }
  return totals;
}

export type MetricKey = 'volumen' | 'series' | 'reps' | 'entrenamientos' | 'minutos';

export const METRICS: Record<
  MetricKey,
  { label: string; unit: string; pick: (t: Totals) => number; higherIsBetter: boolean }
> = {
  volumen: { label: 'Volumen', unit: 'kg', pick: (t) => t.volumeKg, higherIsBetter: true },
  series: { label: 'Series', unit: '', pick: (t) => t.sets, higherIsBetter: true },
  reps: { label: 'Repeticiones', unit: '', pick: (t) => t.reps, higherIsBetter: true },
  entrenamientos: { label: 'Entrenamientos', unit: '', pick: (t) => t.workouts, higherIsBetter: true },
  // Longer is not automatically better, so it is shown without good/bad colouring.
  minutos: { label: 'Duración', unit: 'min', pick: (t) => t.minutes, higherIsBetter: false },
};

/** Percentage change from `previous` to `current`, or null when there is no baseline to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ---------- progress of one exercise ----------

export const estimateOneRepMax = (weightKg: number, reps: number): number => weightKg * (1 + reps / 30);

export type ExerciseSession = {
  workoutId: number;
  startedAt: number;
  sets: number;
  volumeKg: number;
  /** Best set of the session by `score`. */
  top: { reps: number; weightKg: number };
  score: number;
};

export type ExerciseProgress = {
  /** e1rm: estimated one-rep max (Epley) for exercises done with weight; reps: best reps in a set for bodyweight ones. */
  mode: 'e1rm' | 'reps';
  sessions: ExerciseSession[];
};

export type ExerciseMode = ExerciseProgress['mode'];

export const exerciseMode = (rows: SetHistoryRow[]): ExerciseMode =>
  rows.some((r) => r.weightKg > 0) ? 'e1rm' : 'reps';

const scoreFor = (mode: ExerciseMode, r: SetHistoryRow): number =>
  mode === 'e1rm' ? estimateOneRepMax(r.weightKg, r.reps) : r.reps;

export function exerciseProgress(rows: SetHistoryRow[]): ExerciseProgress {
  const mode = exerciseMode(rows);

  const byWorkout = new Map<number, ExerciseSession>();
  for (const row of rows) {
    const score = scoreFor(mode, row);
    const session = byWorkout.get(row.workoutId);
    if (!session) {
      byWorkout.set(row.workoutId, {
        workoutId: row.workoutId,
        startedAt: row.startedAt,
        sets: 1,
        volumeKg: row.reps * row.weightKg,
        top: { reps: row.reps, weightKg: row.weightKg },
        score,
      });
      continue;
    }
    session.sets += 1;
    session.volumeKg += row.reps * row.weightKg;
    if (score > session.score) {
      session.score = score;
      session.top = { reps: row.reps, weightKg: row.weightKg };
    }
  }
  return { mode, sessions: [...byWorkout.values()].sort((a, b) => a.startedAt - b.startedAt) };
}

export type ExercisePeriodStats = {
  sessions: number;
  sets: number;
  volumeKg: number;
  /** Best set of the period by the exercise's score (see ExerciseProgress.mode), or null if it was not trained. */
  best: { reps: number; weightKg: number; score: number } | null;
};

/**
 * One exercise, summed per period (a set belongs to the period its workout started in). The score
 * mode is decided over the whole history, so every period is measured with the same yardstick.
 */
export function exercisePeriodStats(rows: SetHistoryRow[], periods: Period[]): ExercisePeriodStats[] {
  const mode = exerciseMode(rows);
  const stats: ExercisePeriodStats[] = periods.map(() => ({ sessions: 0, sets: 0, volumeKg: 0, best: null }));
  const workouts = periods.map(() => new Set<number>());
  for (const row of rows) {
    const index = periods.findIndex((p) => row.startedAt >= p.fromMs && row.startedAt < p.toMs);
    if (index === -1) continue;
    const stat = stats[index];
    stat.sets += 1;
    stat.volumeKg += row.reps * row.weightKg;
    workouts[index].add(row.workoutId);
    const score = scoreFor(mode, row);
    if (!stat.best || score > stat.best.score) {
      stat.best = { reps: row.reps, weightKg: row.weightKg, score };
    }
  }
  stats.forEach((stat, i) => (stat.sessions = workouts[i].size));
  return stats;
}

/** First vs latest session and the best one, in `score` units. Null when there is nothing logged. */
export function scoreSummary(
  sessions: ExerciseSession[],
): { first: number; last: number; best: number; changePct: number | null } | null {
  if (sessions.length === 0) return null;
  const first = sessions[0].score;
  const last = sessions[sessions.length - 1].score;
  return {
    first,
    last,
    best: Math.max(...sessions.map((s) => s.score)),
    changePct: sessions.length > 1 ? percentChange(last, first) : null,
  };
}

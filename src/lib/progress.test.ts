import { describe, expect, it } from 'vitest';
import {
  aggregate,
  buildPeriods,
  estimateOneRepMax,
  exercisePeriodStats,
  exerciseProgress,
  percentChange,
  scoreSummary,
} from './progress';
import type { SetHistoryRow, WorkoutListItem } from './repo';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('buildPeriods', () => {
  it('builds 12 contiguous weeks starting on Monday, the last one being the current week', () => {
    const periods = buildPeriods('semana', new Date(2026, 10, 25, 15)); // Wednesday
    expect(periods).toHaveLength(12);
    expect(periods.at(-1)).toMatchObject({ key: '2026-11-23', current: true });
    expect(periods.at(-2)!.key).toBe('2026-11-16');
    expect(periods.filter((p) => p.current)).toHaveLength(1);
    periods.slice(1).forEach((p, i) => expect(p.fromMs).toBe(periods[i].toMs));
  });

  it('treats Sunday as the last day of the week, not the first of the next', () => {
    const periods = buildPeriods('semana', new Date(2026, 10, 29, 10)); // Sunday
    expect(periods.at(-1)!.key).toBe('2026-11-23');
  });

  it('builds 14 days ending today', () => {
    const periods = buildPeriods('dia', new Date(2026, 10, 25, 15));
    expect(periods).toHaveLength(14);
    expect(periods[0].key).toBe('2026-11-12');
    expect(periods.at(-1)).toMatchObject({ key: '2026-11-25', current: true });
  });

  it('builds months across a year boundary', () => {
    const periods = buildPeriods('mes', new Date(2027, 0, 15), 3);
    expect(periods.map((p) => p.key)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
    expect(periods.map((p) => p.current)).toEqual([false, false, true]);
  });
});

describe('aggregate', () => {
  const periods = buildPeriods('semana', new Date(2026, 10, 25, 15), 2); // weeks of 16 and 23 Nov
  const workout = (startedAt: number, over: Partial<WorkoutListItem> = {}): WorkoutListItem => ({
    id: 1,
    startedAt,
    endedAt: startedAt + 3_600_000,
    routineName: 'R',
    setCount: 4,
    repCount: 40,
    volumeKg: 800,
    ...over,
  });

  it('sums sets, reps, volume and minutes into the period of the workout start', () => {
    const totals = aggregate(periods, [workout(at(2026, 11, 17)), workout(at(2026, 11, 24)), workout(at(2026, 11, 25))]);
    expect(totals[0]).toEqual({ workouts: 1, sets: 4, reps: 40, volumeKg: 800, minutes: 60 });
    expect(totals[1]).toEqual({ workouts: 2, sets: 8, reps: 80, volumeKg: 1600, minutes: 120 });
  });

  it('uses [from, to) bounds: Monday 00:00 belongs to the new week, Sunday 23:59 to the old one', () => {
    const totals = aggregate(periods, [
      workout(new Date(2026, 10, 23, 0, 0).getTime()),
      workout(new Date(2026, 10, 22, 23, 59).getTime()),
    ]);
    expect([totals[0].workouts, totals[1].workouts]).toEqual([1, 1]);
  });

  it('ignores workouts without sets and workouts outside the periods', () => {
    const totals = aggregate(periods, [
      workout(at(2026, 11, 24), { setCount: 0, repCount: 0, volumeKg: 0 }),
      workout(at(2026, 10, 1)),
    ]);
    expect(totals.every((t) => t.workouts === 0)).toBe(true);
  });

  it('does not count minutes for a workout that is still in progress', () => {
    const [, current] = aggregate(periods, [workout(at(2026, 11, 24), { endedAt: null })]);
    expect(current).toMatchObject({ workouts: 1, minutes: 0 });
  });
});

describe('percentChange', () => {
  it('computes the relative change and refuses to divide by zero', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(0, 100)).toBe(-100);
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});

describe('exerciseProgress', () => {
  const row = (workoutId: number, startedAt: number, reps: number, weightKg: number): SetHistoryRow => ({
    workoutId,
    startedAt,
    reps,
    weightKg,
  });

  it('scores weighted exercises by estimated 1RM and keeps the best set of each session', () => {
    const { mode, sessions } = exerciseProgress([
      row(1, 1000, 8, 80), // 101.3
      row(1, 1000, 1, 100), // 103.3 -> top set
      row(2, 2000, 5, 90), // 105
    ]);
    expect(mode).toBe('e1rm');
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ sets: 2, top: { reps: 1, weightKg: 100 }, volumeKg: 8 * 80 + 100 });
    expect(sessions[0].score).toBeCloseTo(estimateOneRepMax(100, 1));
    expect(sessions[1].top).toEqual({ reps: 5, weightKg: 90 });
  });

  it('scores bodyweight exercises by the reps of the best set', () => {
    const { mode, sessions } = exerciseProgress([row(1, 1000, 6, 0), row(1, 1000, 8, 0), row(2, 2000, 9, 0)]);
    expect(mode).toBe('reps');
    expect(sessions.map((s) => s.score)).toEqual([8, 9]);
    expect(sessions.map((s) => s.volumeKg)).toEqual([0, 0]);
  });

  it('orders sessions by date even if rows arrive unsorted, and handles no data', () => {
    const { sessions } = exerciseProgress([row(2, 2000, 5, 50), row(1, 1000, 5, 40)]);
    expect(sessions.map((s) => s.workoutId)).toEqual([1, 2]);
    expect(exerciseProgress([]).sessions).toEqual([]);
  });
});

describe('scoreSummary', () => {
  const session = (score: number, startedAt: number) => ({
    workoutId: startedAt,
    startedAt,
    sets: 1,
    volumeKg: 0,
    top: { reps: 1, weightKg: 0 },
    score,
  });

  it('compares the first and the latest session and reports the best one', () => {
    expect(scoreSummary([session(100, 1), session(130, 2), session(120, 3)])).toEqual({
      first: 100,
      last: 120,
      best: 130,
      changePct: 20,
    });
  });

  it('has no change with a single session, and no summary without sessions', () => {
    expect(scoreSummary([session(100, 1)])).toMatchObject({ changePct: null, best: 100 });
    expect(scoreSummary([])).toBeNull();
  });
});

describe('exercisePeriodStats', () => {
  const row = (workoutId: number, startedAt: number, reps: number, weightKg: number): SetHistoryRow => ({
    workoutId,
    startedAt,
    reps,
    weightKg,
  });
  // Weeks of 9, 16 and 23 Nov 2026 (Mondays).
  const weeks = buildPeriods('semana', new Date(2026, 10, 25, 15), 3);

  it('summarises each period with its best set, sessions, sets and volume', () => {
    const stats = exercisePeriodStats(
      [
        row(1, at(2026, 11, 10), 8, 20), // week of 9 Nov: 1RM 25.3
        row(1, at(2026, 11, 10), 8, 22), // 27.9 -> best of that week
        row(2, at(2026, 11, 24), 8, 24), // week of 23 Nov: 30.4
        row(3, at(2026, 11, 26), 6, 26), // 31.2 -> best, second session
      ],
      weeks,
    );
    expect(stats[0]).toMatchObject({ sessions: 1, sets: 2, volumeKg: 8 * 20 + 8 * 22, best: { reps: 8, weightKg: 22 } });
    expect(stats[1]).toEqual({ sessions: 0, sets: 0, volumeKg: 0, best: null }); // week of 16 Nov: not trained
    expect(stats[2]).toMatchObject({ sessions: 2, sets: 2, best: { reps: 6, weightKg: 26 } });
    expect(stats[2].best!.score).toBeCloseTo(estimateOneRepMax(26, 6));
  });

  it('ignores sets outside the periods and scores bodyweight exercises by reps', () => {
    const stats = exercisePeriodStats([row(1, at(2026, 8, 1), 20, 0), row(2, at(2026, 11, 24), 7, 0), row(2, at(2026, 11, 24), 9, 0)], weeks);
    expect(stats[0].best).toBeNull();
    expect(stats[2].best).toEqual({ reps: 9, weightKg: 0, score: 9 });
    expect(stats[2].sets).toBe(2);
  });

  it('uses one scoring mode for the whole history, so weeks stay comparable', () => {
    // A bodyweight week (0 kg) next to a weighted one: both are scored as 1RM, so the 0 kg week scores 0.
    const stats = exercisePeriodStats([row(1, at(2026, 11, 10), 10, 0), row(2, at(2026, 11, 24), 5, 40)], weeks);
    expect(stats[0].best!.score).toBe(0);
    expect(stats[2].best!.score).toBeGreaterThan(0);
  });
});

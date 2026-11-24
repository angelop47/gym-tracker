import { describe, expect, it } from 'vitest';
import {
  dayKey,
  gridRange,
  monthGrid,
  monthParam,
  parseDatetimeLocal,
  parseMonth,
  shiftMonth,
  toDatetimeLocal,
} from './calendar';

describe('monthGrid', () => {
  it('starts on Monday and pads with the neighbouring months (November 2026 starts on a Sunday)', () => {
    const weeks = monthGrid({ year: 2026, month: 10 });
    expect(weeks).toHaveLength(6); // 6 leading days + 30 days = 36 cells
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // Sunday 1 Nov is the last cell of the first row, preceded by six October days.
    expect(weeks[0].map((c) => c.key)).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
    expect(weeks[0].filter((c) => c.inMonth)).toHaveLength(1);
    expect(weeks[5].map((c) => c.key).at(-1)).toBe('2026-12-06');
  });

  it('uses exactly four rows when the month fits (February 2027 starts on a Monday)', () => {
    const weeks = monthGrid({ year: 2027, month: 1 });
    expect(weeks).toHaveLength(4);
    expect(weeks.flat().every((c) => c.inMonth)).toBe(true);
  });

  it('uses six rows when needed (March 2025: 31 days starting on a Saturday)', () => {
    expect(monthGrid({ year: 2025, month: 2 })).toHaveLength(6);
  });

  it('uses five rows for a typical month (August 2025 starts on a Friday)', () => {
    expect(monthGrid({ year: 2025, month: 7 })).toHaveLength(5);
  });

  it('covers every day of the month exactly once', () => {
    const inMonth = monthGrid({ year: 2024, month: 1 }).flat().filter((c) => c.inMonth);
    expect(inMonth.map((c) => c.day)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
  });
});

describe('gridRange', () => {
  it('spans from the first cell to the end of the last one', () => {
    const { fromMs, toMs } = gridRange(monthGrid({ year: 2026, month: 10 }));
    expect(dayKey(new Date(fromMs))).toBe('2026-10-26');
    expect(dayKey(new Date(toMs))).toBe('2026-12-07'); // exclusive end: the day after 6 Dec
  });
});

describe('month parameters', () => {
  const now = new Date(2026, 10, 23);

  it('parses YYYY-MM and round-trips it', () => {
    expect(parseMonth('2026-03', now)).toEqual({ year: 2026, month: 2 });
    expect(monthParam({ year: 2026, month: 2 })).toBe('2026-03');
  });

  it('falls back to the current month on invalid input', () => {
    const current = { year: 2026, month: 10 };
    for (const bad of [null, undefined, '', 'abc', '2026-13', '2026-00', '1999-05', '2026-1', '2026-11-01']) {
      expect(parseMonth(bad, now)).toEqual(current);
    }
  });

  it('shifts across year boundaries', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('datetime-local values', () => {
  it('round-trips through the local-time string', () => {
    const ms = new Date(2026, 10, 23, 8, 5).getTime();
    expect(toDatetimeLocal(ms)).toBe('2026-11-23T08:05');
    expect(parseDatetimeLocal('2026-11-23T08:05')).toBe(ms);
  });

  it('rejects malformed or impossible values', () => {
    for (const bad of ['', 'hola', '2026-11-23', '2026-11-23 08:05', '2026-02-30T10:00', '2026-13-01T10:00', '2026-11-23T25:00', '2026-11-23T10:60']) {
      expect(parseDatetimeLocal(bad)).toBeNull();
    }
  });
});

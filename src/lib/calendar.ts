export type MonthRef = { year: number; month: number }; // month: 0-11
export type Cell = { key: string; day: number; inMonth: boolean };

const pad = (n: number) => String(n).padStart(2, '0');

/** Local-time day key, e.g. "2026-11-23". Local on purpose: a workout belongs to the day the user lived it. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthParam({ year, month }: MonthRef): string {
  return `${year}-${pad(month + 1)}`;
}

/** Reads "YYYY-MM"; anything invalid falls back to the month of `now`. */
export function parseMonth(value: string | null | undefined, now: Date): MonthRef {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (year >= 2000 && year <= 2100 && month >= 0 && month <= 11) return { year, month };
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Whole weeks (Monday first) that cover the month, including the neighbouring days that fill them. */
export function monthGrid({ year, month }: MonthRef): Cell[][] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekCount = Math.ceil((offset + daysInMonth) / 7);
  const weeks: Cell[][] = [];
  for (let w = 0; w < weekCount; w++) {
    weeks.push(
      Array.from({ length: 7 }, (_, d) => {
        const date = new Date(year, month, 1 - offset + w * 7 + d);
        return { key: dayKey(date), day: date.getDate(), inMonth: date.getMonth() === month };
      }),
    );
  }
  return weeks;
}

/** Start of the first grid day and start of the day after the last one, as epoch ms. */
export function gridRange(weeks: Cell[][]): { fromMs: number; toMs: number } {
  const first = weeks[0][0].key.split('-').map(Number);
  const last = weeks[weeks.length - 1][6].key.split('-').map(Number);
  return {
    fromMs: new Date(first[0], first[1] - 1, first[2]).getTime(),
    toMs: new Date(last[0], last[1] - 1, last[2] + 1).getTime(),
  };
}

/** Epoch ms -> the "YYYY-MM-DDTHH:mm" local string that <input type="datetime-local"> expects. */
export function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Reads a datetime-local value as local time. Returns null for anything malformed or impossible (e.g. 30 Feb). */
export function parseDatetimeLocal(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  const same =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute;
  return same ? date.getTime() : null;
}

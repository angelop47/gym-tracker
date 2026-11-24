/**
 * Rest is derived from timestamps instead of a counter, so it stays correct
 * when the browser throttles timers or the page is reloaded mid-rest.
 */
export function restRemainingMs(
  lastSetAt: number | null,
  restSeconds: number,
  now: number,
): number {
  if (lastSetAt === null) return 0;
  return Math.max(0, lastSetAt + restSeconds * 1000 - now);
}

/** m:ss, rounding up so "0:00" only shows when the rest is really over. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(startedAt: number, endedAt: number): string {
  const minutes = Math.round((endedAt - startedAt) / 60000);
  return `${minutes} min`;
}

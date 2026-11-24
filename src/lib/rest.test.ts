import { describe, expect, it } from 'vitest';
import { formatClock, restRemainingMs } from './rest';

describe('restRemainingMs', () => {
  it('is zero when no set has been done yet', () => {
    expect(restRemainingMs(null, 90, 1_000_000)).toBe(0);
  });

  it('counts down from the last set completion time', () => {
    expect(restRemainingMs(1_000_000, 90, 1_030_000)).toBe(60_000);
  });

  it('never goes negative once the rest is over', () => {
    expect(restRemainingMs(1_000_000, 90, 1_200_000)).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats minutes and padded seconds', () => {
    expect(formatClock(65_000)).toBe('1:05');
  });

  it('rounds partial seconds up so 0:00 means really over', () => {
    expect(formatClock(100)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
  });
});

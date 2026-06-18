import { describe, it, expect } from 'vitest';
import {
  weekToDate, dateToWeek, formatWeekCommencing, parseFlexibleDate, parseISODate,
} from './weeks';

const W1 = '2026-01-05'; // a Monday

describe('week <-> date mapping', () => {
  it('week 1 commences on the week-1 date', () => {
    expect(weekToDate(W1, 1).toISOString().slice(0, 10)).toBe('2026-01-05');
  });

  it('each week advances by 7 days', () => {
    expect(weekToDate(W1, 2).toISOString().slice(0, 10)).toBe('2026-01-12');
    expect(weekToDate(W1, 5).toISOString().slice(0, 10)).toBe('2026-02-02');
  });

  it('dateToWeek inverts weekToDate', () => {
    for (const wk of [1, 2, 10, 52, 104]) {
      expect(dateToWeek(W1, weekToDate(W1, wk))).toBe(wk);
    }
  });

  it('dateToWeek rounds to the nearest week boundary', () => {
    // 3 days after week-1 Monday -> still week 1 (nearest)
    expect(dateToWeek(W1, parseISODate('2026-01-08'))).toBe(1);
    // 4 days after -> rounds up to week 2
    expect(dateToWeek(W1, parseISODate('2026-01-09'))).toBe(2);
  });

  it('dateToWeek clamps to a minimum of week 1', () => {
    expect(dateToWeek(W1, parseISODate('2025-01-01'))).toBe(1);
  });

  it('formats week commencing for display', () => {
    expect(formatWeekCommencing(W1, 2)).toBe('w/c 12 Jan 2026');
  });
});

describe('parseFlexibleDate', () => {
  it('parses ISO dates', () => {
    expect(parseFlexibleDate('2026-03-09')?.toISOString().slice(0, 10)).toBe('2026-03-09');
  });
  it('parses UK day-first dates', () => {
    expect(parseFlexibleDate('09/03/2026')?.toISOString().slice(0, 10)).toBe('2026-03-09');
    expect(parseFlexibleDate('9-3-26')?.toISOString().slice(0, 10)).toBe('2026-03-09');
  });
  it('rejects impossible and unparseable dates', () => {
    expect(parseFlexibleDate('31/02/2026')).toBeNull();
    expect(parseFlexibleDate('not a date')).toBeNull();
    expect(parseFlexibleDate('')).toBeNull();
  });
});

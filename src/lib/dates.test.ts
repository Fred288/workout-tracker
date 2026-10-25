import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isIsoDate, mondayOf, toIso, parseIso, weekdayIndex } from './dates';

describe('dates', () => {
  it('round-trips and validates', () => {
    expect(toIso(parseIso('2026-10-25'))).toBe('2026-10-25');
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
  });
  it('adds days across month, year and DST changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // DST ends 2026-10-25 in Germany
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('finds weekday and monday', () => {
    expect(weekdayIndex('2026-10-26')).toBe(0); // Monday
    expect(weekdayIndex('2026-10-25')).toBe(6); // Sunday
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
  });
  it('counts days between dates', () => {
    expect(daysBetween('2026-10-25', '2026-10-26')).toBe(1);
    expect(daysBetween('2026-10-25', '2027-04-11')).toBe(168);
    expect(daysBetween('2026-10-26', '2026-10-25')).toBe(-1);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

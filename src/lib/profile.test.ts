import { describe, expect, it } from 'vitest';
import type { BodyMeasurement, Workout } from '../db/types';
import {
  dateKeyToMs,
  goalStreak,
  measurementsInRange,
  startOfWeek,
  toDateKey,
  weeklyWorkoutCounts,
  weightSummary,
} from './profile';

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();
const wk = (id: string, ms: number, finished = true): Workout => ({
  id,
  name: id,
  startedAt: ms,
  finishedAt: finished ? ms + 3_600_000 : undefined,
  exercises: [],
});
const m = (date: string, weightKg: number): BodyMeasurement => ({ id: date, date, weightKg });

describe('dates', () => {
  it('round-trips date keys in local time', () => {
    expect(toDateKey(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(toDateKey(new Date(dateKeyToMs('2026-01-31')))).toBe('2026-01-31');
  });

  it('weeks start on Monday', () => {
    // Sun 25 Oct 2026 belongs to the week of Mon 19 Oct, Mon 26 Oct starts a new one.
    expect(new Date(startOfWeek(at(2026, 10, 25, 23))).getDate()).toBe(19);
    expect(new Date(startOfWeek(at(2026, 10, 26, 0))).getDate()).toBe(26);
    expect(new Date(startOfWeek(at(2026, 10, 21))).getDay()).toBe(1);
  });
});

describe('weeklyWorkoutCounts', () => {
  const now = at(2026, 10, 24); // Saturday
  const list = [
    wk('a', at(2026, 10, 19)), // this week (Monday)
    wk('b', at(2026, 10, 23)),
    wk('c', at(2026, 10, 18)), // last week (Sunday)
    wk('d', at(2026, 8, 1)), // older than 12 weeks
    wk('running', at(2026, 10, 24), false),
  ];

  it('returns 12 weeks, oldest first, ending with the current week', () => {
    const weeks = weeklyWorkoutCounts(list, now);
    expect(weeks).toHaveLength(12);
    expect(weeks.at(-1)).toMatchObject({ weekStart: startOfWeek(now), count: 2 });
    expect(weeks.at(-2)?.count).toBe(1);
    expect(weeks[0].weekStart).toBeLessThan(weeks[1].weekStart);
  });

  it('ignores unfinished and older workouts', () => {
    const total = weeklyWorkoutCounts(list, now).reduce((n, w) => n + w.count, 0);
    expect(total).toBe(3);
  });

  it('spans a year change correctly', () => {
    const weeks = weeklyWorkoutCounts([wk('x', at(2026, 1, 2))], at(2026, 1, 5), 4);
    expect(weeks.map((w) => toDateKey(new Date(w.weekStart)))).toEqual(['2025-12-15', '2025-12-22', '2025-12-29', '2026-01-05']);
    expect(weeks[2].count).toBe(1);
  });
});

describe('weight', () => {
  const list = [m('2026-10-20', 80.5), m('2026-09-01', 83), m('2026-10-24', 80)];

  it('summarises latest, change and distance to the target', () => {
    const s = weightSummary(list, 77);
    expect(s?.latest.date).toBe('2026-10-24');
    expect(s?.changeKg).toBeCloseTo(-0.5, 5);
    expect(s?.toTargetKg).toBeCloseTo(-3, 5);
  });

  it('no data → no summary; first entry has no change', () => {
    expect(weightSummary([], 70)).toBeUndefined();
    expect(weightSummary([m('2026-10-24', 80)])?.changeKg).toBeUndefined();
    expect(weightSummary([m('2026-10-24', 80)])?.toTargetKg).toBeUndefined();
  });

  it('filters by range, oldest first', () => {
    const now = at(2026, 10, 24);
    expect(measurementsInRange(list, 31, now).map((x) => x.date)).toEqual(['2026-10-20', '2026-10-24']);
    expect(measurementsInRange(list, 0, now).map((x) => x.date)).toEqual(['2026-09-01', '2026-10-20', '2026-10-24']);
  });
});

describe('goalStreak', () => {
  const weeks = (counts: number[]) => counts.map((count, i) => ({ weekStart: i, count }));

  it('counts consecutive weeks that reached the goal', () => {
    expect(goalStreak(weeks([0, 3, 3, 4]), 3)).toBe(3);
  });
  it('an unfinished current week does not break the streak', () => {
    expect(goalStreak(weeks([3, 3, 1]), 3)).toBe(2);
  });
  it('a missed earlier week ends it, no goal means no streak', () => {
    expect(goalStreak(weeks([3, 1, 3, 3]), 3)).toBe(2);
    expect(goalStreak(weeks([3, 3]), 0)).toBe(0);
  });
});

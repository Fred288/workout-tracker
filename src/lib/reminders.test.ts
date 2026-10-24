import { describe, expect, it } from 'vitest';
import type { Workout } from '../db/types';
import { backupReminder, shouldShowInstallHint, snoozeUntil } from './reminders';

const DAY = 86_400_000;
const now = new Date(2026, 9, 24).getTime();
const done = (id: string, daysAgo: number): Workout => ({
  id,
  name: id,
  startedAt: now - daysAgo * DAY - 3_600_000,
  finishedAt: now - daysAgo * DAY,
  exercises: [],
});
const running: Workout = { id: 'r', name: 'r', startedAt: now - 60 * DAY, exercises: [] };

describe('backupReminder', () => {
  it('nothing to save, nothing to remind', () => {
    expect(backupReminder([], undefined, undefined, now)).toBeUndefined();
    expect(backupReminder([running], undefined, undefined, now)).toBeUndefined();
  });

  it('never exported: waits until the oldest workout is 14 days old', () => {
    expect(backupReminder([done('a', 5)], undefined, undefined, now)).toBeUndefined();
    expect(backupReminder([done('a', 14), done('b', 1)], undefined, undefined, now)).toEqual({
      newWorkouts: 2,
      daysSinceExport: undefined,
    });
  });

  it('exported: reminds after 14 days if there are newer workouts', () => {
    const export20 = now - 20 * DAY;
    expect(backupReminder([done('old', 25)], export20, undefined, now)).toBeUndefined(); // already in the export
    expect(backupReminder([done('old', 25), done('new', 3)], export20, undefined, now)).toEqual({
      newWorkouts: 1,
      daysSinceExport: 20,
    });
    expect(backupReminder([done('new', 3)], now - 10 * DAY, undefined, now)).toBeUndefined(); // export is recent
  });

  it('snoozing hides it for a week, then it returns', () => {
    const list = [done('a', 30)];
    const until = snoozeUntil(now);
    expect(until - now).toBe(7 * DAY);
    expect(backupReminder(list, undefined, until, now + DAY)).toBeUndefined();
    expect(backupReminder(list, undefined, until, until + 1)).toBeDefined();
  });
});

describe('shouldShowInstallHint', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
  const ipadAsMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36';

  it('shows in iOS Safari, not once installed', () => {
    expect(shouldShowInstallHint({ userAgent: iphone, maxTouchPoints: 5, standalone: false })).toBe(true);
    expect(shouldShowInstallHint({ userAgent: iphone, maxTouchPoints: 5, standalone: true })).toBe(false);
  });
  it('recognises iPadOS posing as a Mac, but not a real Mac or a PC', () => {
    expect(shouldShowInstallHint({ userAgent: ipadAsMac, maxTouchPoints: 5, standalone: false })).toBe(true);
    expect(shouldShowInstallHint({ userAgent: ipadAsMac, maxTouchPoints: 0, standalone: false })).toBe(false);
    expect(shouldShowInstallHint({ userAgent: desktop, maxTouchPoints: 0, standalone: false })).toBe(false);
  });
});

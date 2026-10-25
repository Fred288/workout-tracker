import { describe, expect, it } from 'vitest';
import type { Plan, PlannedSession, Weekday, WorkoutSet } from '../db/types';
import {
  baselineAfterBreak,
  currentLongRunMin,
  paceSamples,
  paceSuggestion,
  planSettings,
  rescheduleSuggestions,
} from './adapt';
import type { RunSet } from './endurance';
import { paceAtFraction, timeForVdot, vdot, vdotForPace } from './zones';

const s = (id: string, date: string, kind: PlannedSession['kind'] = 'easy', over: Partial<PlannedSession> = {}): PlannedSession => ({
  id,
  planId: 'p',
  weekIndex: 0,
  date,
  sport: 'run',
  kind,
  ...over,
});
// 2026-10-26 is a Monday. Run days Tue, Thu, Sat, Sun.
const runDays = [1, 3, 5, 6] as Weekday[];
const none = new Set<string>();

describe('rescheduleSuggestions', () => {
  it('moves a missed long run onto the next run day that is not next to a hard session, replacing an easy run', () => {
    const sessions = [
      s('long', '2026-10-25', 'long'), // Sunday, missed
      s('e1', '2026-10-27'), // Tue easy
      s('q1', '2026-10-29', 'tempo'), // Thu tempo
      s('e2', '2026-10-31'), // Sat easy
      s('l2', '2026-11-01', 'long'), // Sun long
    ];
    // Today Monday: Tue is free of hard neighbours (Mon empty, Wed empty).
    expect(rescheduleSuggestions(sessions, none, runDays, '2026-10-26')).toEqual([{ sessionId: 'long', toDate: '2026-10-27', replacesId: 'e1' }]);
  });

  it('skips days next to hard sessions and uses an empty run day', () => {
    const sessions = [
      s('q0', '2026-10-24', 'intervals'), // Sat, missed
      s('q1', '2026-10-28', 'tempo'), // Wed tempo blocks Tue and Thu
      s('l2', '2026-11-01', 'long'), // Sun long blocks Sat
    ];
    // Tue (27) next to Wed tempo, Thu (29) next to Wed, Sat (31) next to Sun -> nothing within 6 days? Fri is not a run day.
    expect(rescheduleSuggestions(sessions, none, runDays, '2026-10-26')).toEqual([]);
    const free = [s('q0', '2026-10-24', 'intervals'), s('l2', '2026-11-01', 'long')];
    expect(rescheduleSuggestions(free, none, runDays, '2026-10-26')).toEqual([{ sessionId: 'q0', toDate: '2026-10-27' }]);
  });

  it('ignores done, skipped, easy and old sessions and never moves two sessions onto adjacent days', () => {
    const sessions = [
      s('old', '2026-10-15', 'long'),
      s('easy', '2026-10-24'),
      s('skip', '2026-10-24', 'tempo', { skippedAt: 1 }),
      s('done', '2026-10-25', 'tempo'),
      s('a', '2026-10-24', 'long'),
      s('b', '2026-10-25', 'intervals'),
    ];
    const r = rescheduleSuggestions(sessions, new Set(['done']), runDays, '2026-10-26');
    expect(r.map((x) => x.sessionId)).toEqual(['a', 'b']);
    expect(r[0].toDate).toBe('2026-10-27'); // long first
    expect(r[1].toDate).toBe('2026-10-29'); // not Wed/next to Tue
  });

  it('does not move anything into the two days before the race', () => {
    const sessions = [s('q', '2026-10-25', 'tempo')];
    expect(rescheduleSuggestions(sessions, none, runDays, '2026-10-26', '2026-10-28')).toEqual([]);
  });

  it('does not use a day that already has a done session', () => {
    const sessions = [s('q', '2026-10-25', 'tempo'), s('d', '2026-10-27')];
    expect(rescheduleSuggestions(sessions, new Set(['d']), runDays, '2026-10-26')[0].toDate).toBe('2026-10-29');
  });
});

describe('zone inverse helpers', () => {
  it('vdotForPace inverts paceAtFraction and timeForVdot inverts vdot', () => {
    expect(vdotForPace(paceAtFraction(45, 0.7), 0.7)).toBeCloseTo(45, 3);
    const v = vdot(10_000, 2700)!;
    expect(timeForVdot(10_000, v)).toBeCloseTo(2700, 0);
  });
});

const ref = { distanceM: 5000, timeSec: 1500 }; // 25:00 5k, VDOT ~38.3
const day = (n: number) => Date.UTC(2026, 9, 1 + n, 8);
const NOW = day(30);
const runAt = (id: string, n: number, zone: WorkoutSet['zone'], paceSecPerKm: number, km = 5): RunSet => ({
  workoutId: id,
  startedAt: day(n),
  set: { id: id + 's', type: 'normal', completed: true, zone, distanceM: km * 1000, durationSec: Math.round(km * paceSecPerKm) },
});

describe('paceSamples', () => {
  it('takes the longest qualifying set per workout and judges it against its zone', () => {
    const samples = paceSamples(
      [
        runAt('a', 10, 2, 390), // zone 2 for 25:00 is about 6:03-6:57 -> ok
        runAt('a', 10, 4, 280, 1), // shorter set of the same workout, ignored
        runAt('b', 12, 2, 330), // clearly faster than zone 2
        runAt('c', 14, 2, 450), // slower
        runAt('d', 15, 1, 300), // zone 1 ignored
        runAt('e', 16, 3, 330, 0.5), // too short
        runAt('old', -20, 2, 330), // too old
      ],
      ref,
      NOW,
    );
    expect(samples.map((x) => [x.workoutId, x.verdict])).toEqual([
      ['a', 'ok'],
      ['b', 'faster'],
      ['c', 'slower'],
    ]);
  });
});

describe('paceSuggestion', () => {
  it('needs 3 of the last 5 in the same direction and suggests a faster reference', () => {
    const fast = paceSamples([runAt('a', 1, 2, 330), runAt('b', 3, 2, 335), runAt('c', 5, 3, 300), runAt('d', 7, 2, 390), runAt('e', 9, 2, 332)], ref, NOW);
    const r = paceSuggestion(fast, ref)!;
    expect(r).toMatchObject({ direction: 'faster', matches: 4, of: 5 });
    expect(r.timeSec).toBeLessThan(1500);
    // At most 5 % VDOT per step: 25:00 becomes about 24:00, not a big jump.
    expect(r.timeSec).toBeGreaterThan(1420);
    expect(r.vdot).toBeCloseTo(vdot(5000, 1500)! * 1.05, 5);
  });
  it('suggests a slower reference for a slow pattern', () => {
    const slow = paceSamples([runAt('a', 1, 2, 450), runAt('b', 3, 2, 460), runAt('c', 5, 2, 455)], ref, NOW);
    const r = paceSuggestion(slow, ref)!;
    expect(r.direction).toBe('slower');
    expect(r.timeSec).toBeGreaterThan(1500);
  });
  it('ignores single outliers and mixed results', () => {
    const mixed = paceSamples([runAt('a', 1, 2, 330), runAt('b', 3, 2, 450), runAt('c', 5, 2, 390), runAt('d', 7, 2, 330), runAt('e', 9, 2, 450)], ref, NOW);
    expect(paceSuggestion(mixed, ref)).toBeUndefined();
    expect(paceSuggestion(paceSamples([runAt('a', 1, 2, 330), runAt('b', 3, 2, 330)], ref, NOW), ref)).toBeUndefined();
  });
  it('only counts runs after the reference was last changed', () => {
    const list = [runAt('a', 1, 2, 330), runAt('b', 3, 2, 335), runAt('c', 5, 2, 332), runAt('d', 20, 2, 330)];
    expect(paceSamples(list, { ...ref, setAt: day(10) }, NOW).map((x) => x.workoutId)).toEqual(['d']);
  });

  it('only looks at the last five samples', () => {
    const list = paceSamples(
      [runAt('a', 1, 2, 330), runAt('b', 2, 2, 330), runAt('c', 3, 2, 330), runAt('d', 4, 2, 390), runAt('e', 5, 2, 390), runAt('f', 6, 2, 390), runAt('g', 7, 2, 390), runAt('h', 8, 2, 390)],
      ref,
      NOW,
    );
    expect(paceSuggestion(list, ref)).toBeUndefined();
  });
});

describe('plan settings and breaks', () => {
  const plan = { availability: { 1: ['run'], 6: ['run'] }, longRunDay: 6, level: 'beginner', baselineLongRunMin: 50 } as unknown as Plan;
  it('reads generator settings from the plan', () => {
    expect(planSettings(plan)).toEqual({ runDays: [1, 6], longRunDay: 6, level: 'beginner', baselineLongRunMin: 50 });
    expect(planSettings({ ...plan, longRunDay: undefined })).toBeUndefined();
    expect(planSettings({ ...plan, availability: {} })).toBeUndefined();
  });
  it('finds the current long run from the plan', () => {
    const long = (date: string, min: number) => s(date, date, 'long', { blocks: [{ repeat: 1, steps: [{ intensity: 'easy', durationSec: min * 60 }] }] });
    expect(currentLongRunMin([long('2026-10-18', 80), long('2026-10-25', 90), long('2026-11-01', 100)], '2026-10-26', 60)).toBe(90);
    expect(currentLongRunMin([], '2026-10-26', 60)).toBe(60);
  });
  it('reduces the baseline by 10 % per started week off, at most 40 %', () => {
    expect(baselineAfterBreak(100, 0)).toBe(100);
    expect(baselineAfterBreak(100, 3)).toBe(90);
    expect(baselineAfterBreak(100, 10)).toBe(80);
    expect(baselineAfterBreak(100, 60)).toBe(60);
    expect(baselineAfterBreak(25, 30)).toBe(20);
  });
});

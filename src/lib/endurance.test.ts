import { describe, expect, it } from 'vitest';
import type { Exercise, PlannedSession, Workout, WorkoutSet } from '../db/types';
import {
  bestEffort,
  easyPaceTrend,
  goalCheck,
  longestRun,
  nextSession,
  plannedSeconds,
  runSets,
  weeklyAdherence,
  weeklyRunVolume,
  zoneDistribution,
} from './endurance';

const run: Exercise = { id: 'Running', name: 'Running', sport: 'run' } as Exercise;
const bench: Exercise = { id: 'Bench', name: 'Bench' } as Exercise;
const ex = new Map([['Running', run], ['Bench', bench]]);

const set = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: Math.random().toString(), type: 'normal', completed: true, ...over });
const day = (iso: string) => new Date(iso + 'T10:00:00').getTime();
const workout = (id: string, iso: string, sets: WorkoutSet[], over: Partial<Workout> = {}): Workout => ({
  id,
  name: id,
  startedAt: day(iso),
  finishedAt: day(iso) + 3_600_000,
  exercises: [{ id: id + 'e', exerciseId: 'Running', order: 0, sets }],
  ...over,
});

describe('runSets', () => {
  it('keeps completed sets of running exercises of finished workouts only', () => {
    const w1 = workout('a', '2026-10-20', [set({ distanceM: 5000 }), set({ completed: false })]);
    const w2 = workout('b', '2026-10-21', [set()], { finishedAt: undefined });
    const w3: Workout = { ...workout('c', '2026-10-22', [set()]), exercises: [{ id: 'x', exerciseId: 'Bench', order: 0, sets: [set()] }] };
    const r = runSets([w1, w2, w3], ex);
    expect(r).toHaveLength(1);
    expect(r[0].set.distanceM).toBe(5000);
  });
});

describe('weeklyRunVolume', () => {
  it('sums per calendar week and counts runs once per workout', () => {
    const now = day('2026-10-25'); // Sunday of the week starting 2026-10-19
    const sets = runSets(
      [
        workout('a', '2026-10-20', [set({ distanceM: 5000, durationSec: 1500 }), set({ distanceM: 1000, durationSec: 300 })]),
        workout('b', '2026-10-24', [set({ distanceM: 10_000, durationSec: 3000 })]),
        workout('c', '2026-10-13', [set({ distanceM: 8000, durationSec: 2400 })]),
        workout('old', '2025-01-01', [set({ distanceM: 1000, durationSec: 300 })]),
      ],
      ex,
    );
    const v = weeklyRunVolume(sets, now, 3);
    expect(v).toHaveLength(3);
    expect(v[2]).toMatchObject({ distanceM: 16_000, durationSec: 4800, runs: 2 });
    expect(v[1]).toMatchObject({ distanceM: 8000, runs: 1 });
    expect(v[0]).toMatchObject({ distanceM: 0, runs: 0 });
  });
});

describe('plannedSeconds', () => {
  it('adds duration steps times repeats; distance steps count at 6:00 per km; race is 0', () => {
    expect(
      plannedSeconds({
        kind: 'intervals',
        blocks: [
          { repeat: 1, steps: [{ intensity: 'warmup', durationSec: 600 }] },
          { repeat: 4, steps: [{ intensity: 'interval', distanceM: 1000 }, { intensity: 'recovery', durationSec: 120 }] },
        ],
      }),
    ).toBe(600 + 4 * (360 + 120));
    expect(plannedSeconds({ kind: 'race', blocks: [{ repeat: 1, steps: [{ intensity: 'threshold', distanceM: 42_195 }] }] })).toBe(0);
    expect(plannedSeconds({ kind: 'easy' })).toBe(0);
  });
});

const sess = (id: string, date: string, over: Partial<PlannedSession> = {}): PlannedSession => ({
  id,
  planId: 'p',
  weekIndex: 0,
  date,
  sport: 'run',
  kind: 'easy',
  blocks: [{ repeat: 1, steps: [{ intensity: 'easy', durationSec: 1800 }] }],
  ...over,
});

describe('weeklyAdherence', () => {
  const weeks = [
    { index: 0, startDate: '2026-10-12' },
    { index: 1, startDate: '2026-10-19' },
    { index: 2, startDate: '2026-10-26' },
  ];
  const sessions = [
    sess('a', '2026-10-13'),
    sess('b', '2026-10-15'),
    sess('c', '2026-10-17', { skippedAt: 1 }),
    sess('d', '2026-10-20'),
    sess('e', '2026-10-27'),
  ];

  it('counts done, planned and skipped, leaves out future weeks', () => {
    const r = weeklyAdherence(weeks, sessions, new Set(['a']), '2026-10-25');
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ planned: 2, done: 1, skipped: 1, share: 0.5, plannedSec: 3600 });
    expect(r[1]).toMatchObject({ planned: 1, done: 0, share: 0 });
  });

  it('has no share for weeks without sessions', () => {
    expect(weeklyAdherence([{ index: 0, startDate: '2026-09-01' }], [], new Set(), '2026-10-25')[0].share).toBeUndefined();
  });
});

describe('zoneDistribution', () => {
  it('adds time per zone and reports unknown time separately', () => {
    const sets = runSets(
      [workout('a', '2026-10-20', [set({ zone: 2, durationSec: 2400 }), set({ zone: 4, durationSec: 600 }), set({ durationSec: 1000 }), set({ zone: 1, durationSec: 600 })])],
      ex,
    );
    const z = zoneDistribution(sets);
    expect(z.seconds).toEqual({ 1: 600, 2: 2400, 3: 0, 4: 600, 5: 0 });
    expect(z.unknownSec).toBe(1000);
    expect(z.knownSec).toBe(3600);
    expect(z.easyShare).toBeCloseTo(3000 / 3600);
  });
  it('filters by start date and handles no data', () => {
    const sets = runSets([workout('a', '2026-10-01', [set({ zone: 2, durationSec: 600 })])], ex);
    expect(zoneDistribution(sets, day('2026-10-10')).easyShare).toBeUndefined();
  });
});

describe('easyPaceTrend', () => {
  it('uses zone 2 sets per workout, needs enough distance, sorted by date', () => {
    const sets = runSets(
      [
        workout('late', '2026-10-20', [set({ zone: 2, distanceM: 5000, durationSec: 1650 })]),
        workout('early', '2026-10-01', [set({ zone: 2, distanceM: 3000, durationSec: 1050 }), set({ zone: 2, distanceM: 2000, durationSec: 700 })]),
        workout('short', '2026-10-10', [set({ zone: 2, distanceM: 1000, durationSec: 400 })]),
        workout('hard', '2026-10-12', [set({ zone: 4, distanceM: 5000, durationSec: 1300 })]),
      ],
      ex,
    );
    const t = easyPaceTrend(sets);
    expect(t.map((p) => Math.round(p.paceSecPerKm))).toEqual([350, 330]);
    expect(t[0].distanceM).toBe(5000);
  });
});

describe('longestRun and bestEffort', () => {
  const sets = runSets(
    [
      workout('a', '2026-10-20', [set({ distanceM: 5000, durationSec: 1500 }), set({ distanceM: 1000, durationSec: 300 })]),
      workout('b', '2026-10-22', [set({ distanceM: 12_000, durationSec: 4200 })]),
      workout('c', '2026-10-24', [set({ distanceM: 5000, durationSec: 1320 })]),
      workout('d', '2026-10-25', [set({ distanceM: 800, durationSec: 150 })]),
    ],
    ex,
  );
  it('finds the longest run by total distance', () => {
    expect(longestRun(sets)).toMatchObject({ workoutId: 'b', distanceM: 12_000 });
    expect(longestRun([])).toBeUndefined();
  });
  it('picks the best effort among sets of at least 3 km and ignores short intervals', () => {
    const b = bestEffort(sets)!;
    expect(b).toMatchObject({ workoutId: 'c', distanceM: 5000, timeSec: 1320 });
    expect(b.vdot).toBeGreaterThan(40);
    expect(bestEffort(runSets([workout('x', '2026-10-25', [set({ distanceM: 800, durationSec: 150 })])], ex))).toBeUndefined();
  });
});

describe('goalCheck', () => {
  const ref = { distanceM: 10_000, timeSec: 2400 };
  it('compares the prediction with the target time', () => {
    const behind = goalCheck({ type: 'marathon', targetTimeSec: 3 * 3600 }, ref)!;
    expect(behind.status).toBe('behind');
    expect(behind.diffSec!).toBeGreaterThan(0);
    expect(behind.uncertain).toBe(true);
    expect(goalCheck({ type: 'marathon', targetTimeSec: 4 * 3600 }, ref)!.status).toBe('ahead');
    const close = goalCheck({ type: '10k', targetTimeSec: 2390 }, ref)!;
    expect(close.status).toBe('close');
    expect(close.uncertain).toBe(false);
  });
  it('works without target and returns nothing without reference or for triathlon', () => {
    expect(goalCheck({ type: 'half' }, ref)!.status).toBeUndefined();
    expect(goalCheck({ type: 'half', targetTimeSec: 7000 }, undefined)).toBeUndefined();
    expect(goalCheck({ type: 'sprint' }, ref)).toBeUndefined();
  });
});

describe('nextSession', () => {
  it('returns the earliest open session from today, skipping done and skipped ones', () => {
    const list = [sess('past', '2026-10-20'), sess('done', '2026-10-25'), sess('skip', '2026-10-26', { skippedAt: 1 }), sess('next', '2026-10-27'), sess('later', '2026-10-30')];
    expect(nextSession(list, new Set(['done']), '2026-10-25')!.id).toBe('next');
    expect(nextSession([], new Set(), '2026-10-25')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { Exercise, Workout, WorkoutSet } from '../db/types';
import { bestBikePower, bikePowerTrend, enduranceSets, ftpFromBest, longestSwim, swimPaceTrend, weeklySportVolume } from './enduranceSports';

const exs = new Map<string, Exercise>([
  ['Running', { id: 'Running', name: 'Running', sport: 'run' } as Exercise],
  ['Bicycling', { id: 'Bicycling', name: 'Bicycling', sport: 'bike' } as Exercise],
  ['Swimming', { id: 'Swimming', name: 'Swimming', sport: 'swim' } as Exercise],
  ['Bench', { id: 'Bench', name: 'Bench' } as Exercise],
]);
const set = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: Math.random().toString(), type: 'normal', completed: true, ...over });
const day = (iso: string) => new Date(iso + 'T10:00:00').getTime();
const workout = (id: string, iso: string, exerciseId: string, sets: WorkoutSet[], over: Partial<Workout> = {}): Workout => ({
  id,
  name: id,
  startedAt: day(iso),
  finishedAt: day(iso) + 3_600_000,
  exercises: [{ id: id + 'e', exerciseId, order: 0, sets }],
  ...over,
});

describe('enduranceSets', () => {
  it('keeps completed swim, bike and run sets of finished workouts only', () => {
    const r = enduranceSets(
      [
        workout('a', '2026-10-20', 'Swimming', [set({ distanceM: 1000 }), set({ completed: false })]),
        workout('b', '2026-10-21', 'Bicycling', [set()]),
        workout('c', '2026-10-22', 'Running', [set()], { finishedAt: undefined }),
        workout('d', '2026-10-23', 'Bench', [set()]),
      ],
      exs,
    );
    expect(r.map((x) => x.sport)).toEqual(['swim', 'bike']);
  });
});

describe('weeklySportVolume', () => {
  it('sums time and distance per sport and week', () => {
    const now = day('2026-10-25'); // week starting 2026-10-19
    const sets = enduranceSets(
      [
        workout('a', '2026-10-20', 'Swimming', [set({ durationSec: 1800, distanceM: 1500 })]),
        workout('b', '2026-10-22', 'Bicycling', [set({ durationSec: 3600, distanceM: 30000 }), set({ durationSec: 600 })]),
        workout('c', '2026-10-13', 'Running', [set({ durationSec: 1200, distanceM: 4000 })]),
        workout('d', '2026-01-01', 'Running', [set({ durationSec: 999 })]),
      ],
      exs,
    );
    const rows = weeklySportVolume(sets, now, 3);
    expect(rows).toHaveLength(3);
    expect(rows[2].sec).toEqual({ swim: 1800, bike: 4200, run: 0 });
    expect(rows[2].distanceM.bike).toBe(30000);
    expect(rows[1].sec.run).toBe(1200);
    expect(rows[0].sec).toEqual({ swim: 0, bike: 0, run: 0 });
  });
});

describe('bike power', () => {
  const sets = enduranceSets(
    [
      workout('a', '2026-10-01', 'Bicycling', [set({ durationSec: 1800, avgPowerW: 200 }), set({ durationSec: 600, avgPowerW: 100 })]),
      workout('b', '2026-10-10', 'Bicycling', [set({ durationSec: 1500, avgPowerW: 230 })]),
      workout('c', '2026-10-12', 'Bicycling', [set({ durationSec: 300, avgPowerW: 300 })]),
      workout('d', '2026-10-14', 'Bicycling', [set({ durationSec: 3600 })]),
    ],
    exs,
  );
  it('averages power per ride weighted by time and skips short or powerless rides', () => {
    expect(bikePowerTrend(sets)).toEqual([
      { at: day('2026-10-01'), watts: 175, durationSec: 2400 },
      { at: day('2026-10-10'), watts: 230, durationSec: 1500 },
    ]);
  });
  it('finds the best power over at least 20 minutes and estimates FTP', () => {
    expect(bestBikePower(sets)).toEqual({ watts: 230, durationSec: 1500, startedAt: day('2026-10-10') });
    expect(bestBikePower(sets, 3000)).toBeUndefined();
    expect(ftpFromBest(230)).toBe(219);
  });
});

describe('swim', () => {
  const sets = enduranceSets(
    [
      workout('a', '2026-10-01', 'Swimming', [set({ distanceM: 400, durationSec: 800 }), set({ distanceM: 400, durationSec: 840 })]),
      workout('b', '2026-10-08', 'Swimming', [set({ distanceM: 300, durationSec: 540 })]),
      workout('c', '2026-10-15', 'Swimming', [set({ distanceM: 1000, durationSec: 1800 })]),
    ],
    exs,
  );
  it('computes pace per 100 m per session and skips short sessions', () => {
    const t = swimPaceTrend(sets);
    expect(t).toHaveLength(2);
    expect(t[0].secPer100m).toBeCloseTo(205, 5);
    expect(t[1].secPer100m).toBeCloseTo(180, 5);
    expect(swimPaceTrend(sets, 100)).toHaveLength(3);
  });
  it('finds the longest swim set', () => {
    expect(longestSwim(sets)).toEqual({ distanceM: 1000, startedAt: day('2026-10-15') });
    expect(longestSwim([])).toBeUndefined();
  });
});

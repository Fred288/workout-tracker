import { describe, expect, it } from 'vitest';
import type { Exercise, Workout, WorkoutSet } from '../db/types';
import { addDays } from './dates';
import {
  ZONE_IF,
  dailyLoads,
  formState,
  intensityFactor,
  performanceChart,
  plannedLoad,
  points,
  setLoad,
  workoutLoad,
} from './load';
import { hrZones } from './zones';

const set = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: 's', type: 'normal', completed: true, durationSec: 3600, ...over });
const ex = new Map<string, Exercise>([
  ['Running', { id: 'Running', sport: 'run' } as Exercise],
  ['Bicycling', { id: 'Bicycling', sport: 'bike' } as Exercise],
  ['Bench', { id: 'Bench' } as Exercise],
]);
const t0 = new Date(2026, 9, 20, 8).getTime();
const w = (exercises: Workout['exercises'], over: Partial<Workout> = {}): Workout => ({
  id: 'w',
  name: 'w',
  startedAt: t0,
  finishedAt: t0 + 3_600_000,
  exercises,
  ...over,
});

describe('points', () => {
  it('is 100 for one hour at threshold and scales with IF squared', () => {
    expect(points(3600, 1)).toBe(100);
    expect(points(1800, 1)).toBe(50);
    expect(points(3600, 0.7)).toBeCloseTo(49);
  });
});

describe('intensityFactor', () => {
  const zones = hrZones({ maxHr: 200 })!;
  it('prefers power, then heart rate, then zone, then RPE, then a default', () => {
    expect(intensityFactor(set({ avgPowerW: 200, avgHr: 190, zone: 1 }), { ftpW: 250, hrZones: zones })).toEqual({ value: 0.8, source: 'power' });
    expect(intensityFactor(set({ avgPowerW: 200, avgHr: 170, zone: 1 }), { hrZones: zones })).toEqual({ value: ZONE_IF[4], source: 'hr' });
    expect(intensityFactor(set({ avgHr: 170, zone: 1 }), {})).toEqual({ value: ZONE_IF[1], source: 'zone' });
    expect(intensityFactor(set({ rpe: 10 }), {}).value).toBeCloseTo(1.0);
    expect(intensityFactor(set({ rpe: 5 }), {}).source).toBe('rpe');
    expect(intensityFactor(set(), {})).toEqual({ value: ZONE_IF[2], source: 'default' });
    expect(intensityFactor(set({ type: 'warmup' }), {})).toEqual({ value: ZONE_IF[1], source: 'default' });
  });
  it('ignores an RPE outside 1-10', () => {
    expect(intensityFactor(set({ rpe: 12 }), {}).source).toBe('default');
  });
});

describe('setLoad', () => {
  it('needs a completed set with a duration', () => {
    expect(setLoad(set({ zone: 4 }), {})).toBeCloseTo(90.25);
    expect(setLoad(set({ completed: false }), {})).toBe(0);
    expect(setLoad(set({ durationSec: undefined }), {})).toBe(0);
  });
});

describe('workoutLoad', () => {
  it('adds endurance sets by intensity', () => {
    const run = w([{ id: 'e', exerciseId: 'Running', order: 0, sets: [set({ zone: 2, durationSec: 2400 }), set({ zone: 4, durationSec: 1200 })] }]);
    expect(workoutLoad(run, ex, {})).toBeCloseTo(points(2400, 0.7) + points(1200, 0.95));
  });
  it('counts strength at a flat rate, capped at two hours, minus pauses', () => {
    const gym = (hours: number, pauses?: Workout['pauses']) =>
      w([{ id: 'e', exerciseId: 'Bench', order: 0, sets: [set({ durationSec: undefined, reps: 5, weightKg: 80 })] }], { finishedAt: t0 + hours * 3_600_000, pauses });
    expect(workoutLoad(gym(1), ex, {})).toBeCloseTo(30);
    expect(workoutLoad(gym(3), ex, {})).toBeCloseTo(60);
    expect(workoutLoad(gym(1, [{ from: t0, to: t0 + 1_800_000 }]), ex, {})).toBeCloseTo(15);
  });
  it('mixed workouts count the strength part as the time outside endurance sets', () => {
    const mixed = w([
      { id: 'a', exerciseId: 'Running', order: 0, sets: [set({ zone: 2, durationSec: 1800 })] },
      { id: 'b', exerciseId: 'Bench', order: 1, sets: [set({ durationSec: undefined, reps: 5 })] },
    ]);
    expect(workoutLoad(mixed, ex, {})).toBeCloseTo(points(1800, 0.7) + 15);
  });
  it('is 0 for unfinished workouts and ignores empty strength exercises', () => {
    expect(workoutLoad(w([{ id: 'e', exerciseId: 'Running', order: 0, sets: [set()] }], { finishedAt: undefined }), ex, {})).toBe(0);
    expect(workoutLoad(w([{ id: 'e', exerciseId: 'Bench', order: 0, sets: [set({ completed: false })] }]), ex, {})).toBe(0);
  });
  it('uses power for cycling when FTP is known', () => {
    const ride = w([{ id: 'e', exerciseId: 'Bicycling', order: 0, sets: [set({ avgPowerW: 180 })] }]);
    expect(workoutLoad(ride, ex, { ftpW: 200 })).toBeCloseTo(81);
  });
});

describe('dailyLoads', () => {
  it('sums the workouts of a local day', () => {
    const a = w([{ id: 'e', exerciseId: 'Running', order: 0, sets: [set({ zone: 4 })] }], { id: 'a' });
    const b = w([{ id: 'e', exerciseId: 'Running', order: 0, sets: [set({ zone: 4 })] }], { id: 'b', startedAt: t0 + 3_600_000, finishedAt: t0 + 7_200_000 });
    const c = w([{ id: 'e', exerciseId: 'Running', order: 0, sets: [set({ zone: 2 })] }], { id: 'c', startedAt: t0 + 86_400_000, finishedAt: t0 + 90_000_000 });
    const d = dailyLoads([a, b, c], ex, {});
    expect(d.get('2026-10-20')).toBeCloseTo(180.5);
    expect(d.get('2026-10-21')).toBeCloseTo(49);
  });
});

describe('plannedLoad', () => {
  it('uses the step zones (or the default zone of the intensity)', () => {
    const s = { kind: 'tempo' as const, blocks: [{ repeat: 1, steps: [{ intensity: 'warmup' as const, durationSec: 600 }, { intensity: 'tempo' as const, durationSec: 1200, zone: 4 as const }] }] };
    expect(plannedLoad(s)).toBeCloseTo(points(600, ZONE_IF[1]) + points(1200, ZONE_IF[4]));
  });
  it('counts distance steps at 6:00 per km and repeats', () => {
    const s = { kind: 'intervals' as const, blocks: [{ repeat: 4, steps: [{ intensity: 'interval' as const, distanceM: 1000 }] }] };
    expect(plannedLoad(s)).toBeCloseTo(4 * points(360, ZONE_IF[5]));
  });
  it('estimates the race from the predicted time and the race intensity', () => {
    const race = { kind: 'race' as const, blocks: [{ repeat: 1, steps: [{ intensity: 'threshold' as const, distanceM: 42_195 }] }] };
    expect(plannedLoad(race, { goalType: 'marathon', raceTimeSec: 4 * 3600 })).toBeCloseTo(points(4 * 3600, 0.85));
    expect(plannedLoad(race, { goalType: 'marathon' })).toBeCloseTo(points(42.195 * 360, 0.85));
  });
});

describe('performanceChart', () => {
  it('approaches a constant daily load; fatigue reacts faster than fitness', () => {
    const daily = new Map<string, number>();
    for (let i = 0; i < 200; i++) daily.set(addDays('2026-01-01', i), 60);
    const pmc = performanceChart(daily, '2026-01-01', addDays('2026-01-01', 199), '2027-01-01');
    expect(pmc).toHaveLength(200);
    expect(pmc[6].atl).toBeGreaterThan(pmc[6].ctl);
    expect(pmc.at(-1)!.ctl).toBeGreaterThan(59);
    expect(pmc.at(-1)!.atl).toBeCloseTo(60, 3);
    expect(Math.abs(pmc.at(-1)!.tsb)).toBeLessThan(1);
  });
  it('form uses the values of the day before', () => {
    const daily = new Map([['2026-01-02', 100]]);
    const pmc = performanceChart(daily, '2026-01-01', '2026-01-04', '2027-01-01');
    expect(pmc[1].tsb).toBe(0); // the hard day itself starts fresh
    expect(pmc[2].tsb).toBeLessThan(0); // the day after is tired
    expect(pmc[1].atl).toBeCloseTo(100 * (1 - Math.exp(-1 / 7)));
  });
  it('uses planned loads after today and marks them as projected', () => {
    const actual = new Map([['2026-01-01', 50], ['2026-01-03', 999]]);
    const planned = new Map([['2026-01-03', 70]]);
    const pmc = performanceChart(actual, '2026-01-01', '2026-01-03', '2026-01-02', planned);
    expect(pmc.map((d) => [d.load, d.projected])).toEqual([[50, false], [0, false], [70, true]]);
  });
  it('a taper raises form', () => {
    const daily = new Map<string, number>();
    for (let i = 0; i < 60; i++) daily.set(addDays('2026-01-01', i), i < 50 ? 80 : 20);
    const pmc = performanceChart(daily, '2026-01-01', addDays('2026-01-01', 59), '2027-01-01');
    expect(pmc[49].tsb).toBeLessThan(0);
    expect(pmc[59].tsb).toBeGreaterThan(pmc[49].tsb + 20);
  });
});

describe('formState', () => {
  it('maps form to ranges', () => {
    expect(formState(-40)).toBe('overload');
    expect(formState(-20)).toBe('building');
    expect(formState(0)).toBe('neutral');
    expect(formState(5)).toBe('neutral');
    expect(formState(15)).toBe('fresh');
    expect(formState(30)).toBe('detraining');
  });
});

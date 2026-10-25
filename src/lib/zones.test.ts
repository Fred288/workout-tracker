import { describe, expect, it } from 'vitest';
import { hrZones, paceAtFraction, paceZones, powerZones, predictRaces, profilePaceZones, riegel, vdot, zoneFromHr } from './zones';

describe('vdot', () => {
  it('matches the Daniels tables', () => {
    expect(vdot(5000, 20 * 60)).toBeCloseTo(49.8, 0);
    expect(vdot(10_000, 40 * 60)).toBeCloseTo(51.9, 0);
    expect(vdot(42_195, 3 * 3600)).toBeCloseTo(53.5, 0);
  });
  it('is higher for faster times and rejects bad input', () => {
    expect(vdot(5000, 1100)!).toBeGreaterThan(vdot(5000, 1300)!);
    expect(vdot(0, 100)).toBeUndefined();
    expect(vdot(5000, 0)).toBeUndefined();
    expect(vdot(5000, -1)).toBeUndefined();
  });
});

describe('riegel', () => {
  it('scales time with distance^1.06', () => {
    expect(riegel(1200, 5000, 10_000)).toBeCloseTo(1200 * 2 ** 1.06, 5);
    expect(riegel(1200, 5000, 5000)).toBe(1200);
  });
});

describe('predictRaces', () => {
  it('predicts the four distances and flags far-off ones', () => {
    const p = predictRaces({ distanceM: 10_000, timeSec: 2400 });
    expect(p.map((x) => x.id)).toEqual(['5k', '10k', 'half', 'marathon']);
    expect(p.find((x) => x.id === '10k')!.timeSec).toBeCloseTo(2400);
    expect(p.find((x) => x.id === 'half')!.uncertain).toBe(false);
    expect(p.find((x) => x.id === 'marathon')!.uncertain).toBe(true);
    expect(p.find((x) => x.id === '5k')!.uncertain).toBe(false);
    // Marathon from a 40:00 10k lands near 3:04.
    expect(p.find((x) => x.id === 'marathon')!.timeSec / 3600).toBeGreaterThan(3.0);
    expect(p.find((x) => x.id === 'marathon')!.timeSec / 3600).toBeLessThan(3.2);
  });
});

describe('pace zones', () => {
  const v = vdot(5000, 20 * 60)!;
  it('are ordered from slow to fast without gaps', () => {
    const z = paceZones(v);
    for (const i of [1, 2, 3, 4, 5] as const) expect(z[i].slow).toBeGreaterThan(z[i].fast);
    for (const i of [1, 2, 3, 4] as const) expect(z[i].fast).toBeCloseTo(z[(i + 1) as 2].slow, 6);
  });
  it('sit in realistic ranges for a 20:00 5k runner', () => {
    const z = paceZones(v);
    // Easy about 5:10-5:50 per km, threshold about 4:10-4:20, interval about 3:50-4:00.
    expect(z[2].slow).toBeGreaterThan(5 * 60 + 15);
    expect(z[2].slow).toBeLessThan(6 * 60 + 15);
    expect(z[4].fast).toBeGreaterThan(3 * 60 + 55);
    expect(z[4].fast).toBeLessThan(4 * 60 + 15);
    expect(z[5].fast).toBeGreaterThan(3 * 60 + 45);
    expect(z[5].fast).toBeLessThan(4 * 60 + 5);
  });
  it('pace at fraction 1.0 is faster than the 5k race pace of that runner (VDOT is a race value)', () => {
    expect(paceAtFraction(v, 1.0)).toBeLessThan(240);
    expect(paceAtFraction(v, 0.8)).toBeGreaterThan(paceAtFraction(v, 0.9));
  });
});

describe('profilePaceZones', () => {
  it('returns undefined without or with an implausible reference', () => {
    expect(profilePaceZones({})).toBeUndefined();
    expect(profilePaceZones({ referenceRun: { distanceM: 5000, timeSec: 60 } })).toBeUndefined();
    expect(profilePaceZones({ referenceRun: { distanceM: 5000, timeSec: 10_000 } })).toBeUndefined();
  });
  it('computes zones for a valid reference', () => {
    const r = profilePaceZones({ referenceRun: { distanceM: 5000, timeSec: 1500 } })!;
    expect(r.vdot).toBeGreaterThan(38);
    expect(r.zones[3].slow).toBeGreaterThan(r.zones[4].slow);
  });
});

describe('hrZones', () => {
  it('prefers threshold, then reserve, then max', () => {
    expect(hrZones({ thresholdHr: 170, maxHr: 190, restingHr: 50 })!.source).toBe('threshold');
    expect(hrZones({ maxHr: 190, restingHr: 50 })!.source).toBe('reserve');
    expect(hrZones({ maxHr: 190 })!.source).toBe('max');
    expect(hrZones({})).toBeUndefined();
    expect(hrZones({ maxHr: 20 })).toBeUndefined();
  });
  it('computes percentage of max', () => {
    const z = hrZones({ maxHr: 200 })!.zones;
    expect(z.map((x) => [x.min, x.max])).toEqual([[100, 120], [120, 140], [140, 160], [160, 180], [180, 200]]);
  });
  it('computes Karvonen zones', () => {
    const z = hrZones({ maxHr: 190, restingHr: 50 })!.zones;
    expect(z[0].min).toBe(120); // 50 + 140 * 0.5
    expect(z[4].max).toBe(190);
  });
  it('ignores an implausible resting rate', () => {
    expect(hrZones({ maxHr: 190, restingHr: 175 })!.source).toBe('max');
  });
  it('maps a heart rate to a zone', () => {
    const z = hrZones({ maxHr: 200 })!;
    expect(zoneFromHr(90, z)).toBe(1);
    expect(zoneFromHr(130, z)).toBe(2);
    expect(zoneFromHr(159, z)).toBe(3);
    expect(zoneFromHr(160, z)).toBe(4);
    expect(zoneFromHr(199, z)).toBe(5);
    expect(zoneFromHr(210, z)).toBe(5);
  });
});

describe('powerZones', () => {
  it('computes Coggan zones from FTP', () => {
    const z = powerZones(200)!;
    expect(z.map((x) => [x.min, x.max])).toEqual([[0, 110], [110, 150], [150, 180], [180, 210], [210, undefined]]);
  });
  it('needs a plausible FTP', () => {
    expect(powerZones(undefined)).toBeUndefined();
    expect(powerZones(10)).toBeUndefined();
    expect(powerZones(900)).toBeUndefined();
  });
});

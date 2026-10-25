import { describe, expect, it } from 'vitest';
import { formatPace, formatSetExtras, pacePer100m, paceSecPerKm, speedKmh } from './pace';

describe('pace', () => {
  it('computes pace per km', () => {
    expect(paceSecPerKm(5000, 1650)).toBe(330);
    expect(paceSecPerKm(10000, 3000)).toBe(300);
  });
  it('returns undefined for missing or zero values', () => {
    expect(paceSecPerKm(undefined, 100)).toBeUndefined();
    expect(paceSecPerKm(0, 100)).toBeUndefined();
    expect(paceSecPerKm(1000, 0)).toBeUndefined();
    expect(speedKmh(1000, undefined)).toBeUndefined();
    expect(pacePer100m(undefined, undefined)).toBeUndefined();
  });
  it('computes swim pace and speed', () => {
    expect(pacePer100m(400, 480)).toBe(120);
    expect(speedKmh(30000, 3600)).toBe(30);
  });
  it('formats per sport', () => {
    expect(formatPace('run', 5000, 1650)).toBe('5:30 /km');
    expect(formatPace(undefined, 5000, 1650)).toBe('5:30 /km');
    expect(formatPace('swim', 400, 500)).toBe('2:05 /100 m');
    expect(formatPace('bike', 30000, 3600)).toBe('30 km/h');
    expect(formatPace('run', undefined, 100)).toBe('');
  });
  it('formats set extras', () => {
    expect(formatSetExtras({ id: 's', type: 'normal', completed: true, zone: 2, avgHr: 145, rpe: 6 })).toBe('Z2 · 145 bpm · RPE 6');
    expect(formatSetExtras({ id: 's', type: 'normal', completed: true })).toBe('');
  });
});

describe('setDetail', () => {
  it('combines pace and extras for endurance only', async () => {
    const { setDetail } = await import('./pace');
    const s = { id: 's', type: 'normal' as const, completed: true, distanceM: 5000, durationSec: 1650, zone: 2 as const };
    expect(setDetail('run', s)).toBe('5:30 /km · Z2');
    expect(setDetail(undefined, s)).toBe('');
    expect(setDetail('strength', s)).toBe('');
  });
});

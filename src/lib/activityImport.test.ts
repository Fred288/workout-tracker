import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/dexie';
import { importActivityWorkouts } from '../db/activityImport';
import type { PlannedSession } from '../db/types';
import type { ActivityLap, ParsedActivity } from './activityFiles';
import { activityId, activityToWorkout, isImportable, matchingSessions, suggestUseLaps } from './activityImport';
import { hrZones } from './zones';

const lap = (distanceM: number, durationSec = 300, over: Partial<ActivityLap> = {}): ActivityLap => ({ startedAt: 0, durationSec, distanceM, ...over });
const act = (over: Partial<ParsedActivity> = {}): ParsedActivity & { sport: 'run' | 'bike' } => ({
  source: 'fit',
  sport: 'run',
  sportGuessed: false,
  startedAt: Date.UTC(2026, 9, 22, 8, 0, 0),
  elapsedSec: 3700,
  durationSec: 3600,
  distanceM: 10_000,
  avgHr: 152,
  maxHr: 181,
  laps: [lap(5000, 1800), lap(5000, 1800)],
  ...over,
}) as ParsedActivity & { sport: 'run' | 'bike' };

describe('isImportable', () => {
  it('accepts running and cycling with a duration only', () => {
    expect(isImportable(act())).toBe(true);
    expect(isImportable(act({ sport: 'bike' }))).toBe(true);
    expect(isImportable(act({ sport: 'swim' }))).toBe(false);
    expect(isImportable(act({ sport: 'other' }))).toBe(false);
    expect(isImportable(act({ durationSec: 0 }))).toBe(false);
  });
});

describe('suggestUseLaps', () => {
  it('ignores evenly sized laps and keeps different ones', () => {
    expect(suggestUseLaps({ laps: [lap(1000), lap(1005), lap(995), lap(400)] })).toBe(false); // auto km laps + remainder
    expect(suggestUseLaps({ laps: [lap(2000), lap(800), lap(400), lap(800), lap(400), lap(2000)] })).toBe(true);
    expect(suggestUseLaps({ laps: [lap(5000)] })).toBe(false);
    expect(suggestUseLaps({ laps: [lap(5000), lap(100)] })).toBe(true);
    expect(suggestUseLaps({ laps: Array.from({ length: 60 }, () => lap(100)) })).toBe(false);
  });
});

describe('activityToWorkout', () => {
  it('builds one set from the summary with zone from heart rate', () => {
    const w = activityToWorkout(act(), { useLaps: false, hrZones: hrZones({ maxHr: 200 }) });
    expect(w).toMatchObject({ id: activityId(act()), name: 'Lauf', sport: 'run', startedAt: act().startedAt, finishedAt: act().startedAt + 3_700_000 });
    expect(w.exercises[0]).toMatchObject({ exerciseId: 'Running' });
    expect(w.exercises[0].sets).toHaveLength(1);
    expect(w.exercises[0].sets[0]).toMatchObject({ distanceM: 10_000, durationSec: 3600, avgHr: 152, maxHr: 181, zone: 3, completed: true, type: 'normal' });
  });
  it('uses laps as sets when asked and falls back to the summary for a single lap', () => {
    const a = act({ laps: [lap(2000, 600, { avgHr: 130 }), lap(800, 180, { avgHr: 175 })] });
    const w = activityToWorkout(a, { useLaps: true });
    expect(w.exercises[0].sets.map((s) => [s.distanceM, s.durationSec, s.avgHr])).toEqual([[2000, 600, 130], [800, 180, 175]]);
    expect(w.exercises[0].sets[0].zone).toBeUndefined();
    expect(activityToWorkout(act({ laps: [lap(10_000, 3600)] }), { useLaps: true }).exercises[0].sets).toHaveLength(1);
  });
  it('maps cycling, links the planned session and takes a custom name', () => {
    const w = activityToWorkout(act({ sport: 'bike', avgPowerW: 190 }), { useLaps: false, plannedSessionId: 'p1', name: ' Ausfahrt ' });
    expect(w).toMatchObject({ name: 'Ausfahrt', plannedSessionId: 'p1', sport: 'bike' });
    expect(w.exercises[0]).toMatchObject({ exerciseId: 'Bicycling' });
    expect(w.exercises[0].sets[0].avgPowerW).toBe(190);
  });
  it('omits missing values and has deterministic ids', () => {
    const a = act({ avgHr: undefined, maxHr: undefined, distanceM: 0, laps: [lap(0, 600)] });
    const s = activityToWorkout(a, { useLaps: false }).exercises[0].sets[0];
    expect(s).not.toHaveProperty('distanceM');
    expect(s).not.toHaveProperty('avgHr');
    expect(activityToWorkout(a, { useLaps: false }).id).toBe(activityToWorkout(a, { useLaps: false }).id);
  });
});

describe('matchingSessions', () => {
  const day = new Date(2026, 9, 22, 8).getTime();
  const s = (id: string, date: string, over: Partial<PlannedSession> = {}): PlannedSession => ({ id, planId: 'p', weekIndex: 0, date, sport: 'run', kind: 'easy', ...over });
  it('finds open sessions of the same day and sport', () => {
    const list = [s('a', '2026-10-22'), s('b', '2026-10-22', { sport: 'bike' }), s('c', '2026-10-23'), s('d', '2026-10-22'), s('r', '2026-10-22', { kind: 'race' })];
    expect(matchingSessions({ startedAt: day, sport: 'run' }, list, new Set(['d'])).map((x) => x.id)).toEqual(['a']);
  });
});

describe('importActivityWorkouts', () => {
  beforeEach(async () => {
    await db.workouts.clear();
  });
  it('adds new workouts and skips repeats and the same activity from another file', async () => {
    const a = activityToWorkout(act(), { useLaps: false });
    expect(await importActivityWorkouts([a])).toEqual({ added: 1, duplicates: 0 });
    expect(await importActivityWorkouts([a])).toEqual({ added: 0, duplicates: 1 });
    const gpx = activityToWorkout(act({ source: 'gpx', startedAt: act().startedAt + 20_000, distanceM: 10_040 }), { useLaps: false });
    expect(await importActivityWorkouts([gpx])).toEqual({ added: 0, duplicates: 1 });
    const other = activityToWorkout(act({ startedAt: act().startedAt + 86_400_000 }), { useLaps: false });
    expect(await importActivityWorkouts([other])).toEqual({ added: 1, duplicates: 0 });
    expect(await db.workouts.count()).toBe(2);
  });
  it('does not treat a hand-logged workout at the same time as duplicate', async () => {
    await db.workouts.put({ id: 'manual', name: 'x', startedAt: act().startedAt, finishedAt: act().startedAt + 1000, sport: 'run', exercises: [] });
    expect((await importActivityWorkouts([activityToWorkout(act(), { useLaps: false })])).added).toBe(1);
  });
});

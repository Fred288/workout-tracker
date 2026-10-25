import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './dexie';
import { createBackup, restoreBackup } from './backup';
import type { Exercise, Goal, Plan, PlannedSession, Workout } from './types';

const ex = (id: string, isCustom: boolean): Exercise => ({
  id,
  name: id,
  equipment: 'none',
  type: 'weight_reps',
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: [],
  images: [],
  isCustom,
});
const workout = (id: string, exerciseId: string, finished = true): Workout => ({
  id,
  name: id,
  startedAt: 1,
  finishedAt: finished ? 2 : undefined,
  exercises: [{ id: `${id}-e`, exerciseId, order: 0, sets: [{ id: `${id}-s`, type: 'normal', reps: 5, weightKg: 50, completed: true }] }],
});
const goal: Goal = { id: 'g1', type: 'marathon', targetDate: '2027-04-11', priority: 'A', createdAt: 1 };
const plan: Plan = {
  id: 'p1',
  goalId: 'g1',
  name: 'Marathon',
  startDate: '2026-12-21',
  level: 'beginner',
  availability: { 1: ['run'], 3: ['run'], 6: ['run'] },
  weeks: [{ index: 0, startDate: '2026-12-21', phase: 'base', isRecovery: false }],
  createdAt: 1,
};
const session: PlannedSession = {
  id: 's1',
  planId: 'p1',
  weekIndex: 0,
  date: '2026-12-22',
  sport: 'run',
  kind: 'intervals',
  steps: [{ repeat: 4, durationSec: 300, intensity: 'threshold', zone: 4 }],
};
const toFile = async () => new File([JSON.stringify(await createBackup())], 'b.json');

beforeEach(async () => {
  await Promise.all(
    [db.exercises, db.workouts, db.measurements, db.profile, db.templates, db.goals, db.plans, db.plannedSessions].map((t) => t.clear()),
  );
});

describe('backup export', () => {
  it('contains custom exercises and only the library exercises the data uses', async () => {
    await db.exercises.bulkPut([ex('mine', true), ex('used', false), ex('unused', false)]);
    await db.workouts.put(workout('w1', 'used'));
    const b = await createBackup();
    expect(b.data.customExercises.map((e) => e.id)).toEqual(['mine']);
    expect(b.data.referencedExercises?.map((e) => e.id)).toEqual(['used']);
  });

  it('leaves the running workout out', async () => {
    await db.workouts.bulkPut([workout('done', 'x'), workout('running', 'x', false)]);
    expect((await createBackup()).data.workouts.map((w) => w.id)).toEqual(['done']);
  });
});

describe('backup v3 (endurance)', () => {
  it('round-trips goals, plans and planned sessions incl. endurance set fields', async () => {
    await db.goals.put(goal);
    await db.plans.put(plan);
    await db.plannedSessions.put(session);
    const run: Workout = {
      ...workout('run', 'Running'),
      sport: 'run',
      plannedSessionId: 's1',
      exercises: [{ id: 'e', exerciseId: 'Running', order: 0, sets: [{ id: 's', type: 'normal', distanceM: 5000, durationSec: 1500, zone: 2, avgHr: 145, completed: true }] }],
    };
    await db.workouts.put(run);
    const file = await toFile();
    await Promise.all([db.goals.clear(), db.plans.clear(), db.plannedSessions.clear(), db.workouts.clear()]);

    const r = await restoreBackup(file, 'replace');
    expect(r).toMatchObject({ goals: 1, plans: 1, plannedSessions: 1, workouts: 1 });
    expect(await db.plannedSessions.get('s1')).toEqual(session);
    expect(await db.plans.get('p1')).toEqual(plan);
    expect(await db.workouts.where('plannedSessionId').equals('s1').first()).toEqual(run);
  });

  it("merge keeps this device's version of a plan", async () => {
    await db.plans.put(plan);
    const file = await toFile();
    await db.plans.put({ ...plan, name: 'edited here' });
    const r = await restoreBackup(file, 'merge');
    expect(r.plans).toBe(0);
    expect((await db.plans.get('p1'))?.name).toBe('edited here');
  });

  it('accepts v2 files without plan data; replace then leaves no plans', async () => {
    await db.plans.put(plan);
    const v2 = { format: 'workout-tracker-backup', version: 2, exportedAt: 0, data: { customExercises: [], referencedExercises: [], workouts: [workout('old', 'x')], templates: [], measurements: [], profile: [] } };
    const r = await restoreBackup(new File([JSON.stringify(v2)], 'v2.json'), 'replace');
    expect(r.plans).toBe(0);
    expect(await db.plans.count()).toBe(0);
    expect(await db.workouts.get('old')).toBeDefined();
  });

  it('rejects files whose plan data is not an array', async () => {
    const bad = { format: 'workout-tracker-backup', version: 3, exportedAt: 0, data: { customExercises: [], workouts: [], templates: [], measurements: [], profile: [], plans: {} } };
    await expect(restoreBackup(new File([JSON.stringify(bad)], 'x.json'))).rejects.toThrow();
  });
});

describe('backup import', () => {
  it('replace: afterwards this device has exactly the backup data', async () => {
    await db.workouts.put(workout('a', 'x'));
    await db.measurements.put({ id: 'm1', date: '2026-01-01', weightKg: 80 });
    const file = await toFile();
    await db.workouts.put(workout('only-here', 'x'));
    await db.measurements.put({ id: 'm2', date: '2026-02-01', weightKg: 79 });

    const r = await restoreBackup(file, 'replace');
    expect((await db.workouts.toArray()).map((w) => w.id)).toEqual(['a']);
    expect(await db.measurements.count()).toBe(1);
    expect(r.workouts).toBe(1);
  });

  it('merge: adds what is missing and keeps existing entries', async () => {
    await db.workouts.put({ ...workout('shared', 'x'), name: 'from backup' });
    await db.workouts.put(workout('from-other-device', 'x'));
    const file = await toFile();
    await db.workouts.clear();
    await db.workouts.put({ ...workout('shared', 'x'), name: 'edited here' });
    await db.workouts.put(workout('only-here', 'x'));

    const r = await restoreBackup(file, 'merge');
    const all = await db.workouts.toArray();
    expect(all.map((w) => w.id).sort()).toEqual(['from-other-device', 'only-here', 'shared']);
    expect(all.find((w) => w.id === 'shared')?.name).toBe('edited here');
    expect(r.workouts).toBe(1);
  });

  it('never touches the running workout on this device', async () => {
    await db.workouts.put(workout('a', 'x'));
    const file = await toFile();
    await db.workouts.put(workout('running', 'x', false));
    await restoreBackup(file, 'replace');
    expect(await db.workouts.get('running')).toBeDefined();
  });

  it('restores library exercises the data needs when this device lacks them', async () => {
    await db.exercises.bulkPut([ex('mine', true), ex('Tire_Flip', false)]);
    await db.workouts.put(workout('w', 'Tire_Flip'));
    const file = await toFile();
    await db.exercises.clear();
    await db.workouts.clear();
    await db.exercises.put({ ...ex('Barbell_Squat', false) });

    await restoreBackup(file, 'replace');
    expect(await db.exercises.get('Tire_Flip')).toBeDefined();
    expect(await db.exercises.get('mine')).toBeDefined();
    expect(await db.exercises.get('Barbell_Squat')).toBeDefined(); // library stays
  });

  it('accepts version-1 files without referencedExercises', async () => {
    const v1 = { format: 'workout-tracker-backup', version: 1, exportedAt: 0, data: { customExercises: [], workouts: [workout('old', 'x')], templates: [], measurements: [], profile: [] } };
    await restoreBackup(new File([JSON.stringify(v1)], 'v1.json'), 'merge');
    expect(await db.workouts.get('old')).toBeDefined();
  });

  it('rejects invalid files and keeps data', async () => {
    await db.measurements.put({ id: 'm1', date: '2026-01-01', weightKg: 80 });
    await expect(restoreBackup(new File(['nope'], 'x.json'))).rejects.toThrow();
    await expect(restoreBackup(new File(['{"a":1}'], 'x.json'))).rejects.toThrow();
    expect(await db.measurements.count()).toBe(1);
  });
});

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, describe, expect, it } from 'vitest';
import { DB_NAME, SCHEMA_V1, db } from './dexie';

describe('dexie migration v1 -> v2', () => {
  afterAll(() => db.close());

  it('keeps existing data and adds the endurance tables', async () => {
    db.close();
    await Dexie.delete(DB_NAME);
    const old = new Dexie(DB_NAME);
    old.version(1).stores(SCHEMA_V1);
    await old.table('workouts').put({ id: 'w1', name: 'Push', startedAt: 1, finishedAt: 2, exercises: [] });
    await old.table('exercises').put({ id: 'Running', name: 'Running', type: 'distance_duration', isCustom: false, primaryMuscles: [] });
    await old.table('profile').put({ id: 'me', name: 'A', unit: 'kg', workoutsPerWeekGoal: 3 });
    old.close();

    await db.open();
    expect(db.verno).toBe(2);
    expect((await db.workouts.get('w1'))?.name).toBe('Push');
    expect((await db.profile.get('me'))?.name).toBe('A');
    expect(await db.goals.count()).toBe(0);

    await db.workouts.update('w1', { plannedSessionId: 's1' });
    expect((await db.workouts.where('plannedSessionId').equals('s1').toArray()).map((w) => w.id)).toEqual(['w1']);
    await db.exercises.update('Running', { sport: 'run' });
    expect(await db.exercises.where('sport').equals('run').count()).toBe(1);
    await db.plannedSessions.put({ id: 's1', planId: 'p1', weekIndex: 0, date: '2026-12-22', sport: 'run', kind: 'easy' });
    expect(await db.plannedSessions.where('date').between('2026-12-21', '2026-12-27', true, true).count()).toBe(1);
  });
});

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './dexie';
import { ensureSeeded } from './seed';
import type { Exercise } from './types';

const ex = (id: string, isCustom = false): Exercise => ({
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

beforeEach(async () => {
  await Promise.all([db.exercises.clear(), db.meta.clear(), db.workouts.clear(), db.templates.clear()]);
});

describe('ensureSeeded', () => {
  it('removes dropped seed exercises unless used, keeps custom ones', async () => {
    await db.exercises.bulkPut([ex('Tire_Flip'), ex('Log_Lift'), ex('mine', true)]);
    await db.workouts.put({
      id: 'w',
      name: 'w',
      startedAt: 0,
      finishedAt: 1,
      exercises: [{ id: 'e', exerciseId: 'Log_Lift', order: 0, sets: [] }],
    });
    await ensureSeeded();
    expect(await db.exercises.get('Tire_Flip')).toBeUndefined();
    expect(await db.exercises.get('Log_Lift')).toBeDefined(); // still referenced
    expect(await db.exercises.get('mine')).toBeDefined();
    expect(await db.exercises.get('Barbell_Squat')).toBeDefined();
  });

  it('does nothing when the version is current', async () => {
    await ensureSeeded();
    await db.exercises.put(ex('Tire_Flip'));
    await ensureSeeded();
    expect(await db.exercises.get('Tire_Flip')).toBeDefined();
  });
});

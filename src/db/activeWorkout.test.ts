import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './dexie';
import { discardActive, finishActive, getActiveWorkout, mutateActive, startWorkout } from './activeWorkout';
import { addExercises, createWorkout, updateSet } from '../lib/workout';

beforeEach(async () => {
  await Promise.all([db.workouts.clear(), db.meta.clear()]);
});

describe('active workout persistence', () => {
  it('allows only one active workout', async () => {
    await startWorkout(createWorkout(0));
    await expect(startWorkout(createWorkout(1))).rejects.toThrow();
  });

  it('persists every mutation immediately', async () => {
    await startWorkout(createWorkout(0));
    await mutateActive((w) => addExercises(w, ['bench']));
    const w = await getActiveWorkout();
    expect(w?.exercises[0].exerciseId).toBe('bench');
  });

  it('finish keeps only completed sets and clears the active pointer and old rest-timer data', async () => {
    await startWorkout(createWorkout(0));
    await mutateActive((w) => addExercises(w, ['bench', 'squat']));
    await mutateActive((w) => {
      const e = w.exercises[0];
      return updateSet(w, e.id, e.sets[0].id, { reps: 5, weightKg: 100, completed: true });
    });
    await db.meta.put({ key: 'restTimer', value: '{}' }); // stored by older app versions
    const done = await finishActive(10_000);
    expect(done?.finishedAt).toBe(10_000);
    expect(done?.exercises).toHaveLength(1);
    expect(await getActiveWorkout()).toBeUndefined();
    expect(await db.meta.get('restTimer')).toBeUndefined();
    expect(await db.workouts.get(done!.id)).toBeDefined();
  });

  it('discard deletes the workout', async () => {
    const w = createWorkout(0);
    await startWorkout(w);
    await discardActive();
    expect(await db.workouts.get(w.id)).toBeUndefined();
    expect(await getActiveWorkout()).toBeUndefined();
  });
});

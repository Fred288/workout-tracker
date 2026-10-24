import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './dexie';
import {
  adjustRest,
  discardActive,
  finishActive,
  getActiveWorkout,
  mutateActive,
  startRest,
  startWorkout,
} from './activeWorkout';
import { addExercises, createWorkout, updateSet } from '../lib/workout';

beforeEach(async () => {
  await Promise.all([db.workouts.clear(), db.meta.clear()]);
});

const restTimer = async () => {
  const m = await db.meta.get('restTimer');
  return m ? JSON.parse(m.value) : undefined;
};

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

  it('finish keeps only completed sets and clears the active pointer and rest timer', async () => {
    await startWorkout(createWorkout(0));
    await mutateActive((w) => addExercises(w, ['bench', 'squat']));
    await mutateActive((w) => {
      const e = w.exercises[0];
      return updateSet(w, e.id, e.sets[0].id, { reps: 5, weightKg: 100, completed: true });
    });
    await startRest(90, 'x', 0);
    const done = await finishActive(10_000);
    expect(done?.finishedAt).toBe(10_000);
    expect(done?.exercises).toHaveLength(1);
    expect(await getActiveWorkout()).toBeUndefined();
    expect(await restTimer()).toBeUndefined();
    expect(await db.workouts.get(done!.id)).toBeDefined();
  });

  it('discard deletes the workout', async () => {
    const w = createWorkout(0);
    await startWorkout(w);
    await discardActive();
    expect(await db.workouts.get(w.id)).toBeUndefined();
    expect(await getActiveWorkout()).toBeUndefined();
  });

  it('rest timer is timestamp based and can be adjusted', async () => {
    await startRest(90, 'e1', 1_000);
    expect(await restTimer()).toMatchObject({ endsAt: 91_000, durationSec: 90 });
    await adjustRest(15, 2_000);
    expect(await restTimer()).toMatchObject({ endsAt: 106_000, durationSec: 105 });
    await adjustRest(-500, 2_000); // never ends in the past
    expect((await restTimer()).endsAt).toBe(2_000);
  });
});

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './dexie';
import type { Workout } from './types';
import { finalizeWorkout } from '../lib/workout';

// The active workout lives in the workouts table (finishedAt undefined); its id is kept in
// meta. Every change goes through mutateActive, so the stored copy is always current and
// nothing is lost when iOS kills the app in the background.

const ACTIVE_KEY = 'activeWorkoutId';
// Left over from the removed rest timer; deleted whenever a workout ends.
const LEGACY_REST_KEY = 'restTimer';

export async function getActiveWorkout(): Promise<Workout | undefined> {
  const m = await db.meta.get(ACTIVE_KEY);
  return m ? db.workouts.get(m.value) : undefined;
}

/** undefined while loading, null when no workout is running. */
export function useActiveWorkout(): Workout | null | undefined {
  return useLiveQuery(async () => (await getActiveWorkout()) ?? null, []);
}

export async function startWorkout(w: Workout): Promise<void> {
  await db.transaction('rw', db.workouts, db.meta, async () => {
    if (await getActiveWorkout()) throw new Error('Es läuft bereits ein Workout.');
    await db.workouts.add(w);
    await db.meta.put({ key: ACTIVE_KEY, value: w.id });
  });
}

/** Applies a pure update to the active workout inside one transaction. */
export async function mutateActive(fn: (w: Workout) => Workout): Promise<void> {
  await db.transaction('rw', db.workouts, db.meta, async () => {
    const w = await getActiveWorkout();
    if (w) await db.workouts.put(fn(w));
  });
}

/** Stores the finished workout (only completed sets) and returns it. */
export async function finishActive(now = Date.now()): Promise<Workout | undefined> {
  return db.transaction('rw', db.workouts, db.meta, async () => {
    const w = await getActiveWorkout();
    if (!w) return undefined;
    const done = finalizeWorkout(w, now);
    await db.workouts.put(done);
    await db.meta.bulkDelete([ACTIVE_KEY, LEGACY_REST_KEY]);
    return done;
  });
}

export async function discardActive(): Promise<void> {
  await db.transaction('rw', db.workouts, db.meta, async () => {
    const m = await db.meta.get(ACTIVE_KEY);
    if (m) await db.workouts.delete(m.value);
    await db.meta.bulkDelete([ACTIVE_KEY, LEGACY_REST_KEY]);
  });
}

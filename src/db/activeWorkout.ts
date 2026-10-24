import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './dexie';
import type { Workout } from './types';
import { finalizeWorkout } from '../lib/workout';

// The active workout lives in the workouts table (finishedAt undefined); its id is kept in
// meta. Every change goes through mutateActive, so the stored copy is always current and
// nothing is lost when iOS kills the app in the background.

const ACTIVE_KEY = 'activeWorkoutId';
const REST_KEY = 'restTimer';

export interface RestTimer {
  endsAt: number; // epoch ms; remaining time is always derived from this
  durationSec: number;
  workoutExerciseId: string;
}

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
    await db.meta.bulkDelete([ACTIVE_KEY, REST_KEY]);
    return done;
  });
}

export async function discardActive(): Promise<void> {
  await db.transaction('rw', db.workouts, db.meta, async () => {
    const m = await db.meta.get(ACTIVE_KEY);
    if (m) await db.workouts.delete(m.value);
    await db.meta.bulkDelete([ACTIVE_KEY, REST_KEY]);
  });
}

export async function startRest(durationSec: number, workoutExerciseId: string, now = Date.now()) {
  const t: RestTimer = { endsAt: now + durationSec * 1000, durationSec, workoutExerciseId };
  await db.meta.put({ key: REST_KEY, value: JSON.stringify(t) });
}

export async function adjustRest(deltaSec: number, now = Date.now()) {
  await db.transaction('rw', db.meta, async () => {
    const m = await db.meta.get(REST_KEY);
    if (!m) return;
    const t = JSON.parse(m.value) as RestTimer;
    const endsAt = Math.max(now, t.endsAt + deltaSec * 1000);
    const next: RestTimer = { ...t, endsAt, durationSec: Math.max(0, t.durationSec + deltaSec) };
    await db.meta.put({ key: REST_KEY, value: JSON.stringify(next) });
  });
}

export async function clearRest() {
  await db.meta.delete(REST_KEY);
}

export function useRestTimer(): RestTimer | null | undefined {
  return useLiveQuery(
    () => db.meta.get(REST_KEY).then((m) => (m ? (JSON.parse(m.value) as RestTimer) : null)),
    [],
  );
}

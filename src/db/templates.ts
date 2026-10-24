import { db } from './dexie';
import type { Workout } from './types';
import { templateFromWorkout } from '../lib/workout';

/** Saves a workout as template and returns its id. */
export async function saveWorkoutAsTemplate(w: Workout, name: string): Promise<string> {
  const t = templateFromWorkout(w, name);
  await db.templates.add(t);
  return t.id;
}

export async function renameTemplate(id: string, name: string): Promise<void> {
  const n = name.trim();
  if (n) await db.templates.update(id, { name: n });
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.templates.delete(id);
}

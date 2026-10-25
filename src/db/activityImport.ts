import { db } from './dexie';
import type { Workout } from './types';

/** An imported workout whose start is this close to the new one is the same activity from another file. */
const DUPLICATE_WINDOW_MS = 2 * 60_000;

export interface ImportResult {
  added: number;
  /** Already in the app (same file again or the same activity from another format). */
  duplicates: number;
}

/** Adds the workouts that are not in the app yet. Safe to repeat. */
export async function importActivityWorkouts(workouts: Workout[]): Promise<ImportResult> {
  return db.transaction('rw', db.workouts, async () => {
    let added = 0;
    let duplicates = 0;
    for (const w of workouts) {
      const sameId = await db.workouts.get(w.id);
      const near = await db.workouts
        .where('startedAt')
        .between(w.startedAt - DUPLICATE_WINDOW_MS, w.startedAt + DUPLICATE_WINDOW_MS, true, true)
        .filter((x) => x.id.startsWith('import-') && x.sport === w.sport)
        .first();
      if (sameId || near) {
        duplicates++;
        continue;
      }
      await db.workouts.add(w);
      added++;
    }
    return { added, duplicates };
  });
}

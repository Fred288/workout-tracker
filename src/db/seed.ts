import { db } from './dexie';
import type { Exercise } from './types';
import seedVersion from '../data/exercises.seed.version.json';

const SEED_VERSION_KEY = 'exerciseSeedVersion';

interface SeedFile {
  version: string;
  exercises: Exercise[];
}

/**
 * Imports the bundled exercise library into Dexie when it is missing or outdated.
 * Seed exercises that were dropped from the library are removed unless a workout or
 * template still uses them. Custom exercises are never touched.
 */
export async function ensureSeeded(): Promise<void> {
  const current = await db.meta.get(SEED_VERSION_KEY);
  if (current?.value === seedVersion.version) return;

  // Only now load the large seed chunk.
  const { default: seed } = (await import('../data/exercises.seed.json')) as unknown as {
    default: SeedFile;
  };
  await db.transaction('rw', [db.exercises, db.meta, db.workouts, db.templates], async () => {
    const keep = new Set(seed.exercises.map((e) => e.id));
    const stale = (await db.exercises.filter((e) => !e.isCustom && !keep.has(e.id)).primaryKeys()) as string[];
    if (stale.length) {
      const used = new Set<string>();
      await db.workouts.each((w) => w.exercises.forEach((e) => used.add(e.exerciseId)));
      await db.templates.each((t) => t.exercises.forEach((e) => used.add(e.exerciseId)));
      await db.exercises.bulkDelete(stale.filter((id) => !used.has(id)));
    }
    await db.exercises.bulkPut(seed.exercises);
    await db.meta.put({ key: SEED_VERSION_KEY, value: seed.version });
  });
}

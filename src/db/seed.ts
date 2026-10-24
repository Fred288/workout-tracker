import { db } from './dexie';
import type { Exercise } from './types';

const SEED_VERSION_KEY = 'exerciseSeedVersion';

interface SeedFile {
  version: string;
  exercises: Exercise[];
}

/** Imports the bundled exercise library into Dexie when it is missing or outdated. Custom exercises are never touched. */
export async function ensureSeeded(): Promise<void> {
  const { default: seed } = (await import('../data/exercises.seed.json')) as unknown as {
    default: SeedFile;
  };
  const current = await db.meta.get(SEED_VERSION_KEY);
  if (current?.value === seed.version) return;

  await db.transaction('rw', db.exercises, db.meta, async () => {
    await db.exercises.bulkPut(seed.exercises);
    await db.meta.put({ key: SEED_VERSION_KEY, value: seed.version });
  });
}

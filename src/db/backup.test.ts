import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './dexie';
import { createBackup, restoreBackup } from './backup';

const custom = {
  id: 'c1',
  name: 'Custom',
  equipment: 'none' as const,
  type: 'weight_reps' as const,
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: [],
  images: [],
  isCustom: true,
};
const seeded = { ...custom, id: 's1', isCustom: false };

beforeEach(async () => {
  await Promise.all([
    db.exercises.clear(),
    db.workouts.clear(),
    db.measurements.clear(),
    db.profile.clear(),
    db.templates.clear(),
  ]);
});

describe('backup', () => {
  it('exports only custom exercises and restores user data', async () => {
    await db.exercises.bulkPut([custom, seeded]);
    await db.measurements.put({ id: 'm1', date: '2026-01-01', weightKg: 80 });
    const backup = await createBackup();
    expect(backup.data.customExercises).toHaveLength(1);

    await db.exercises.clear();
    await db.measurements.clear();
    const file = new File([JSON.stringify(backup)], 'b.json');
    await restoreBackup(file);

    expect(await db.exercises.get('c1')).toBeDefined();
    expect(await db.exercises.get('s1')).toBeUndefined();
    expect(await db.measurements.count()).toBe(1);
  });

  it('rejects invalid files and keeps data', async () => {
    await db.measurements.put({ id: 'm1', date: '2026-01-01', weightKg: 80 });
    await expect(restoreBackup(new File(['nope'], 'x.json'))).rejects.toThrow();
    await expect(restoreBackup(new File(['{"a":1}'], 'x.json'))).rejects.toThrow();
    expect(await db.measurements.count()).toBe(1);
  });
});

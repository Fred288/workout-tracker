import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './dexie';
import { deleteMeasurement, saveMeasurement, saveProfile } from './profile';

beforeEach(async () => {
  await Promise.all([db.measurements.clear(), db.profile.clear()]);
});

describe('measurements', () => {
  it('keeps one entry per day', async () => {
    await saveMeasurement('2026-10-24', 80);
    await saveMeasurement('2026-10-24', 79.5);
    const all = await db.measurements.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ date: '2026-10-24', weightKg: 79.5 });
  });

  it('editing may move an entry to another date', async () => {
    await saveMeasurement('2026-10-20', 81);
    const id = (await db.measurements.toArray())[0].id;
    await saveMeasurement('2026-10-22', 80.5, id);
    expect((await db.measurements.toArray()).map((m) => [m.id, m.date])).toEqual([[id, '2026-10-22']]);
  });

  it('moving onto an occupied day merges into that day', async () => {
    await saveMeasurement('2026-10-20', 81);
    await saveMeasurement('2026-10-22', 80);
    const first = (await db.measurements.where('date').equals('2026-10-20').first())!;
    await saveMeasurement('2026-10-22', 79, first.id);
    const all = await db.measurements.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ date: '2026-10-22', weightKg: 79 });
  });

  it('deletes', async () => {
    await saveMeasurement('2026-10-20', 81);
    await deleteMeasurement((await db.measurements.toArray())[0].id);
    expect(await db.measurements.count()).toBe(0);
  });
});

describe('profile', () => {
  it('starts from defaults and merges patches', async () => {
    await saveProfile({ name: 'Fred' });
    await saveProfile({ targetWeightKg: 78, workoutsPerWeekGoal: 4 });
    expect(await db.profile.get('me')).toMatchObject({
      id: 'me',
      name: 'Fred',
      unit: 'kg',
      targetWeightKg: 78,
      workoutsPerWeekGoal: 4,
    });
  });
});

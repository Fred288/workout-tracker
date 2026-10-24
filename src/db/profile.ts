import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './dexie';
import { DEFAULT_PROFILE, type BodyMeasurement, type Profile } from './types';
import { newId } from '../lib/id';

/** The profile with defaults applied; undefined while loading. */
export function useProfile(): Profile | undefined {
  return useLiveQuery(async () => (await db.profile.get('me')) ?? DEFAULT_PROFILE, []);
}

export async function saveProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<void> {
  const current = (await db.profile.get('me')) ?? DEFAULT_PROFILE;
  await db.profile.put({ ...current, ...patch, id: 'me' });
}

export function useMeasurements(): BodyMeasurement[] | undefined {
  return useLiveQuery(() => db.measurements.toArray(), []);
}

/** One entry per day: saving for a date that already has one replaces its value. */
export async function saveMeasurement(date: string, weightKg: number, replaceId?: string): Promise<void> {
  await db.transaction('rw', db.measurements, async () => {
    const edited = replaceId ? await db.measurements.get(replaceId) : undefined;
    const sameDay = await db.measurements.where('date').equals(date).toArray();
    const others = sameDay.filter((m) => m.id !== edited?.id);
    // The edited entry keeps its id unless another entry already holds the target day.
    const keep = edited && !others.length ? edited : (others[0] ?? edited);
    if (keep) {
      await db.measurements.put({ ...keep, date, weightKg });
      const drop = [...others, ...(edited ? [edited] : [])].filter((m) => m.id !== keep.id);
      await db.measurements.bulkDelete(drop.map((m) => m.id));
    } else {
      await db.measurements.add({ id: newId(), date, weightKg });
    }
  });
}

export async function deleteMeasurement(id: string): Promise<void> {
  await db.measurements.delete(id);
}

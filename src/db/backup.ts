import { db } from './dexie';
import type { BodyMeasurement, Exercise, Goal, Plan, PlannedSession, Profile, Template, Workout } from './types';

// Full export of the personal data, used as backup and to move the state between devices by hand.

const BACKUP_FORMAT = 'workout-tracker-backup';
const BACKUP_VERSION = 3; // v2 adds referencedExercises, v3 goals/plans/plannedSessions
export const LAST_BACKUP_KEY = 'lastBackupAt';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  data: {
    customExercises: Exercise[];
    /** Library exercises used by workouts/templates, so data survives a smaller library on the other device. */
    referencedExercises?: Exercise[];
    workouts: Workout[];
    templates: Template[];
    measurements: BodyMeasurement[];
    profile: Profile[];
    goals?: Goal[];
    plans?: Plan[];
    plannedSessions?: PlannedSession[];
  };
}

export type RestoreMode = 'replace' | 'merge';

export interface RestoreResult {
  workouts: number;
  templates: number;
  measurements: number;
  customExercises: number;
  goals: number;
  plans: number;
  plannedSessions: number;
}

/**
 * Builds the backup. Library exercises are not included (the app ships them) except those the
 * data refers to. The running workout stays on this device.
 */
export async function createBackup(): Promise<BackupFile> {
  const [customExercises, allWorkouts, templates, measurements, profile, goals, plans, plannedSessions] =
    await Promise.all([
      db.exercises.filter((e) => e.isCustom).toArray(),
      db.workouts.toArray(),
      db.templates.toArray(),
      db.measurements.toArray(),
      db.profile.toArray(),
      db.goals.toArray(),
      db.plans.toArray(),
      db.plannedSessions.toArray(),
    ]);
  const workouts = allWorkouts.filter((w) => !!w.finishedAt);
  const used = new Set([...workouts, ...templates].flatMap((x) => x.exercises.map((e) => e.exerciseId)));
  const referencedExercises = (await db.exercises.bulkGet([...used])).filter(
    (e): e is Exercise => !!e && !e.isCustom,
  );
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    data: { customExercises, referencedExercises, workouts, templates, measurements, profile, goals, plans, plannedSessions },
  };
}

export function backupFileName(at = new Date()): string {
  return `workout-tracker-${at.toISOString().slice(0, 10)}.backup.json`;
}

/**
 * Exports via the share sheet where available (iPhone: AirDrop, "In Dateien sichern"), else as
 * download. Returns false if the user cancelled.
 */
export async function exportBackup(): Promise<boolean> {
  const backup = await createBackup();
  const json = JSON.stringify(backup, null, 2);
  const file = new File([json], backupFileName(), { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Workout-Tracker Backup' });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      download(file);
    }
  } else {
    download(file);
  }
  await db.meta.put({ key: LAST_BACKUP_KEY, value: String(backup.exportedAt) });
  return true;
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isBackup(x: unknown): x is BackupFile {
  const b = x as BackupFile;
  return (
    !!b &&
    b.format === BACKUP_FORMAT &&
    typeof b.version === 'number' &&
    !!b.data &&
    ['customExercises', 'workouts', 'templates', 'measurements', 'profile'].every((k) =>
      Array.isArray((b.data as Record<string, unknown>)[k]),
    ) &&
    ['goals', 'plans', 'plannedSessions'].every((k) => {
      const v = (b.data as Record<string, unknown>)[k];
      return v === undefined || Array.isArray(v);
    })
  );
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (!isBackup(parsed)) throw new Error('Das ist keine Backup-Datei dieser App.');
  if (parsed.version > BACKUP_VERSION) throw new Error('Backup stammt von einer neueren App-Version.');
  return parsed;
}

/**
 * replace: this device afterwards holds exactly the backup's data.
 * merge:   entries missing here are added; entries that exist on both keep this device's version.
 * The running workout on this device is never touched.
 */
export async function restoreBackup(file: File, mode: RestoreMode = 'replace'): Promise<RestoreResult> {
  const { data: d } = await readBackupFile(file);
  const incomingWorkouts = d.workouts.filter((w) => !!w.finishedAt);
  const tables = [db.exercises, db.workouts, db.templates, db.measurements, db.profile, db.goals, db.plans, db.plannedSessions];
  return db.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      await db.exercises.filter((e) => e.isCustom).delete();
      await db.workouts.filter((w) => !!w.finishedAt).delete();
      await Promise.all(
        [db.templates, db.measurements, db.profile, db.goals, db.plans, db.plannedSessions].map((t) => t.clear()),
      );
    }
    // Library exercises the data needs: only add what this device lacks.
    const refs = d.referencedExercises ?? [];
    const haveRefs = new Set((await db.exercises.bulkGet(refs.map((e) => e.id))).filter((e) => !!e).map((e) => e!.id));
    await db.exercises.bulkAdd(refs.filter((e) => !haveRefs.has(e.id)));

    const addMissing = async <T extends { id: string }>(
      table: { bulkGet: (ids: string[]) => Promise<(T | undefined)[]>; bulkAdd: (items: T[]) => Promise<unknown> },
      items: T[],
    ) => {
      const have = new Set((await table.bulkGet(items.map((i) => i.id))).filter((x) => !!x).map((x) => x!.id));
      const fresh = items.filter((i) => !have.has(i.id));
      await table.bulkAdd(fresh);
      return fresh.length;
    };

    const result: RestoreResult = {
      customExercises: await addMissing(db.exercises, d.customExercises),
      workouts: await addMissing(db.workouts, incomingWorkouts),
      templates: await addMissing(db.templates, d.templates),
      measurements: await addMissing(db.measurements, d.measurements),
      // Missing before v3.
      goals: await addMissing(db.goals, d.goals ?? []),
      plans: await addMissing(db.plans, d.plans ?? []),
      plannedSessions: await addMissing(db.plannedSessions, d.plannedSessions ?? []),
    };
    // Single profile row ('me'): keep this device's profile when one exists.
    if (d.profile[0] && !(await db.profile.get('me'))) await db.profile.put({ ...d.profile[0], id: 'me' });
    return result;
  });
}

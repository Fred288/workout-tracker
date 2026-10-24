import { db } from './dexie';

const BACKUP_FORMAT = 'workout-tracker-backup';
const BACKUP_VERSION = 1;
export const LAST_BACKUP_KEY = 'lastBackupAt';

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  data: {
    customExercises: unknown[];
    workouts: unknown[];
    templates: unknown[];
    measurements: unknown[];
    profile: unknown[];
  };
}

/** Builds the backup object. Seed exercises are excluded, they are re-imported from the bundle. */
export async function createBackup(): Promise<BackupFile> {
  const [customExercises, workouts, templates, measurements, profile] = await Promise.all([
    db.exercises.filter((e) => e.isCustom).toArray(),
    db.workouts.toArray(),
    db.templates.toArray(),
    db.measurements.toArray(),
    db.profile.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    data: { customExercises, workouts, templates, measurements, profile },
  };
}

export async function downloadBackup(): Promise<void> {
  const backup = await createBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workout-tracker-${new Date().toISOString().slice(0, 10)}.backup.json`;
  a.click();
  URL.revokeObjectURL(url);
  await db.meta.put({ key: LAST_BACKUP_KEY, value: String(backup.exportedAt) });
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
    )
  );
}

/** Replaces all user data with the content of a backup file. Throws on an invalid file. */
export async function restoreBackup(file: File): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (!isBackup(parsed)) throw new Error('Das ist keine Backup-Datei dieser App.');
  if (parsed.version > BACKUP_VERSION) throw new Error('Backup stammt von einer neueren App-Version.');

  const d = parsed.data;
  await db.transaction(
    'rw',
    [db.exercises, db.workouts, db.templates, db.measurements, db.profile],
    async () => {
      await db.exercises.filter((e) => e.isCustom).delete();
      await Promise.all([
        db.workouts.clear(),
        db.templates.clear(),
        db.measurements.clear(),
        db.profile.clear(),
      ]);
      await db.exercises.bulkPut(d.customExercises as never[]);
      await db.workouts.bulkPut(d.workouts as never[]);
      await db.templates.bulkPut(d.templates as never[]);
      await db.measurements.bulkPut(d.measurements as never[]);
      await db.profile.bulkPut(d.profile as never[]);
    },
  );
}

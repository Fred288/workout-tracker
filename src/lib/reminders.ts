import type { Workout } from '../db/types';

const DAY = 86_400_000;
export const BACKUP_AFTER_DAYS = 14;
export const SNOOZE_DAYS = 7;

export interface BackupReminder {
  /** Finished workouts that are not part of the last export (all of them if there was none). */
  newWorkouts: number;
  /** Days since the last export, undefined if never exported. */
  daysSinceExport?: number;
}

/**
 * Reminds to export when there is data that no export contains yet and the last export (or, if
 * there never was one, the oldest unsaved workout) is at least 14 days old. Snoozing hides the
 * reminder for a week. Returns undefined when nothing is due.
 */
export function backupReminder(
  workouts: Workout[],
  lastExportAt: number | undefined,
  snoozedUntil: number | undefined,
  now: number,
): BackupReminder | undefined {
  if (snoozedUntil !== undefined && now < snoozedUntil) return undefined;
  const unsaved = workouts.filter((w) => w.finishedAt && (lastExportAt === undefined || w.finishedAt > lastExportAt));
  if (!unsaved.length) return undefined;
  const reference = lastExportAt ?? Math.min(...unsaved.map((w) => w.finishedAt!));
  if (now - reference < BACKUP_AFTER_DAYS * DAY) return undefined;
  return {
    newWorkouts: unsaved.length,
    daysSinceExport: lastExportAt === undefined ? undefined : Math.floor((now - lastExportAt) / DAY),
  };
}

export const snoozeUntil = (now: number) => now + SNOOZE_DAYS * DAY;

/** True on iPhone/iPad Safari (also iPadOS posing as a Mac) when the app is not installed. */
export function shouldShowInstallHint(env: {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
}): boolean {
  const iosDevice = /iPhone|iPad|iPod/.test(env.userAgent) || (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
  return iosDevice && !env.standalone;
}

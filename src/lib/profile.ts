import type { BodyMeasurement, Workout } from '../db/types';

/** Local date as YYYY-MM-DD (what <input type="date"> and BodyMeasurement.date use). */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local midnight of a YYYY-MM-DD key, as epoch ms. */
export function dateKeyToMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Monday 00:00 (local) of the week containing `ms`. */
export function startOfWeek(ms: number): number {
  const d = new Date(ms);
  const dayFromMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayFromMonday).getTime();
}

export interface WeekCount {
  weekStart: number;
  count: number;
}

/** Finished workouts per calendar week for the last `weeks` weeks (including the current one), oldest first. */
export function weeklyWorkoutCounts(workouts: Workout[], now: number, weeks = 12): WeekCount[] {
  const current = startOfWeek(now);
  const starts = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(current);
    d.setDate(d.getDate() - 7 * (weeks - 1 - i));
    return d.getTime();
  });
  const counts = new Map(starts.map((s) => [s, 0]));
  for (const w of workouts) {
    if (!w.finishedAt) continue;
    const s = startOfWeek(w.startedAt);
    if (counts.has(s)) counts.set(s, counts.get(s)! + 1);
  }
  return starts.map((weekStart) => ({ weekStart, count: counts.get(weekStart)! }));
}

/** Measurements sorted oldest first. */
export function sortedMeasurements(list: BodyMeasurement[]): BodyMeasurement[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

/** Measurements of the last `days` days (all when days is 0), oldest first. */
export function measurementsInRange(list: BodyMeasurement[], days: number, now: number): BodyMeasurement[] {
  const sorted = sortedMeasurements(list);
  if (!days) return sorted;
  const from = toDateKey(new Date(now - days * 86_400_000));
  return sorted.filter((m) => m.date >= from);
}

export interface WeightSummary {
  latest: BodyMeasurement;
  /** Change versus the previous measurement in kg, undefined for the first one. */
  changeKg?: number;
  /** Positive when the target is above the current weight. */
  toTargetKg?: number;
}

export function weightSummary(list: BodyMeasurement[], targetKg?: number): WeightSummary | undefined {
  const sorted = sortedMeasurements(list);
  const latest = sorted.at(-1);
  if (!latest) return undefined;
  const prev = sorted.at(-2);
  return {
    latest,
    changeKg: prev ? latest.weightKg - prev.weightKg : undefined,
    toTargetKg: targetKg !== undefined ? targetKg - latest.weightKg : undefined,
  };
}

/** Streak of consecutive weeks (ending with the current or previous one) that reached the goal. */
export function goalStreak(weeks: WeekCount[], goal: number): number {
  if (goal <= 0) return 0;
  let i = weeks.length - 1;
  // The running week may still be open: only count it if it already reached the goal.
  if (weeks[i] && weeks[i].count < goal) i--;
  let n = 0;
  for (; i >= 0 && weeks[i].count >= goal; i--) n++;
  return n;
}

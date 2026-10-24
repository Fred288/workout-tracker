import type { Workout } from '../db/types';

export interface MonthGroup {
  key: string; // YYYY-MM
  label: string; // "Oktober 2026"
  workouts: Workout[];
}

/** Finished workouts, newest first, grouped by calendar month (local time). */
export function groupByMonth(workouts: Workout[]): MonthGroup[] {
  const finished = workouts.filter((w) => w.finishedAt).sort((a, b) => b.startedAt - a.startedAt);
  const groups: MonthGroup[] = [];
  for (const w of finished) {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      g = { key, label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), workouts: [] };
      groups.push(g);
    }
    g.workouts.push(w);
  }
  return groups;
}

/** Value for an <input type="datetime-local"> in local time. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): number | undefined {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

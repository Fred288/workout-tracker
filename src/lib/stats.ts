import type { Workout, WorkoutSet } from '../db/types';
import { elapsedMs } from './runClock';

// Statistics are always derived from sets, never stored (see CLAUDE.md).
// Phase 6 extends this file with records and 1RM.

/** Only completed working sets count; warm-ups never do. */
export function isCountingSet(s: WorkoutSet): boolean {
  return s.completed && s.type !== 'warmup';
}

/** Volume of one set in kg (weight × reps). Sets without weight contribute 0. */
export function setVolume(s: WorkoutSet): number {
  return isCountingSet(s) && s.weightKg && s.reps ? s.weightKg * s.reps : 0;
}

export function workoutVolume(w: Workout): number {
  return w.exercises.reduce((sum, e) => sum + e.sets.reduce((s, set) => s + setVolume(set), 0), 0);
}

/**
 * Best working set for list previews: highest volume, then weight, then reps, then
 * duration. Falls back to the first set if no counting set exists.
 */
export function bestSet(sets: WorkoutSet[]): WorkoutSet | undefined {
  const counting = sets.filter(isCountingSet);
  const pool = counting.length ? counting : sets;
  return pool.reduce<WorkoutSet | undefined>((best, s) => {
    if (!best) return s;
    const key = (x: WorkoutSet) => [setVolume(x), x.weightKg ?? 0, x.reps ?? 0, x.durationSec ?? 0, x.distanceM ?? 0];
    const a = key(s);
    const b = key(best);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? s : best;
    return best;
  }, undefined);
}

export function workoutDurationMs(w: Workout, now = Date.now()): number {
  return Math.max(0, elapsedMs(w, now));
}

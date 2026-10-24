import type { Workout, WorkoutSet } from '../db/types';

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

export function workoutDurationMs(w: Workout, now = Date.now()): number {
  return Math.max(0, (w.finishedAt ?? now) - w.startedAt);
}

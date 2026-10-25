import type { Workout, WorkoutSet } from '../db/types';

// Pure helpers for the run screen. All times come from stored timestamps (see CLAUDE.md),
// pauses are stored as intervals so a killed app resumes with the right elapsed time.

type Pause = { from: number; to?: number };

/** Milliseconds between `from` and `to` that are not inside a pause. */
export function activeMs(pauses: Pause[] | undefined, from: number, to: number): number {
  if (to <= from) return 0;
  let paused = 0;
  for (const p of pauses ?? []) {
    const a = Math.max(p.from, from);
    const b = Math.min(p.to ?? to, to);
    if (b > a) paused += b - a;
  }
  return to - from - paused;
}

export const isPaused = (w: Workout) => !!w.pauses?.some((p) => p.to === undefined);

export function pauseWorkout(w: Workout, now: number): Workout {
  return isPaused(w) ? w : { ...w, pauses: [...(w.pauses ?? []), { from: now }] };
}

export function resumeWorkout(w: Workout, now: number): Workout {
  if (!isPaused(w)) return w;
  return { ...w, pauses: w.pauses!.map((p) => (p.to === undefined ? { ...p, to: now } : p)) };
}

/** Active time of the whole workout. */
export function elapsedMs(w: Workout, now: number): number {
  return activeMs(w.pauses, w.startedAt, w.finishedAt ?? now);
}

export interface RunStep {
  exerciseId: string; // WorkoutExercise.id
  set: WorkoutSet;
  /** 1-based position among all sets of the workout. */
  number: number;
  total: number;
}

/** The first set that is not done yet, i.e. the step the run screen shows. */
export function currentStep(w: Workout): RunStep | undefined {
  const all = w.exercises.flatMap((e) => e.sets.map((set) => ({ exerciseId: e.id, set })));
  const i = all.findIndex((x) => !x.set.completed);
  return i < 0 ? undefined : { ...all[i], number: i + 1, total: all.length };
}

/** Active seconds since the current step started. */
export function stepElapsedSec(w: Workout, now: number): number {
  return activeMs(w.pauses, w.stepStartedAt ?? w.startedAt, now) / 1000;
}

/**
 * Marks the current step done with the time it really took. A distance overrides the planned
 * one; the next step starts now.
 */
export function completeStep(w: Workout, now: number, distanceM?: number): Workout {
  const step = currentStep(w);
  if (!step) return w;
  const durationSec = Math.max(1, Math.round(stepElapsedSec(w, now)));
  return {
    ...w,
    stepStartedAt: now,
    exercises: w.exercises.map((e) =>
      e.id !== step.exerciseId
        ? e
        : {
            ...e,
            sets: e.sets.map((s) =>
              s.id === step.set.id
                ? { ...s, completed: true, durationSec, ...(distanceM !== undefined ? { distanceM } : {}) }
                : s,
            ),
          },
    ),
  };
}

/** Sum of the distances of all done sets, in metres. */
export function doneDistanceM(w: Workout): number {
  return w.exercises.reduce(
    (sum, e) => sum + e.sets.reduce((n, s) => n + (s.completed ? (s.distanceM ?? 0) : 0), 0),
    0,
  );
}

/** Closes an open pause so a finished workout never has one. */
export function closePauses(w: Workout, at: number): Workout {
  return isPaused(w) ? resumeWorkout(w, at) : w;
}

/** Moves the workout in time: start, end and pauses shift by the same amount. */
export function shiftWorkout(w: Workout, newStart: number): Workout {
  const d = newStart - w.startedAt;
  return {
    ...w,
    startedAt: newStart,
    ...(w.finishedAt !== undefined ? { finishedAt: w.finishedAt + d } : {}),
    ...(w.pauses ? { pauses: w.pauses.map((p) => ({ from: p.from + d, ...(p.to !== undefined ? { to: p.to + d } : {}) })) } : {}),
    ...(w.stepStartedAt !== undefined ? { stepStartedAt: w.stepStartedAt + d } : {}),
  };
}

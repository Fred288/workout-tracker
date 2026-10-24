import type { SetType, Template, Workout, WorkoutExercise, WorkoutSet } from '../db/types';
import { newId } from './id';

// Pure, immutable operations on a workout. The active workout page applies them and
// writes the result straight to IndexedDB, so every change is auto-saved.

export const DEFAULT_REST_SEC = 90;

export function defaultWorkoutName(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'Morgen-Workout';
  if (h >= 11 && h < 14) return 'Mittags-Workout';
  if (h >= 14 && h < 18) return 'Nachmittags-Workout';
  return 'Abend-Workout';
}

export function createWorkout(now: number, name = defaultWorkoutName(new Date(now))): Workout {
  return { id: newId(), name, startedAt: now, exercises: [] };
}

export function newSet(type: SetType = 'normal'): WorkoutSet {
  return { id: newId(), type, completed: false };
}

const mapExercise = (w: Workout, weId: string, fn: (e: WorkoutExercise) => WorkoutExercise): Workout => ({
  ...w,
  exercises: w.exercises.map((e) => (e.id === weId ? fn(e) : e)),
});

const renumber = (exercises: WorkoutExercise[]) => exercises.map((e, i) => ({ ...e, order: i }));

export function addExercises(w: Workout, exerciseIds: string[]): Workout {
  const added = exerciseIds.map<WorkoutExercise>((exerciseId) => ({
    id: newId(),
    exerciseId,
    order: 0,
    sets: [newSet()],
  }));
  return { ...w, exercises: renumber([...w.exercises, ...added]) };
}

export function removeExercise(w: Workout, weId: string): Workout {
  return { ...w, exercises: renumber(w.exercises.filter((e) => e.id !== weId)) };
}

export function moveExercise(w: Workout, weId: string, dir: -1 | 1): Workout {
  const i = w.exercises.findIndex((e) => e.id === weId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= w.exercises.length) return w;
  const list = [...w.exercises];
  [list[i], list[j]] = [list[j], list[i]];
  return { ...w, exercises: renumber(list) };
}

export function updateExercise(
  w: Workout,
  weId: string,
  patch: Partial<Pick<WorkoutExercise, 'note' | 'restSec'>>,
): Workout {
  return mapExercise(w, weId, (e) => ({ ...e, ...patch }));
}

/** Adds an empty set; it inherits the type of the last set unless that was a warm-up. */
export function addSet(w: Workout, weId: string): Workout {
  return mapExercise(w, weId, (e) => {
    const last = e.sets.at(-1);
    const type = last && last.type !== 'warmup' ? last.type : 'normal';
    return { ...e, sets: [...e.sets, newSet(type)] };
  });
}

export function removeSet(w: Workout, weId: string, setId: string): Workout {
  return mapExercise(w, weId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
}

export function updateSet(
  w: Workout,
  weId: string,
  setId: string,
  patch: Partial<Omit<WorkoutSet, 'id'>>,
): Workout {
  return mapExercise(w, weId, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
  }));
}

/** True when the set has the values its exercise type needs. */
export function setHasValues(s: WorkoutSet, type: import('../db/types').ExerciseType): boolean {
  switch (type) {
    case 'weight_reps':
      return s.weightKg !== undefined && s.reps !== undefined;
    case 'bodyweight_reps':
    case 'assisted_bodyweight':
      return s.reps !== undefined;
    case 'duration':
      return s.durationSec !== undefined;
    case 'distance_duration':
      return s.distanceM !== undefined || s.durationSec !== undefined;
  }
}

/**
 * Toggles a set. Completing a set with empty fields fills them from the previous
 * session (like tapping the check in Strong), so "same as last time" is one tap.
 */
export function toggleSet(
  w: Workout,
  weId: string,
  setId: string,
  previous?: WorkoutSet,
): Workout {
  return mapExercise(w, weId, (e) => ({
    ...e,
    sets: e.sets.map((s) => {
      if (s.id !== setId) return s;
      if (s.completed) return { ...s, completed: false };
      return {
        ...s,
        reps: s.reps ?? previous?.reps,
        weightKg: s.weightKg ?? previous?.weightKg,
        durationSec: s.durationSec ?? previous?.durationSec,
        distanceM: s.distanceM ?? previous?.distanceM,
        completed: true,
      };
    }),
  }));
}

/** Adds a set that already counts as done; used when editing a finished workout. */
export function addCompletedSet(w: Workout, weId: string): Workout {
  const added = addSet(w, weId);
  return mapExercise(added, weId, (e) => {
    const last = e.sets.at(-1)!;
    const prev = e.sets.at(-2);
    return {
      ...e,
      sets: [
        ...e.sets.slice(0, -1),
        { ...last, reps: prev?.reps, weightKg: prev?.weightKg, durationSec: prev?.durationSec, distanceM: prev?.distanceM, completed: true },
      ],
    };
  });
}

/** A fresh workout with the same exercises, set types and values, nothing checked off yet. */
export function workoutFromPrevious(source: Workout, now: number): Workout {
  return {
    id: newId(),
    name: source.name,
    startedAt: now,
    exercises: source.exercises.map((e, i) => ({
      id: newId(),
      exerciseId: e.exerciseId,
      order: i,
      supersetGroup: e.supersetGroup,
      restSec: e.restSec,
      sets: e.sets.map((s) => ({
        id: newId(),
        type: s.type,
        reps: s.reps,
        weightKg: s.weightKg,
        durationSec: s.durationSec,
        distanceM: s.distanceM,
        completed: false,
      })),
    })),
  };
}

/** Template from a workout: exercises, set types and values; notes and check marks are dropped. */
export function templateFromWorkout(w: Workout, name: string): Template {
  return {
    id: newId(),
    name: name.trim() || w.name,
    exercises: w.exercises
      .filter((e) => e.sets.length > 0)
      .map((e, i) => ({
        id: newId(),
        exerciseId: e.exerciseId,
        order: i,
        supersetGroup: e.supersetGroup,
        restSec: e.restSec,
        sets: e.sets.map((s) => ({
          type: s.type,
          reps: s.reps,
          weightKg: s.weightKg,
          durationSec: s.durationSec,
          distanceM: s.distanceM,
        })),
      })),
  };
}

/** A fresh workout from a template with values prefilled and nothing checked off. */
export function workoutFromTemplate(t: Template, now: number): Workout {
  return {
    id: newId(),
    name: t.name,
    startedAt: now,
    templateId: t.id,
    exercises: t.exercises.map((e, i) => ({
      id: newId(),
      exerciseId: e.exerciseId,
      order: i,
      supersetGroup: e.supersetGroup,
      restSec: e.restSec,
      sets: (e.sets.length ? e.sets : [{ type: 'normal' as const }]).map((s) => ({
        id: newId(),
        ...s,
        completed: false,
      })),
    })),
  };
}

export function countIncompleteSets(w: Workout): number {
  return w.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.completed).length, 0);
}

export function countCompletedSets(w: Workout): number {
  return w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0);
}

/** Final shape of a finished workout: only completed sets, no empty exercises. */
export function finalizeWorkout(w: Workout, finishedAt: number): Workout {
  const exercises = renumber(
    w.exercises
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.completed) }))
      .filter((e) => e.sets.length > 0),
  );
  return { ...w, exercises, finishedAt };
}

/**
 * Sets of the most recent finished workout that contains the exercise, used for the
 * "Vorher" column. `workouts` may be in any order and may include the active one.
 */
export function previousSets(workouts: Workout[], exerciseId: string, excludeId?: string): WorkoutSet[] {
  let best: { at: number; sets: WorkoutSet[] } | undefined;
  for (const w of workouts) {
    if (!w.finishedAt || w.id === excludeId) continue;
    if (best && w.startedAt <= best.at) continue;
    const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
    if (sets.length) best = { at: w.startedAt, sets };
  }
  return best?.sets ?? [];
}

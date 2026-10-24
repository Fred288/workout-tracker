import { describe, expect, it } from 'vitest';
import type { Workout } from '../db/types';
import {
  addExercises,
  addSet,
  countIncompleteSets,
  createWorkout,
  defaultWorkoutName,
  finalizeWorkout,
  moveExercise,
  previousSets,
  removeExercise,
  removeSet,
  setHasValues,
  toggleSet,
  updateSet,
} from './workout';
import { workoutVolume, setVolume } from './stats';
import { formatClock, formatSet, parseClock } from './format';

const base = () => addExercises(createWorkout(1_000, 'Test'), ['bench', 'squat']);

describe('workout operations', () => {
  it('creates exercises with one empty set and keeps order', () => {
    const w = base();
    expect(w.exercises.map((e) => [e.exerciseId, e.order, e.sets.length])).toEqual([
      ['bench', 0, 1],
      ['squat', 1, 1],
    ]);
  });

  it('moves and removes exercises with renumbering', () => {
    let w = base();
    const [a, b] = w.exercises;
    w = moveExercise(w, b.id, -1);
    expect(w.exercises.map((e) => e.exerciseId)).toEqual(['squat', 'bench']);
    expect(moveExercise(w, b.id, -1)).toBe(w); // already first: unchanged
    w = removeExercise(w, b.id);
    expect(w.exercises).toEqual([{ ...a, order: 0 }]);
  });

  it('adds sets inheriting the type, but not warm-up', () => {
    let w = base();
    const e = w.exercises[0];
    w = updateSet(w, e.id, e.sets[0].id, { type: 'warmup' });
    w = addSet(w, e.id);
    expect(w.exercises[0].sets[1].type).toBe('normal');
    w = updateSet(w, e.id, w.exercises[0].sets[1].id, { type: 'drop' });
    w = addSet(w, e.id);
    expect(w.exercises[0].sets[2].type).toBe('drop');
    w = removeSet(w, e.id, w.exercises[0].sets[0].id);
    expect(w.exercises[0].sets).toHaveLength(2);
  });

  it('fills empty fields from the previous session when completing', () => {
    let w = base();
    const e = w.exercises[0];
    const s = e.sets[0];
    w = updateSet(w, e.id, s.id, { reps: 6 });
    w = toggleSet(w, e.id, s.id, { id: 'p', type: 'normal', reps: 8, weightKg: 60, completed: true });
    expect(w.exercises[0].sets[0]).toMatchObject({ reps: 6, weightKg: 60, completed: true });
    w = toggleSet(w, e.id, s.id);
    expect(w.exercises[0].sets[0]).toMatchObject({ reps: 6, weightKg: 60, completed: false });
  });

  it('finalizes: drops incomplete sets and empty exercises', () => {
    let w = base();
    const [bench, squat] = w.exercises;
    w = updateSet(w, bench.id, bench.sets[0].id, { reps: 5, weightKg: 80, completed: true });
    w = addSet(w, bench.id);
    expect(countIncompleteSets(w)).toBe(2);
    const done = finalizeWorkout(w, 5_000);
    expect(done.finishedAt).toBe(5_000);
    expect(done.exercises).toHaveLength(1);
    expect(done.exercises[0].sets).toHaveLength(1);
    expect(done.exercises.some((e) => e.id === squat.id)).toBe(false);
  });

  it('checks required values per exercise type', () => {
    const s = { id: 'x', type: 'normal' as const, completed: false };
    expect(setHasValues({ ...s, reps: 5 }, 'weight_reps')).toBe(false);
    expect(setHasValues({ ...s, reps: 5 }, 'bodyweight_reps')).toBe(true);
    expect(setHasValues({ ...s, durationSec: 30 }, 'duration')).toBe(true);
  });

  it('names workouts by time of day', () => {
    expect(defaultWorkoutName(new Date(2026, 0, 1, 7))).toBe('Morgen-Workout');
    expect(defaultWorkoutName(new Date(2026, 0, 1, 19))).toBe('Abend-Workout');
    expect(defaultWorkoutName(new Date(2026, 0, 1, 2))).toBe('Abend-Workout');
  });
});

describe('previousSets', () => {
  const w = (id: string, startedAt: number, exerciseId: string, reps: number, finished = true): Workout => ({
    id,
    name: id,
    startedAt,
    finishedAt: finished ? startedAt + 1 : undefined,
    exercises: [{ id: id + 'e', exerciseId, order: 0, sets: [{ id: id + 's', type: 'normal', reps, completed: true }] }],
  });

  it('takes the most recent finished workout with that exercise', () => {
    const list = [w('a', 1, 'bench', 5), w('c', 3, 'squat', 9), w('b', 2, 'bench', 6), w('active', 4, 'bench', 7, false)];
    expect(previousSets(list, 'bench').map((s) => s.reps)).toEqual([6]);
    expect(previousSets(list, 'deadlift')).toEqual([]);
    expect(previousSets(list, 'bench', 'b').map((s) => s.reps)).toEqual([5]);
  });
});

describe('stats', () => {
  it('counts volume of completed working sets only', () => {
    const set = { id: 's', reps: 10, weightKg: 50, completed: true };
    expect(setVolume({ ...set, type: 'normal' })).toBe(500);
    expect(setVolume({ ...set, type: 'warmup' })).toBe(0);
    expect(setVolume({ ...set, type: 'drop', completed: false })).toBe(0);
    const wk: Workout = {
      id: 'w',
      name: 'w',
      startedAt: 0,
      exercises: [{ id: 'e', exerciseId: 'x', order: 0, sets: [{ ...set, type: 'normal' }, { ...set, type: 'failure', reps: 5 }] }],
    };
    expect(workoutVolume(wk)).toBe(750);
  });
});

describe('format', () => {
  it('formats and parses clock times', () => {
    expect(formatClock(754)).toBe('12:34');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(parseClock('1:30')).toBe(90);
    expect(parseClock('90')).toBe(90);
    expect(parseClock('1:x')).toBeUndefined();
  });

  it('formats sets per type and unit', () => {
    const s = { id: 's', type: 'normal' as const, completed: true };
    expect(formatSet({ ...s, weightKg: 62.5, reps: 8 }, 'weight_reps', 'kg')).toBe('62,5 kg × 8');
    expect(formatSet({ ...s, weightKg: 10, reps: 8 }, 'bodyweight_reps', 'kg')).toBe('+10 kg × 8');
    expect(formatSet({ ...s, weightKg: 20, reps: 8 }, 'assisted_bodyweight', 'kg')).toBe('−20 kg × 8');
    expect(formatSet({ ...s, reps: 12 }, 'bodyweight_reps', 'kg')).toBe('12 Wdh.');
    expect(formatSet({ ...s, durationSec: 90 }, 'duration', 'kg')).toBe('1:30');
    expect(formatSet({ ...s, distanceM: 2500, durationSec: 720 }, 'distance_duration', 'kg')).toBe('2,5 km · 12:00');
  });
});

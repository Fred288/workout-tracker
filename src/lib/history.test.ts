import { describe, expect, it } from 'vitest';
import type { Workout, WorkoutSet } from '../db/types';
import { fromLocalInput, groupByMonth, toLocalInput } from './history';
import { addCompletedSet, addExercises, createWorkout, updateSet, workoutFromPrevious } from './workout';
import { bestSet } from './stats';

const w = (id: string, y: number, m: number, d: number, finished = true): Workout => {
  const startedAt = new Date(y, m - 1, d, 10).getTime();
  return { id, name: id, startedAt, finishedAt: finished ? startedAt + 3_600_000 : undefined, exercises: [] };
};

describe('groupByMonth', () => {
  it('groups newest first and skips unfinished workouts', () => {
    const groups = groupByMonth([w('a', 2026, 9, 30), w('b', 2026, 10, 2), w('c', 2026, 10, 20), w('x', 2026, 10, 25, false)]);
    expect(groups.map((g) => [g.key, g.workouts.map((x) => x.id)])).toEqual([
      ['2026-10', ['c', 'b']],
      ['2026-09', ['a']],
    ]);
    expect(groups[0].label).toBe('Oktober 2026');
  });
});

describe('local datetime input', () => {
  it('round-trips to the minute', () => {
    const ms = new Date(2026, 9, 24, 18, 5).getTime();
    expect(toLocalInput(ms)).toBe('2026-10-24T18:05');
    expect(fromLocalInput('2026-10-24T18:05')).toBe(ms);
    expect(fromLocalInput('')).toBeUndefined();
  });
});

describe('workoutFromPrevious', () => {
  it('copies exercises and values with new ids, nothing completed', () => {
    let src = addExercises(createWorkout(0, 'Push'), ['bench']);
    const e = src.exercises[0];
    src = updateSet(src, e.id, e.sets[0].id, { type: 'drop', reps: 8, weightKg: 60, completed: true });
    src = { ...src, finishedAt: 5, note: 'x' };
    const copy = workoutFromPrevious(src, 99);
    expect(copy.name).toBe('Push');
    expect(copy.startedAt).toBe(99);
    expect(copy.finishedAt).toBeUndefined();
    expect(copy.note).toBeUndefined();
    expect(copy.id).not.toBe(src.id);
    expect(copy.exercises[0].id).not.toBe(e.id);
    expect(copy.exercises[0].sets[0]).toMatchObject({ type: 'drop', reps: 8, weightKg: 60, completed: false });
    expect(copy.exercises[0].sets[0].id).not.toBe(e.sets[0].id);
  });
});

describe('addCompletedSet', () => {
  it('copies values from the last set and is completed', () => {
    let wk = addExercises(createWorkout(0), ['bench']);
    const e = wk.exercises[0];
    wk = updateSet(wk, e.id, e.sets[0].id, { reps: 5, weightKg: 100, completed: true });
    wk = addCompletedSet(wk, e.id);
    expect(wk.exercises[0].sets[1]).toMatchObject({ reps: 5, weightKg: 100, completed: true });
  });
});

describe('bestSet', () => {
  const s = (p: Partial<WorkoutSet>): WorkoutSet => ({ id: 'i', type: 'normal', completed: true, ...p });
  it('prefers volume, ignores warm-ups', () => {
    const best = bestSet([s({ weightKg: 100, reps: 10, type: 'warmup' }), s({ weightKg: 60, reps: 8 }), s({ weightKg: 70, reps: 5 })]);
    expect(best).toMatchObject({ weightKg: 60, reps: 8 });
  });
  it('falls back to duration and handles empty', () => {
    expect(bestSet([s({ durationSec: 30 }), s({ durationSec: 60 })])?.durationSec).toBe(60);
    expect(bestSet([])).toBeUndefined();
  });
});

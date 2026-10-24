import { describe, expect, it } from 'vitest';
import { addExercises, createWorkout, templateFromWorkout, updateSet, workoutFromTemplate } from './workout';

describe('templates', () => {
  const base = () => {
    let w = addExercises(createWorkout(0, 'Push'), ['bench', 'empty']);
    const e = w.exercises[0];
    w = updateSet(w, e.id, e.sets[0].id, { type: 'drop', reps: 8, weightKg: 60, completed: true });
    w = { ...w, exercises: [{ ...w.exercises[0], note: 'secret' }, { ...w.exercises[1], sets: [] }] };
    return w;
  };

  it('keeps exercises with values, drops notes, empty exercises and check marks', () => {
    const t = templateFromWorkout(base(), '  Mein Push  ');
    expect(t.name).toBe('Mein Push');
    expect(t.exercises).toHaveLength(1);
    expect(t.exercises[0]).toMatchObject({ exerciseId: 'bench', order: 0 });
    expect(t.exercises[0]).not.toHaveProperty('note');
    expect(t.exercises[0].sets).toEqual([
      { type: 'drop', reps: 8, weightKg: 60, durationSec: undefined, distanceM: undefined },
    ]);
  });

  it('falls back to the workout name', () => {
    expect(templateFromWorkout(base(), ' ').name).toBe('Push');
  });

  it('starts a workout with prefilled, unchecked sets and fresh ids', () => {
    const t = templateFromWorkout(base(), 'Push');
    const w = workoutFromTemplate(t, 500);
    expect(w).toMatchObject({ name: 'Push', startedAt: 500, templateId: t.id });
    expect(w.finishedAt).toBeUndefined();
    expect(w.exercises[0].sets[0]).toMatchObject({ type: 'drop', reps: 8, weightKg: 60, completed: false });
    expect(w.exercises[0].id).not.toBe(t.exercises[0].id);
    const w2 = workoutFromTemplate(t, 600);
    expect(w2.exercises[0].sets[0].id).not.toBe(w.exercises[0].sets[0].id);
  });

  it('gives every exercise at least one set', () => {
    const t = { id: 't', name: 'x', exercises: [{ id: 'e', exerciseId: 'a', order: 0, sets: [] }] };
    expect(workoutFromTemplate(t, 0).exercises[0].sets).toHaveLength(1);
  });
});

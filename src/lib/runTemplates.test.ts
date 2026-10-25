import { describe, expect, it } from 'vitest';
import { RUN_PRESETS, blocksToSets, templateFromPreset } from './runTemplates';
import { addExercises, createWorkout, templateFromWorkout, updateSet, workoutFromTemplate } from './workout';

describe('blocksToSets', () => {
  it('expands repeats in order, support steps become warm-up sets', () => {
    const sets = blocksToSets([
      { repeat: 1, steps: [{ intensity: 'warmup', durationSec: 600 }] },
      { repeat: 2, steps: [{ intensity: 'interval', distanceM: 800 }, { intensity: 'recovery', distanceM: 400 }] },
      { repeat: 1, steps: [{ intensity: 'cooldown', durationSec: 300 }] },
    ]);
    expect(sets.map((s) => [s.type, s.distanceM ?? s.durationSec, s.zone])).toEqual([
      ['warmup', 600, 1],
      ['normal', 800, 5],
      ['warmup', 400, 1],
      ['normal', 800, 5],
      ['warmup', 400, 1],
      ['warmup', 300, 1],
    ]);
  });

  it('explicit zone wins and repeat below 1 counts once', () => {
    const [s] = blocksToSets([{ repeat: 0, steps: [{ intensity: 'tempo', durationSec: 60, zone: 4 }] }]);
    expect(s.zone).toBe(4);
  });
});

describe('presets', () => {
  it('have the expected set counts', () => {
    const count = (id: string) => blocksToSets(RUN_PRESETS.find((p) => p.id === id)!.blocks).length;
    expect(count('free')).toBe(1);
    expect(count('easy')).toBe(1);
    expect(count('tempo')).toBe(3);
    expect(count('intervals-time')).toBe(10);
    expect(count('intervals-dist')).toBe(14);
  });

  it('start as run workout with unchecked sets', () => {
    const w = workoutFromTemplate(templateFromPreset(RUN_PRESETS.find((p) => p.id === 'intervals-time')!), 1);
    expect(w.sport).toBe('run');
    expect(w.exercises[0].exerciseId).toBe('Running');
    expect(w.exercises[0].sets.every((s) => !s.completed)).toBe(true);
  });
});

describe('templates keep endurance data', () => {
  it('carries sport and set zones through a template round trip', () => {
    let w = addExercises(createWorkout(0, 'Lauf'), ['Running']);
    const e = w.exercises[0];
    w = updateSet(w, e.id, e.sets[0].id, { distanceM: 5000, durationSec: 1500, zone: 2, avgHr: 140 });
    w = { ...w, sport: 'run' };
    const t = templateFromWorkout(w, 'Lauf');
    expect(t.sport).toBe('run');
    expect(t.exercises[0].sets[0].zone).toBe(2);
    expect(t.exercises[0].sets[0]).not.toHaveProperty('avgHr');
    const again = workoutFromTemplate(t, 1);
    expect(again.sport).toBe('run');
    expect(again.exercises[0].sets[0]).toMatchObject({ distanceM: 5000, zone: 2, completed: false });
  });
});

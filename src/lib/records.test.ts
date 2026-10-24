import { describe, expect, it } from 'vitest';
import type { ExerciseType, SetType, Workout, WorkoutSet } from '../db/types';
import {
  allExerciseRecords,
  estimate1RM,
  exerciseRecords,
  exerciseSessions,
  sessionSeries,
  workoutRecords,
} from './records';

// Spec for Phase 6 (written before the implementation, see PLAN.md 7a).
// Shared rules: only finished workouts, only completed sets, warm-ups never count.

let n = 0;
const s = (p: Partial<WorkoutSet> & { type?: SetType } = {}): WorkoutSet => ({
  id: `s${n++}`,
  type: 'normal',
  completed: true,
  ...p,
});
const day = (d: number) => new Date(2026, 9, d, 10).getTime();
const wk = (id: string, d: number, exercises: Record<string, WorkoutSet[]>, finished = true): Workout => ({
  id,
  name: id,
  startedAt: day(d),
  finishedAt: finished ? day(d) + 3_600_000 : undefined,
  exercises: Object.entries(exercises).map(([exerciseId, sets], i) => ({ id: `${id}-${i}`, exerciseId, order: i, sets })),
});

describe('estimate1RM (Epley)', () => {
  it('uses weight × (1 + reps / 30)', () => {
    expect(estimate1RM(100, 10)).toBeCloseTo(133.33, 2);
    expect(estimate1RM(60, 5)).toBeCloseTo(70, 5);
  });
  it('a single rep is the weight itself', () => {
    expect(estimate1RM(140, 1)).toBe(140);
  });
  it('is 0 without weight or reps', () => {
    expect(estimate1RM(0, 5)).toBe(0);
    expect(estimate1RM(100, 0)).toBe(0);
  });
});

describe('exerciseSessions', () => {
  const list = [
    wk('a', 1, { bench: [s({ weightKg: 60, reps: 8 })] }),
    wk('b', 5, { bench: [s({ type: 'warmup', weightKg: 40, reps: 10 }), s({ weightKg: 65, reps: 6 }), s({ weightKg: 70, reps: 3, completed: false })] }),
    wk('c', 3, { squat: [s({ weightKg: 100, reps: 5 })] }),
    wk('active', 9, { bench: [s({ weightKg: 99, reps: 1 })] }, false),
  ];

  it('lists finished sessions with this exercise, newest first', () => {
    expect(exerciseSessions(list, 'bench').map((x) => x.workoutId)).toEqual(['b', 'a']);
  });

  it('keeps warm-ups for display but drops incomplete sets', () => {
    const b = exerciseSessions(list, 'bench')[0];
    expect(b.sets.map((x) => [x.type, x.weightKg])).toEqual([
      ['warmup', 40],
      ['normal', 65],
    ]);
  });

  it('merges the exercise when it appears twice in one workout', () => {
    const twice: Workout = {
      ...wk('t', 2, {}),
      exercises: [
        { id: 'x1', exerciseId: 'bench', order: 0, sets: [s({ weightKg: 50, reps: 5 })] },
        { id: 'x2', exerciseId: 'bench', order: 1, sets: [s({ weightKg: 55, reps: 5 })] },
      ],
    };
    expect(exerciseSessions([twice], 'bench')[0].sets).toHaveLength(2);
  });
});

describe('exerciseRecords – weight × reps', () => {
  const list = [
    wk('a', 1, { bench: [s({ weightKg: 100, reps: 1 }), s({ weightKg: 80, reps: 8 })] }),
    wk('b', 2, { bench: [s({ type: 'warmup', weightKg: 120, reps: 3 }), s({ weightKg: 60, reps: 15 }), s({ type: 'drop', weightKg: 90, reps: 6 })] }),
    wk('c', 3, { bench: [s({ weightKg: 110, reps: 2, completed: false })] }),
  ];
  const r = exerciseRecords(list, 'bench', 'weight_reps');

  it('heaviest weight ignores warm-ups and incomplete sets', () => {
    expect(r.maxWeight).toMatchObject({ value: 100, workoutId: 'a' });
  });
  it('most reps in a single set', () => {
    expect(r.maxReps).toMatchObject({ value: 15, workoutId: 'b' });
  });
  it('best set by volume (weight × reps), drop sets count', () => {
    expect(r.bestSetVolume).toMatchObject({ value: 900, workoutId: 'b' }); // 60×15 = 900 > 80×8 = 640 > 90×6 = 540
  });
  it('best estimated 1RM', () => {
    // 80×8 → 101.33, 100×1 → 100, 90×6 → 108, 60×15 → 90
    expect(r.best1RM?.value).toBeCloseTo(108, 5);
    expect(r.best1RM?.workoutId).toBe('b');
  });
  it('the earliest set wins a tie', () => {
    const tie = [wk('x', 1, { bench: [s({ weightKg: 100, reps: 5 })] }), wk('y', 2, { bench: [s({ weightKg: 100, reps: 3 })] })];
    expect(exerciseRecords(tie, 'bench', 'weight_reps').maxWeight?.workoutId).toBe('x');
  });
  it('no sessions → no records', () => {
    expect(exerciseRecords(list, 'deadlift', 'weight_reps')).toEqual({});
  });
});

describe('exerciseRecords – other exercise types', () => {
  it('bodyweight: most reps and heaviest added weight, no 1RM', () => {
    const r = exerciseRecords(
      [wk('a', 1, { pullup: [s({ reps: 12 }), s({ weightKg: 10, reps: 6 })] })],
      'pullup',
      'bodyweight_reps',
    );
    expect(r.maxReps?.value).toBe(12);
    expect(r.maxWeight?.value).toBe(10);
    expect(r.best1RM).toBeUndefined();
    expect(r.bestSetVolume).toBeUndefined();
  });

  it('assisted: the least assistance with at least one rep is the record', () => {
    const r = exerciseRecords(
      [wk('a', 1, { dip: [s({ weightKg: 30, reps: 8 })] }), wk('b', 2, { dip: [s({ weightKg: 20, reps: 5 }), s({ weightKg: 0, reps: 0 })] })],
      'dip',
      'assisted_bodyweight',
    );
    expect(r.leastAssistance).toMatchObject({ value: 20, workoutId: 'b' });
    expect(r.maxReps?.value).toBe(8);
    expect(r.maxWeight).toBeUndefined();
  });

  it('duration: longest time', () => {
    const r = exerciseRecords([wk('a', 1, { plank: [s({ durationSec: 60 }), s({ durationSec: 95 })] })], 'plank', 'duration');
    expect(r.longestDuration?.value).toBe(95);
    expect(r.maxWeight).toBeUndefined();
  });

  it('distance + duration: longest distance and longest time', () => {
    const r = exerciseRecords(
      [wk('a', 1, { run: [s({ distanceM: 5000, durationSec: 1500 })] }), wk('b', 2, { run: [s({ distanceM: 3000, durationSec: 1800 })] })],
      'run',
      'distance_duration',
    );
    expect(r.longestDistance).toMatchObject({ value: 5000, workoutId: 'a' });
    expect(r.longestDuration).toMatchObject({ value: 1800, workoutId: 'b' });
  });
});

describe('sessionSeries (charts)', () => {
  it('one point per session, oldest first: heaviest weight, best 1RM, volume', () => {
    const list = [
      wk('b', 4, { bench: [s({ weightKg: 70, reps: 5 }), s({ weightKg: 60, reps: 10 })] }),
      wk('a', 1, { bench: [s({ type: 'warmup', weightKg: 40, reps: 10 }), s({ weightKg: 60, reps: 8 })] }),
    ];
    const series = sessionSeries(list, 'bench');
    expect(series.map((p) => p.date)).toEqual([day(1), day(4)]);
    expect(series[0]).toMatchObject({ maxWeight: 60, volume: 480 }); // warm-up not in volume
    expect(series[0].best1RM).toBeCloseTo(76, 5);
    expect(series[1]).toMatchObject({ maxWeight: 70, volume: 950 });
    expect(series[1].best1RM).toBeCloseTo(81.67, 2); // 60×10 = 80, 70×5 = 81.67
  });

  it('skips sessions with only warm-ups', () => {
    expect(sessionSeries([wk('a', 1, { bench: [s({ type: 'warmup', weightKg: 40, reps: 10 })] })], 'bench')).toEqual([]);
  });
});

describe('workoutRecords (PR badges)', () => {
  const types = new Map<string, ExerciseType>([
    ['bench', 'weight_reps'],
    ['plank', 'duration'],
  ]);

  it('the very first session of an exercise sets no badges', () => {
    const list = [wk('a', 1, { bench: [s({ weightKg: 60, reps: 8 })] })];
    expect(workoutRecords(list, 'a', types)).toEqual([]);
  });

  it('marks records beaten compared with earlier workouts only', () => {
    const list = [
      wk('a', 1, { bench: [s({ weightKg: 60, reps: 8 })] }),
      wk('b', 2, { bench: [s({ weightKg: 65, reps: 5 })] }), // heavier, but fewer reps and less volume
      wk('c', 3, { bench: [s({ weightKg: 100, reps: 1 })] }), // later workouts must not affect b
    ];
    expect(workoutRecords(list, 'b', types)).toEqual([{ exerciseId: 'bench', kinds: ['maxWeight'] }]);
  });

  it('ties are not records', () => {
    const list = [wk('a', 1, { bench: [s({ weightKg: 60, reps: 8 })] }), wk('b', 2, { bench: [s({ weightKg: 60, reps: 8 })] })];
    expect(workoutRecords(list, 'b', types)).toEqual([]);
  });

  it('reports several kinds and several exercises in a stable order', () => {
    const list = [
      wk('a', 1, { bench: [s({ weightKg: 60, reps: 8 })], plank: [s({ durationSec: 60 })] }),
      wk('b', 2, { bench: [s({ weightKg: 70, reps: 10 })], plank: [s({ durationSec: 90 })] }),
    ];
    expect(workoutRecords(list, 'b', types)).toEqual([
      { exerciseId: 'bench', kinds: ['maxWeight', 'maxReps', 'bestSetVolume', 'best1RM'] },
      { exerciseId: 'plank', kinds: ['longestDuration'] },
    ]);
  });

  it('unknown or unfinished workouts have no badges', () => {
    const list = [wk('a', 1, { bench: [s({ weightKg: 60, reps: 8 })] }), wk('b', 2, { bench: [s({ weightKg: 99, reps: 9 })] }, false)];
    expect(workoutRecords(list, 'b', types)).toEqual([]);
    expect(workoutRecords(list, 'zzz', types)).toEqual([]);
  });
});

describe('allExerciseRecords (global records tab)', () => {
  it('one row per exercise that was trained, with heaviest weight, most reps, sessions and last date', () => {
    const list = [
      wk('a', 1, { bench: [s({ weightKg: 60, reps: 8 })], squat: [s({ weightKg: 100, reps: 5 })] }),
      wk('b', 4, { bench: [s({ weightKg: 65, reps: 6 })] }),
      wk('c', 6, { bench: [s({ type: 'warmup', weightKg: 40, reps: 20 })] }), // warm-up only: no session
    ];
    const rows = allExerciseRecords(list, new Map([['bench', 'weight_reps'], ['squat', 'weight_reps']]));
    expect(rows).toEqual([
      expect.objectContaining({ exerciseId: 'bench', maxWeight: 65, maxReps: 8, sessions: 2, lastDate: day(4) }),
      expect.objectContaining({ exerciseId: 'squat', maxWeight: 100, maxReps: 5, sessions: 1, lastDate: day(1) }),
    ]);
  });
});

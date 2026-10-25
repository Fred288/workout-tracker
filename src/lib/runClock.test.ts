import { describe, expect, it } from 'vitest';
import type { Workout } from '../db/types';
import {
  activeMs,
  closePauses,
  completeStep,
  currentStep,
  doneDistanceM,
  elapsedMs,
  isPaused,
  pauseWorkout,
  resumeWorkout,
  shiftWorkout,
  stepElapsedSec,
} from './runClock';

const w = (over: Partial<Workout> = {}): Workout => ({
  id: 'w',
  name: 'Lauf',
  startedAt: 1000,
  sport: 'run',
  exercises: [
    {
      id: 'e',
      exerciseId: 'Running',
      order: 0,
      sets: [
        { id: 's1', type: 'warmup', durationSec: 600, completed: false },
        { id: 's2', type: 'normal', distanceM: 800, completed: false },
      ],
    },
  ],
  ...over,
});

describe('activeMs', () => {
  it('excludes closed and open pauses', () => {
    expect(activeMs(undefined, 0, 100)).toBe(100);
    expect(activeMs([{ from: 20, to: 50 }], 0, 100)).toBe(70);
    expect(activeMs([{ from: 80 }], 0, 100)).toBe(80); // open pause runs until `to`
  });
  it('clips pauses to the range and handles empty ranges', () => {
    expect(activeMs([{ from: 0, to: 50 }], 40, 100)).toBe(50);
    expect(activeMs([{ from: 10, to: 20 }], 50, 100)).toBe(50);
    expect(activeMs([], 100, 100)).toBe(0);
    expect(activeMs([], 100, 50)).toBe(0);
  });
});

describe('pause and resume', () => {
  it('stops the clock while paused and continues afterwards', () => {
    let x = pauseWorkout(w(), 11_000);
    expect(isPaused(x)).toBe(true);
    expect(elapsedMs(x, 20_000)).toBe(10_000);
    x = resumeWorkout(x, 16_000);
    expect(isPaused(x)).toBe(false);
    expect(elapsedMs(x, 20_000)).toBe(14_000);
  });
  it('is idempotent', () => {
    const p = pauseWorkout(w(), 5000);
    expect(pauseWorkout(p, 6000)).toBe(p);
    const base = w();
    expect(resumeWorkout(base, 6000)).toBe(base);
  });
  it('uses finishedAt for finished workouts and closePauses ends an open pause', () => {
    const x = closePauses(pauseWorkout(w(), 5000), 9000);
    expect(x.pauses).toEqual([{ from: 5000, to: 9000 }]);
    expect(elapsedMs({ ...x, finishedAt: 11_000 }, 99_999)).toBe(6000);
  });
});

describe('steps', () => {
  it('current step is the first open set', () => {
    expect(currentStep(w())).toMatchObject({ number: 1, total: 2 });
    const done = { ...w() };
    done.exercises = [{ ...done.exercises[0], sets: done.exercises[0].sets.map((s, i) => ({ ...s, completed: i === 0 })) }];
    expect(currentStep(done)).toMatchObject({ number: 2 });
    done.exercises[0].sets[1].completed = true;
    expect(currentStep(done)).toBeUndefined();
  });

  it('completeStep stores the real duration without pauses and starts the next step', () => {
    let x = pauseWorkout(w(), 31_000);
    x = resumeWorkout(x, 41_000);
    expect(stepElapsedSec(x, 61_000)).toBe(50);
    x = completeStep(x, 61_000);
    expect(x.exercises[0].sets[0]).toMatchObject({ completed: true, durationSec: 50, type: 'warmup' });
    expect(x.stepStartedAt).toBe(61_000);
    expect(stepElapsedSec(x, 66_000)).toBe(5);
    x = completeStep(x, 66_000, 850);
    expect(x.exercises[0].sets[1]).toMatchObject({ completed: true, durationSec: 5, distanceM: 850 });
  });

  it('keeps the planned distance when none is given and never stores 0 s', () => {
    const x = completeStep(completeStep(w(), 1000), 1000);
    expect(x.exercises[0].sets[1]).toMatchObject({ distanceM: 800, durationSec: 1 });
  });

  it('does nothing when all steps are done', () => {
    const x = completeStep(completeStep(w(), 5000), 9000);
    expect(completeStep(x, 12_000)).toBe(x);
  });

  it('sums distance of done sets only', () => {
    const x = completeStep(completeStep(w(), 5000, 1000), 9000);
    expect(doneDistanceM(x)).toBe(1800);
    expect(doneDistanceM(w())).toBe(0);
  });
});

describe('shiftWorkout', () => {
  it('moves start, end, pauses and step start together', () => {
    const x = shiftWorkout(
      w({ finishedAt: 5000, pauses: [{ from: 2000, to: 3000 }], stepStartedAt: 4000 }),
      11_000,
    );
    expect(x).toMatchObject({ startedAt: 11_000, finishedAt: 15_000, pauses: [{ from: 12_000, to: 13_000 }], stepStartedAt: 14_000 });
    expect(elapsedMs(x, 0)).toBe(3000);
  });
});

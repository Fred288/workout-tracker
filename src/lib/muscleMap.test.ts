import { describe, expect, it } from 'vitest';
import seed from '../data/exercises.seed.json';
import { MUSCLES, isMuscleId } from './muscleMap';
import { BACK, FRONT } from '../components/muscleShapes';

describe('muscle mapping', () => {
  it('maps every muscle name used in the seed', () => {
    const used = new Set(
      seed.exercises.flatMap((e) => [...e.primaryMuscles, ...e.secondaryMuscles]),
    );
    const unmapped = [...used].filter((m) => !isMuscleId(m));
    expect(unmapped).toEqual([]);
  });

  it('draws every muscle in at least one view', () => {
    const missing = MUSCLES.filter((m) => !FRONT[m]?.length && !BACK[m]?.length);
    expect(missing).toEqual([]);
  });
});

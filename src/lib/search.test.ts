import { describe, expect, it } from 'vitest';
import seed from '../data/exercises.seed.json';
import type { Exercise } from '../db/types';
import { editDistance, searchExercises } from './search';

const list = seed.exercises as Exercise[];
const names = (l: Exercise[]) => l.map((e) => e.name);

describe('searchExercises', () => {
  it('finds English names directly', () => {
    expect(names(searchExercises(list, 'bench press').matches)).toContain('Barbell Bench Press - Medium Grip');
  });

  it('maps German gym terms, also while typing', () => {
    expect(names(searchExercises(list, 'Bankdrücken').matches)).toContain('Barbell Bench Press - Medium Grip');
    expect(names(searchExercises(list, 'bankd').matches)).toContain('Dumbbell Bench Press');
    expect(names(searchExercises(list, 'Klimmzug').matches)).toEqual(expect.arrayContaining(['Pullups', 'Chin-Up']));
    expect(names(searchExercises(list, 'liegestütz').matches)).toContain('Pushups');
    expect(names(searchExercises(list, 'Kniebeuge').matches)).toContain('Barbell Squat');
  });

  it('combines equipment and muscle words', () => {
    const r = searchExercises(list, 'kurzhantel schulter').matches;
    expect(names(r)).toContain('Dumbbell Shoulder Press');
    expect(r.every((e) => e.equipment === 'dumbbell' && e.primaryMuscles.includes('shoulders'))).toBe(true);
  });

  it('suggests similar exercises for typos when nothing matches', () => {
    const r = searchExercises(list, 'bankdruken');
    expect(r.matches).toEqual([]);
    expect(names(r.similar)).toContain('Barbell Bench Press - Medium Grip');
    expect(names(searchExercises(list, 'sqaut').similar)).toContain('Barbell Squat');
  });

  it('shows related exercises next to exact matches', () => {
    const r = searchExercises(list, 'hammer curl');
    expect(names(r.matches)).toContain('Hammer Curls');
    expect(r.similar.length).toBeGreaterThan(0);
    expect(r.similar.every((e) => !r.matches.includes(e))).toBe(true);
    expect(r.similar.some((e) => e.primaryMuscles.includes('biceps'))).toBe(true);
  });

  it('returns everything for an empty query', () => {
    expect(searchExercises(list, '  ').matches).toHaveLength(list.length);
  });
});

describe('editDistance', () => {
  it('counts edits, a swap of neighbours as one', () => {
    expect(editDistance('squat', 'sqaut')).toBe(1);
    expect(editDistance('curl', 'curls')).toBe(1);
    expect(editDistance('', 'ab')).toBe(2);
    expect(editDistance('bankdruken', 'bankdrucken')).toBe(1);
  });
});

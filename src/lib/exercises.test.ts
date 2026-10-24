import { describe, expect, it } from 'vitest';
import type { Exercise } from '../db/types';
import { EMPTY_FILTERS, filterExercises, groupByLetter, letterOf } from './exercises';

const ex = (over: Partial<Exercise>): Exercise => ({
  id: over.name ?? 'x',
  name: 'x',
  equipment: 'none',
  type: 'weight_reps',
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: [],
  images: [],
  isCustom: false,
  ...over,
});

const list = [
  ex({ name: 'Squat', equipment: 'barbell', primaryMuscles: ['quadriceps'], category: 'strength' }),
  ex({ name: 'Push-Up', nameDe: 'Liegestütz', primaryMuscles: ['chest'] }),
  ex({ name: '3/4 Sit-Up', primaryMuscles: ['abdominals'] }),
  ex({ name: 'Bench Press', equipment: 'barbell', primaryMuscles: ['chest'], isCustom: true }),
  ex({ name: 'Calf Stretch', category: 'stretching', primaryMuscles: ['calves'] }),
];
const names = (l: Exercise[]) => l.map((e) => e.name);

describe('filterExercises', () => {
  it('sorts by display name (German first)', () => {
    expect(names(filterExercises(list, EMPTY_FILTERS))).toEqual([
      '3/4 Sit-Up',
      'Bench Press',
      'Calf Stretch',
      'Push-Up', // shown as "Liegestütz"
      'Squat',
    ]);
  });

  it('searches German and English names, ignoring case and umlauts', () => {
    expect(names(filterExercises(list, { ...EMPTY_FILTERS, query: 'liegestutz' }))).toEqual(['Push-Up']);
    expect(names(filterExercises(list, { ...EMPTY_FILTERS, query: 'PUSH' }))).toEqual(['Push-Up']);
    expect(names(filterExercises(list, { ...EMPTY_FILTERS, query: 'bench pr' }))).toEqual(['Bench Press']);
  });

  it('filters equipment: none, any and specific', () => {
    expect(filterExercises(list, { ...EMPTY_FILTERS, equipment: 'none' })).toHaveLength(3);
    expect(names(filterExercises(list, { ...EMPTY_FILTERS, equipment: 'any' }))).toEqual(['Bench Press', 'Squat']);
    expect(filterExercises(list, { ...EMPTY_FILTERS, equipment: 'dumbbell' })).toHaveLength(0);
  });

  it('filters by primary muscle, category and custom', () => {
    expect(names(filterExercises(list, { ...EMPTY_FILTERS, muscle: 'chest' }))).toEqual(['Bench Press', 'Push-Up']);
    expect(names(filterExercises(list, { ...EMPTY_FILTERS, category: 'stretching' }))).toEqual(['Calf Stretch']);
    expect(names(filterExercises(list, { ...EMPTY_FILTERS, customOnly: true }))).toEqual(['Bench Press']);
  });
});

describe('groupByLetter', () => {
  it('groups with # first', () => {
    const groups = groupByLetter(filterExercises(list, EMPTY_FILTERS));
    expect(groups.map((g) => g.letter)).toEqual(['#', 'B', 'C', 'L', 'S']);
  });

  it('maps umlauts to their base letter', () => {
    expect(letterOf('Überzüge')).toBe('U');
    expect(letterOf('-x')).toBe('#');
  });
});

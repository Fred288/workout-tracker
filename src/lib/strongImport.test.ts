import { describe, expect, it } from 'vitest';
import seed from '../data/exercises.seed.json';
import type { Exercise } from '../db/types';
import { csvToObjects, parseCsv } from './csv';
import { STRONG_EXERCISES, guessEquipment } from './strongExercises';
import {
  buildPlan,
  detectKind,
  inferType,
  parseStrongDate,
  parseStrongTemplates,
  parseStrongWeights,
  parseStrongWorkouts,
  type ExistingData,
} from './strongImport';

const library = seed.exercises as Exercise[];
const none = (): ExistingData => ({ exerciseIds: new Set(), workoutIds: new Set(), templateIds: new Set(), measurementDates: new Set() });

const WORKOUT_HEADER =
  'Date,Timezone,Workout,Workout Duration (s),Group,Exercise,Set,Weight (kg),Reps,RPE,Distance (m),Duration (s),Workout Notes,Exercise Notes';
const row = (...c: (string | number)[]) => c.join(',');
const csv = (...lines: string[]) => lines.join('\n');
const TZ = 'Europe/Berlin (+02:00) [device]';

describe('csv', () => {
  it('handles quotes, commas, line breaks inside quotes, CRLF and BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"line1\nline2",z\r\n\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']]);
  });
  it('maps rows to headers', () => {
    expect(csvToObjects('a,b\n1,2\n3').rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '' }]);
  });
});

describe('detectKind', () => {
  it('recognises the three Strong files by their header', () => {
    expect(detectKind(WORKOUT_HEADER.split(','))).toBe('workouts');
    expect(detectKind('Template,Group,Exercise,Set,Weight (kg),Reps'.split(','))).toBe('templates');
    expect(detectKind('Date,Measurement Type,Value,Unit,Source'.split(','))).toBe('weight');
    expect(detectKind(['foo', 'bar'])).toBeUndefined();
  });
});

describe('parseStrongDate', () => {
  it('applies the stated UTC offset', () => {
    expect(parseStrongDate('2026-10-24 14:22:54', TZ)).toBe(Date.UTC(2026, 9, 24, 12, 22, 54));
    expect(parseStrongDate('2026-01-05 08:00:00', 'Europe/Berlin (+01:00)')).toBe(Date.UTC(2026, 0, 5, 7, 0, 0));
  });
  it('falls back to device time without an offset, rejects garbage', () => {
    expect(parseStrongDate('2026-01-05 08:00:00')).toBe(new Date(2026, 0, 5, 8, 0, 0).getTime());
    expect(parseStrongDate('nope')).toBeUndefined();
  });
});

describe('parseStrongWorkouts', () => {
  const text = csv(
    WORKOUT_HEADER,
    row('2026-10-24 14:22:54', TZ, 'Brust', 3600, '', 'Bench Press (Dumbbell)', 'W', 18, 12, '', '', '', 'alles gut', 'Notiz A'),
    row('2026-10-24 14:22:54', TZ, 'Brust', 3600, '', 'Bench Press (Dumbbell)', 1, 22, 11, '', '', '', 'alles gut', 'Notiz A'),
    row('2026-10-24 14:22:54', TZ, 'Brust', 3600, '', 'Push Up', 1, 0, 20, '', '', '', 'alles gut', ''),
    row('2026-10-24 14:22:54', TZ, 'Brust', 3600, '', 'Bench Press (Dumbbell)', 1, 24, 8, '', '', '', 'alles gut', ''), // exercise again later = new block
    row('2026-10-20 10:00:00', TZ, 'Cardio', 1200, '', 'Rowing (Machine)', 1, '', '', '', 1160, 300, '', ''),
    row('2026-10-18 10:00:00', TZ, 'Defekt', 1209000, '', 'Push Up', 1, 0, 5, '', '', '', '', ''), // 14 days
  );
  const parsed = parseStrongWorkouts(text);

  it('groups rows into workouts, sorted by date', () => {
    expect(parsed.map((w) => w.name)).toEqual(['Defekt', 'Cardio', 'Brust']);
  });

  it('keeps exercise blocks in order and splits non-consecutive repeats', () => {
    const w = parsed[2];
    expect(w.exercises.map((e) => [e.name, e.sets.length])).toEqual([['Bench Press (Dumbbell)', 2], ['Push Up', 1], ['Bench Press (Dumbbell)', 1]]);
    expect(w.exercises[0].note).toBe('Notiz A');
    expect(w.note).toBe('alles gut');
    expect(w.durationSec).toBe(3600);
  });

  it('maps set labels and numbers', () => {
    const [warm, work] = parsed[2].exercises[0].sets;
    expect(warm).toMatchObject({ type: 'warmup', weightKg: 18, reps: 12 });
    expect(work).toMatchObject({ type: 'normal', weightKg: 22, reps: 11 });
    expect(parsed[2].exercises[1].sets[0].weightKg).toBeUndefined(); // 0 kg = bodyweight
    expect(parsed[1].exercises[0].sets[0]).toMatchObject({ distanceM: 1160, durationSec: 300 });
  });

  it('flags implausible durations and substitutes one hour', () => {
    expect(parsed[0]).toMatchObject({ durationSec: 3600, durationAdjusted: true });
    expect(parsed[2].durationAdjusted).toBe(false);
  });
});

describe('parseStrongTemplates', () => {
  it('keeps order, trims names, numbers repeated names', () => {
    const t = parseStrongTemplates(
      csv(
        'Template,Group,Exercise,Set,Weight (kg),Reps,RPE,Distance (m),Duration (s)',
        '"Oberkörper ",,Push Up,W,,10,,,',
        '"Oberkörper ",,Push Up,1,5,12,,,',
        'Beine,,Leg Press,1,100,10,,,',
        'Oberkörper,,Chest Fly,1,20,10,,,',
      ),
    );
    expect(t.map((x) => x.name)).toEqual(['Oberkörper', 'Beine', 'Oberkörper (2)']);
    expect(t[0].exercises[0].sets.map((s) => s.type)).toEqual(['warmup', 'normal']);
  });
});

describe('parseStrongWeights', () => {
  const r = parseStrongWeights(
    csv(
      'Date,Measurement Type,Value,Unit,Source',
      '2026-10-18 10:21:00,Gewicht,80,kg,Apple Health',
      '2026-10-18 07:00:00,Gewicht,81,kg,Strong',
      '2026-10-17 07:00:00,Gewicht,176.4,lb,Strong',
      '2026-10-16 07:00:00,Körperfett,18,%,Strong',
    ),
  );
  it('keeps the latest value of a day, converts lb, skips other measurements', () => {
    expect(r.weights.map((w) => [w.date, w.weightKg])).toEqual([['2026-10-17', 80.01], ['2026-10-18', 80]]);
    expect(r.skipped).toBe(1);
  });
});

describe('exercise table', () => {
  it('only maps to exercises that exist in the library', () => {
    const names = new Set(library.map((e) => e.name));
    const missing = Object.entries(STRONG_EXERCISES).filter(([, v]) => typeof v === 'string' && !names.has(v)).map(([k, v]) => `${k} -> ${v}`);
    expect(missing).toEqual([]);
  });
  it('no two Strong names map to the same library exercise', () => {
    const targets = Object.values(STRONG_EXERCISES).filter((v): v is string => typeof v === 'string');
    expect(targets.filter((t, i) => targets.indexOf(t) !== i)).toEqual([]);
  });
  it('guesses equipment from the name suffix', () => {
    expect(guessEquipment('Curl (Dumbbell)')).toBe('dumbbell');
    expect(guessEquipment('Press (Smith Machine)')).toBe('machine');
    expect(guessEquipment('Row (Cable - Straight Bar)')).toBe('cable');
    expect(guessEquipment('Plank')).toBe('none');
    expect(guessEquipment('Foo (Bar)')).toBe('other');
  });
  it('infers the exercise type from the sets', () => {
    expect(inferType([{ type: 'normal', reps: 8, weightKg: 20 }])).toBe('weight_reps');
    expect(inferType([{ type: 'normal', reps: 8 }])).toBe('bodyweight_reps');
    expect(inferType([{ type: 'normal', durationSec: 60 }])).toBe('duration');
    expect(inferType([{ type: 'normal', durationSec: 60, distanceM: 500 }])).toBe('distance_duration');
    expect(inferType([{ type: 'normal', reps: 8, weightKg: 20, assisted: true }])).toBe('assisted_bodyweight');
  });
});

describe('buildPlan', () => {
  const input = () => ({
    workouts: parseStrongWorkouts(
      csv(
        WORKOUT_HEADER,
        row('2026-10-24 14:22:54', TZ, 'Brust', 3600, '', 'Bench Press (Dumbbell)', 1, 22, 11, '', '', '', '', ''),
        row('2026-10-24 14:22:54', TZ, 'Brust', 3600, '', 'Lateral Raise (Cable)', 1, 7.5, 12, '', '', '', '', ''),
        row('2026-10-24 14:22:54', TZ, 'Brust', 3600, '', 'Neue Übung (Dumbbell)', 1, 10, 12, '', '', '', '', ''),
      ),
    ),
    weights: [{ date: '2026-10-18', weightKg: 80 }],
  });

  it('maps known exercises to the library, creates the others as custom exercises', () => {
    const plan = buildPlan(input(), library, none());
    const w = plan.workouts[0];
    const bench = library.find((e) => e.name === 'Dumbbell Bench Press')!;
    expect(w.exercises[0].exerciseId).toBe(bench.id);
    expect(plan.mappedExercises).toEqual([{ strong: 'Bench Press (Dumbbell)', library: 'Dumbbell Bench Press' }]);
    expect(plan.newExercises.map((e) => [e.id, e.equipment, e.primaryMuscles.join(), e.isCustom])).toEqual([
      ['strong-lateral-raise-cable', 'cable', 'shoulders', true],
      ['strong-neue-ubung-dumbbell', 'dumbbell', '', true],
    ]);
    expect(w.exercises.every((e) => [bench.id, 'strong-lateral-raise-cable', 'strong-neue-ubung-dumbbell'].includes(e.exerciseId))).toBe(true);
  });

  it('builds finished workouts with completed sets and the right times', () => {
    const w = buildPlan(input(), library, none()).workouts[0];
    expect(w.startedAt).toBe(Date.UTC(2026, 9, 24, 12, 22, 54));
    expect(w.finishedAt).toBe(w.startedAt + 3_600_000);
    expect(w.exercises[0].sets[0]).toMatchObject({ weightKg: 22, reps: 11, completed: true, type: 'normal' });
  });

  it('is idempotent: existing ids are skipped, nothing is duplicated', () => {
    const first = buildPlan(input(), library, none());
    const existing: ExistingData = {
      exerciseIds: new Set(first.newExercises.map((e) => e.id)),
      workoutIds: new Set(first.workouts.map((w) => w.id)),
      templateIds: new Set(),
      measurementDates: new Set(first.measurements.map((m) => m.date)),
    };
    const second = buildPlan(input(), library, existing);
    expect(second.workouts).toEqual([]);
    expect(second.newExercises).toEqual([]);
    expect(second.measurements).toEqual([]);
    expect(second.already).toMatchObject({ workouts: 1, measurements: 1 });
    // ... and the workout still points to the same exercise ids
    expect(first.workouts[0].id).toBe(buildPlan(input(), library, none()).workouts[0].id);
  });

  it('keeps own weight entries of the same day', () => {
    const plan = buildPlan(input(), library, { ...none(), measurementDates: new Set(['2026-10-18']) });
    expect(plan.measurements).toEqual([]);
    expect(plan.already.measurements).toBe(1);
  });

  it('leaves out a workout whose only set is a typo', () => {
    const w = parseStrongWorkouts(
      csv(WORKOUT_HEADER, row('2026-10-24 14:22:54', TZ, 'Lauf', 99999999, '', 'Laufband', 1, '', '', '', 900000, 300, '', '')),
    );
    const plan = buildPlan({ workouts: w }, library, none());
    expect(plan.warnings).toHaveLength(1);
    // the only set is a typo, so the whole workout (and its exercise) is left out
    expect(plan.suspicious).toEqual(['24.10.2026 Lauf: ganzes Workout ausgelassen, es blieb kein Satz übrig', '24.10.2026 Laufband, Satz 1: 900 km']);
    expect(plan.workouts).toEqual([]);
    expect(plan.newExercises).toEqual([]);
  });

  it('keeps normal sets of a workout and flags a bad duration', () => {
    const w = parseStrongWorkouts(
      csv(
        WORKOUT_HEADER,
        row('2026-10-24 14:22:54', TZ, 'Lauf', 99999999, '', 'Laufband', 1, '', '', '', 900, 300, '', ''),
        row('2026-10-24 14:22:54', TZ, 'Lauf', 99999999, '', 'Laufband', 2, '', '', '', 900000, 300, '', ''),
      ),
    );
    const plan = buildPlan({ workouts: w }, library, none());
    expect(plan.workouts[0].exercises[0].sets).toHaveLength(1);
    expect(plan.workouts[0].exercises[0].sets[0].distanceM).toBe(900);
    expect(plan.suspicious).toEqual(['24.10.2026 Laufband, Satz 2: 900 km', '24.10.2026 Lauf: Dauer 27778 Std. → 1 Std. gesetzt']);
    expect(plan.newExercises[0]).toMatchObject({ type: 'distance_duration', category: 'cardio' });
  });

  it('leaves out implausible reps and weights, keeps the rest of the workout', () => {
    const w = parseStrongWorkouts(
      csv(
        WORKOUT_HEADER,
        row('2026-10-24 14:22:54', TZ, 'X', 3600, '', 'Leg Press', 1, 100, 102, '', '', '', '', ''),
        row('2026-10-24 14:22:54', TZ, 'X', 3600, '', 'Hip Adductor (Machine)', 1, 653, 10, '', '', '', '', ''),
        row('2026-10-24 14:22:54', TZ, 'X', 3600, '', 'Leg Press', 2, 100, 10, '', '', '', '', ''),
      ),
    );
    const plan = buildPlan({ workouts: w }, library, none());
    expect(plan.suspicious).toEqual(['24.10.2026 Leg Press, Satz 1: 102 Wdh.', '24.10.2026 Hip Adductor (Machine), Satz 1: 653 kg']);
    const ex = plan.workouts[0].exercises;
    expect(ex).toHaveLength(1); // the adductor exercise had only the typo set
    expect(ex[0].sets).toHaveLength(1);
    expect(ex[0].sets[0]).toMatchObject({ reps: 10, weightKg: 100 });
    expect(plan.newExercises).toEqual([]); // no custom exercise for something that was left out
    expect(plan.warnings).toHaveLength(1);
  });

  it('two identical workouts at the same second keep distinct ids', () => {
    const one = parseStrongWorkouts(csv(WORKOUT_HEADER, row('2026-10-24 14:22:54', TZ, 'X', 60, '', 'Push Up', 1, 0, 5, '', '', '', '', '')))[0];
    const plan = buildPlan({ workouts: [one, { ...one }] }, library, none());
    expect(new Set(plan.workouts.map((w) => w.id)).size).toBe(2);
  });
});

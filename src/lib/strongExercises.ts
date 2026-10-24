import type { Equipment } from '../db/types';
import type { MuscleId } from './muscleMap';

/**
 * How exercise names of a Strong export are handled:
 *  - a string: the exact name of an equivalent exercise in this app's library
 *  - an object: no equivalent, a custom exercise is created with these details
 * Names not listed here become custom exercises with equipment guessed from the "(…)" suffix.
 * Only clear equivalents are mapped, so history and records are never mixed between different exercises.
 */
export type StrongEntry =
  | string
  | { equipment: Equipment; muscles: MuscleId[]; secondary?: MuscleId[]; category?: string };

const machine = (muscles: MuscleId[], secondary?: MuscleId[]): StrongEntry => ({ equipment: 'machine', muscles, secondary });
const cable = (muscles: MuscleId[]): StrongEntry => ({ equipment: 'cable', muscles });

export const STRONG_EXERCISES: Record<string, StrongEntry> = {
  // --- equivalents in the library
  'Lat Pulldown (Cable)': 'Wide-Grip Lat Pulldown',
  'Crunch (Machine)': 'Ab Crunch Machine',
  'Back Extension': 'Hyperextensions (Back Extensions)',
  'Bench Press (Dumbbell)': 'Dumbbell Bench Press',
  'Chest Dip': 'Dips - Chest Version',
  'Chest Press (Machine)': 'Machine Bench Press',
  'Seated Row (Cable)': 'Seated Cable Rows',
  'Leg Press': 'Leg Press',
  'Incline Bench Press (Dumbbell)': 'Incline Dumbbell Press',
  'Bench Press (Barbell)': 'Barbell Bench Press - Medium Grip',
  'Push Up': 'Pushups',
  'Seated Leg Curl (Machine)': 'Seated Leg Curl',
  'Triceps Pushdown (Cable - Straight Bar)': 'Triceps Pushdown',
  'Leg Extension (Machine)': 'Leg Extensions',
  'Rowing (Machine)': 'Rowing, Stationary',
  'Hip Adductor (Machine)': 'Thigh Adductor',
  'Hip Abductor (Machine)': 'Thigh Abductor',
  'Preacher Curl (Barbell)': 'Preacher Curl',
  'Pull Up': 'Pullups',
  'Incline Bench Press (Barbell)': 'Barbell Incline Bench Press - Medium Grip',
  'Bicep Curl (Cable)': 'Standing Biceps Cable Curl',
  Crunch: 'Crunches',
  'Lateral Raise (Dumbbell)': 'Side Lateral Raise',
  'Pec Deck (Machine)': 'Butterfly',
  'Reverse Fly (Machine)': 'Reverse Machine Flyes',
  'Bicep Curl (Dumbbell)': 'Dumbbell Bicep Curl',
  'Seated Calf Raise (Machine)': 'Seated Calf Raise',
  'Incline Curl (Dumbbell)': 'Alternate Incline Dumbbell Curl',
  'Shoulder Press (Machine)': 'Machine Shoulder (Military) Press',
  'Hammer Curl (Cable)': 'Cable Hammer Curls - Rope Attachment',
  'Calf Press on Leg Press': 'Calf Press On The Leg Press Machine',
  'Shrug (Dumbbell)': 'Dumbbell Shrug',
  'Squat (Barbell)': 'Barbell Squat',
  'Ab Wheel': 'Ab Roller',
  'Hip Thrust (Barbell)': 'Barbell Hip Thrust',
  'Preacher Curl (Machine)': 'Machine Preacher Curls',
  'Triceps Extension (Machine)': 'Machine Triceps Extension',
  'Lying Leg Curl (Machine)': 'Lying Leg Curls',
  'Bicep Curl (Barbell)': 'Barbell Curl',
  'Shrug (Barbell)': 'Barbell Shrug',
  'Face Pull (Cable)': 'Face Pull',
  'Incline Bench Press (Smith Machine)': 'Smith Machine Incline Bench Press',

  // --- no clear equivalent: custom exercises
  'Back Extension (Machine)': machine(['lower back']),
  'Lateral Raise (Cable)': cable(['shoulders']),
  'Incline Chest Press (Machine)': machine(['chest'], ['shoulders', 'triceps']),
  Nacken: machine(['neck']),
  'Bicep Curl (Machine)': machine(['biceps']),
  'Triceps Extension (Cable)': cable(['triceps']),
  'Chest Fly': { equipment: 'other', muscles: ['chest'] },
  'Lateral Raise (Machine)': machine(['shoulders']),
  'Cable flies': cable(['chest']),
  'Calfs schräge squatmaschine': machine(['calves']),
  'Lat Pulldown (Machine)': machine(['lats']),
  'Low Row (Maschine)': machine(['middle back'], ['lats']),
  'Topfit Beinbeuger(hebel)': machine(['hamstrings']),
  'Topfit leg extention (hebel)': machine(['quadriceps']),
  'Iso-Lateral Row (Machine)': machine(['middle back'], ['lats']),
  'Wide (decline) Bench Press': { equipment: 'other', muscles: ['chest'], secondary: ['triceps', 'shoulders'] },
  'Seated Row (Machine)': machine(['middle back'], ['lats']),
  'Seated Leg Press (Machine)': machine(['quadriceps'], ['glutes']),
  'Calf Press on Seated Leg Press': machine(['calves']),
  'Tricep Pushdown Cable (einarmig)': cable(['triceps']),
  Laufband: { equipment: 'machine', muscles: [], category: 'cardio' },
  'Butterfly Rücken': machine(['middle back'], ['shoulders']),
  'Shoulder Press (Plate Loaded)': machine(['shoulders'], ['triceps']),
  'Kneeling Leg Curls': machine(['hamstrings']),
  'Iso-Lateral Chest Press (Machine)': machine(['chest'], ['triceps']),
  'Front Raise (Cable)': cable(['shoulders']),
  'Seated Wide-Grip Row (Cable)': cable(['middle back']),
  'Triceps Extension': { equipment: 'other', muscles: ['triceps'] },
  'Romanian Deadlift (Dumbbell)': { equipment: 'dumbbell', muscles: ['hamstrings'], secondary: ['glutes', 'lower back'] },
  'Row Maschine (hebel)': machine(['middle back'], ['lats']),
  'Pull Up (Assisted)': machine(['lats'], ['biceps']),
  'Torso Rotation (Machine)': machine(['abdominals']),
  'Seated Palms Up Wrist Curl (Dumbbell)': { equipment: 'dumbbell', muscles: ['forearms'] },
  Aerobics: { equipment: 'none', muscles: [], category: 'cardio' },
  'Upper Back (Maschine)': machine(['middle back']),
};

/** Equipment guess from the "(Dumbbell)" style suffix Strong appends to names. */
export function guessEquipment(name: string): Equipment {
  const m = name.match(/\(([^)]*)\)\s*$/);
  const s = (m?.[1] ?? '').toLowerCase();
  if (/smith|machine|maschine|hebel|plate/.test(s)) return 'machine';
  if (s.includes('dumbbell')) return 'dumbbell';
  if (s.includes('barbell')) return 'barbell';
  if (s.includes('cable')) return 'cable';
  if (s.includes('kettlebell')) return 'kettlebell';
  if (s.includes('band')) return 'band';
  return m ? 'other' : 'none';
}

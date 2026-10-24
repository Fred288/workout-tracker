import type { Equipment, ExerciseType, Level } from '../db/types';

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  none: 'Ohne Geräte',
  barbell: 'Langhantel',
  dumbbell: 'Kurzhantel',
  machine: 'Maschine',
  cable: 'Kabelzug',
  band: 'Bänder',
  kettlebell: 'Kettlebell',
  other: 'Sonstiges',
};

export const TYPE_LABELS: Record<ExerciseType, string> = {
  weight_reps: 'Gewicht × Wiederholungen',
  bodyweight_reps: 'Körpergewicht',
  assisted_bodyweight: 'Assistiertes Körpergewicht',
  duration: 'Dauer',
  distance_duration: 'Distanz und Dauer',
};

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: 'Anfänger',
  intermediate: 'Fortgeschritten',
  expert: 'Experte',
};

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Kraft',
  stretching: 'Dehnen',
  plyometrics: 'Plyometrie',
  strongman: 'Strongman',
  powerlifting: 'Powerlifting',
  cardio: 'Cardio',
  'olympic weightlifting': 'Gewichtheben',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

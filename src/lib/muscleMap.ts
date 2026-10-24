export const MUSCLES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export type MuscleId = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<MuscleId, string> = {
  abdominals: 'Bauch',
  abductors: 'Abduktoren',
  adductors: 'Adduktoren',
  biceps: 'Bizeps',
  calves: 'Waden',
  chest: 'Brust',
  forearms: 'Unterarme',
  glutes: 'Gesäß',
  hamstrings: 'Beinbeuger',
  lats: 'Latissimus',
  'lower back': 'Unterer Rücken',
  'middle back': 'Mittlerer Rücken',
  neck: 'Nacken',
  quadriceps: 'Quadrizeps',
  shoulders: 'Schultern',
  traps: 'Trapez',
  triceps: 'Trizeps',
};

export function isMuscleId(name: string): name is MuscleId {
  return (MUSCLES as readonly string[]).includes(name);
}

export function muscleLabel(name: string): string {
  return isMuscleId(name) ? MUSCLE_LABELS[name] : name;
}

/** Muscles sorted by their German label, for pickers and filters. */
export const MUSCLES_BY_LABEL: MuscleId[] = [...MUSCLES].sort((a, b) =>
  MUSCLE_LABELS[a].localeCompare(MUSCLE_LABELS[b], 'de'),
);

export type Equipment =
  | 'none'
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'band'
  | 'kettlebell'
  | 'other';
export type ExerciseType =
  | 'weight_reps'
  | 'bodyweight_reps'
  | 'assisted_bodyweight'
  | 'duration'
  | 'distance_duration';
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';
export type Level = 'beginner' | 'intermediate' | 'expert';

export interface Exercise {
  id: string; // e.g. "Barbell_Bench_Press" (seed) or uuid (custom)
  name: string;
  nameDe?: string;
  equipment: Equipment;
  type: ExerciseType;
  category?: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  instructionsDe?: string[];
  images: string[]; // paths relative to BASE_URL + 'exercises/'
  illustrations?: string[]; // line drawings (start, end), relative to BASE_URL; preferred over images
  level?: Level;
  isCustom: boolean;
}

export interface WorkoutSet {
  id: string;
  type: SetType;
  reps?: number;
  weightKg?: number; // for bodyweight_reps = added weight
  durationSec?: number;
  distanceM?: number; // for distance_duration
  rpe?: number;
  completed: boolean;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  order: number;
  supersetGroup?: number;
  note?: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  name: string;
  startedAt: number; // epoch ms
  finishedAt?: number; // undefined = active
  note?: string;
  exercises: WorkoutExercise[];
  templateId?: string;
}

export interface TemplateExercise extends Omit<WorkoutExercise, 'sets'> {
  sets: { type: SetType; reps?: number; weightKg?: number; durationSec?: number; distanceM?: number }[];
}

export interface Template {
  id: string;
  name: string;
  exercises: TemplateExercise[];
}

export interface BodyMeasurement {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  bodyFatPct?: number;
}

export interface Profile {
  id: 'me';
  name: string;
  birthYear?: number;
  heightCm?: number;
  gender?: 'female' | 'male' | 'diverse';
  unit: 'kg' | 'lb';
  targetWeightKg?: number;
  workoutsPerWeekGoal: number;
}

export interface MetaEntry {
  key: string;
  value: string;
}

export const DEFAULT_PROFILE: Profile = {
  id: 'me',
  name: '',
  unit: 'kg',
  workoutsPerWeekGoal: 3,
};

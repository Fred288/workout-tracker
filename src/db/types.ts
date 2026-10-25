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
export type Sport = 'run' | 'bike' | 'swim' | 'strength';
/** 'brick' = bike directly followed by a run. */
export type WorkoutSport = Sport | 'brick';
export type Zone = 1 | 2 | 3 | 4 | 5;

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
  sport?: Sport; // set for endurance exercises
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
  zone?: Zone;
  avgHr?: number; // bpm
  maxHr?: number; // bpm
  avgPowerW?: number;
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
  sport?: WorkoutSport;
  plannedSessionId?: string;
}

export interface TemplateExercise extends Omit<WorkoutExercise, 'sets'> {
  sets: { type: SetType; reps?: number; weightKg?: number; durationSec?: number; distanceM?: number; zone?: Zone }[];
}

export interface Template {
  id: string;
  name: string;
  sport?: WorkoutSport;
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
  // Endurance; zones are derived from these, never stored.
  maxHr?: number;
  restingHr?: number;
  thresholdHr?: number;
  ftpW?: number;
}

export type GoalType = '5k' | '10k' | 'half' | 'marathon' | 'sprint' | 'olympic' | '70.3' | 'ironman';
export type GoalPriority = 'A' | 'B' | 'C';

export interface Goal {
  id: string;
  type: GoalType;
  targetDate: string; // YYYY-MM-DD, drives backward planning
  targetTimeSec?: number;
  raceName?: string; // a concrete race can be added later
  /** Recent performance all paces are derived from (Runna style). */
  referencePerformance?: { distanceM: number; timeSec: number; date?: string };
  priority: GoalPriority;
  createdAt: number;
}

export type PlanPhase = 'base' | 'build' | 'peak' | 'taper' | 'race';

export interface PlanWeek {
  index: number; // 0-based
  startDate: string; // YYYY-MM-DD (Monday)
  phase: PlanPhase;
  isRecovery: boolean;
}

/** 0 = Monday ... 6 = Sunday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Plan {
  id: string;
  goalId: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  level: Level;
  availability: Partial<Record<Weekday, Sport[]>>;
  hoursPerWeek?: number;
  weeks: PlanWeek[];
  createdAt: number;
  archivedAt?: number;
}

export type SessionKind = 'easy' | 'long' | 'recovery' | 'tempo' | 'intervals' | 'brick' | 'strength' | 'race';
export type StepIntensity = 'warmup' | 'easy' | 'steady' | 'tempo' | 'threshold' | 'interval' | 'recovery' | 'cooldown';

export interface SessionStep {
  repeat: number; // 1 = single block
  distanceM?: number;
  durationSec?: number;
  intensity: StepIntensity;
  zone?: Zone;
  note?: string;
}

export interface PlannedSession {
  id: string;
  planId: string;
  weekIndex: number;
  date: string; // YYYY-MM-DD, may be moved
  sport: WorkoutSport;
  kind: SessionKind;
  title?: string;
  targetDurationSec?: number;
  targetDistanceM?: number;
  zone?: Zone;
  steps?: SessionStep[];
  /** Only "skipped" is stored; "done" = a workout with this plannedSessionId exists. */
  skippedAt?: number;
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

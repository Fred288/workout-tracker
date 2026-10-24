import type { ExerciseType, Workout, WorkoutSet } from '../db/types';
import { isCountingSet, setVolume } from './stats';

// Records and per-exercise statistics, always derived from the stored sets.
// Rules (see records.test.ts): only finished workouts and completed sets; warm-ups never count;
// on a tie the earlier set keeps the record.

export type RecordKind =
  | 'maxWeight'
  | 'maxReps'
  | 'bestSetVolume'
  | 'best1RM'
  | 'longestDuration'
  | 'longestDistance'
  | 'leastAssistance';

export interface RecordValue {
  value: number;
  set: WorkoutSet;
  workoutId: string;
  date: number;
}

export type ExerciseRecords = Partial<Record<RecordKind, RecordValue>>;

/** Which records exist per exercise type, in display and badge order. */
export const RECORD_KINDS: Record<ExerciseType, RecordKind[]> = {
  weight_reps: ['maxWeight', 'maxReps', 'bestSetVolume', 'best1RM'],
  bodyweight_reps: ['maxWeight', 'maxReps'],
  assisted_bodyweight: ['leastAssistance', 'maxReps'],
  duration: ['longestDuration'],
  distance_duration: ['longestDistance', 'longestDuration'],
};

/** Epley: weight × (1 + reps / 30); one rep is the weight itself. */
export function estimate1RM(weightKg: number, reps: number): number {
  if (!weightKg || !reps || weightKg <= 0 || reps <= 0) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

function metric(kind: RecordKind, s: WorkoutSet): number | undefined {
  const w = s.weightKg ?? 0;
  const r = s.reps ?? 0;
  switch (kind) {
    case 'maxWeight':
      return w > 0 && r >= 1 ? w : undefined;
    case 'maxReps':
      return r >= 1 ? r : undefined;
    case 'bestSetVolume':
      return w > 0 && r > 0 ? w * r : undefined;
    case 'best1RM': {
      const e = estimate1RM(w, r);
      return e > 0 ? e : undefined;
    }
    case 'longestDuration':
      return s.durationSec && s.durationSec > 0 ? s.durationSec : undefined;
    case 'longestDistance':
      return s.distanceM && s.distanceM > 0 ? s.distanceM : undefined;
    case 'leastAssistance':
      return r >= 1 ? w : undefined; // no weight entered = no assistance
  }
}

const isBetter = (kind: RecordKind, a: number, b: number) => (kind === 'leastAssistance' ? a < b : a > b);

const finishedAsc = (workouts: Workout[]) =>
  workouts.filter((w) => !!w.finishedAt).sort((a, b) => a.startedAt - b.startedAt);

export interface ExerciseSession {
  workoutId: string;
  date: number;
  sets: WorkoutSet[]; // completed sets, warm-ups included for display
}

/** Finished sessions of one exercise, newest first; repeated entries in one workout are merged. */
export function exerciseSessions(workouts: Workout[], exerciseId: string): ExerciseSession[] {
  return finishedAsc(workouts)
    .reverse()
    .map((w) => ({
      workoutId: w.id,
      date: w.startedAt,
      sets: w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((s) => s.completed)),
    }))
    .filter((x) => x.sets.length > 0);
}

export function exerciseRecords(workouts: Workout[], exerciseId: string, type: ExerciseType): ExerciseRecords {
  const kinds = RECORD_KINDS[type];
  const out: ExerciseRecords = {};
  for (const session of exerciseSessions(workouts, exerciseId).reverse()) {
    for (const set of session.sets) {
      if (!isCountingSet(set)) continue;
      for (const kind of kinds) {
        const value = metric(kind, set);
        if (value === undefined) continue;
        const cur = out[kind];
        if (!cur || isBetter(kind, value, cur.value)) {
          out[kind] = { value, set, workoutId: session.workoutId, date: session.date };
        }
      }
    }
  }
  return out;
}

export interface SeriesPoint {
  date: number;
  workoutId: string;
  maxWeight: number;
  best1RM: number;
  volume: number;
  maxReps: number;
  maxDuration: number;
  maxDistance: number;
}

/** One point per session with working sets, oldest first (for the charts). */
export function sessionSeries(workouts: Workout[], exerciseId: string): SeriesPoint[] {
  return exerciseSessions(workouts, exerciseId)
    .reverse()
    .map((session) => {
      const sets = session.sets.filter(isCountingSet);
      const max = (f: (s: WorkoutSet) => number) => sets.reduce((m, s) => Math.max(m, f(s)), 0);
      return {
        date: session.date,
        workoutId: session.workoutId,
        count: sets.length,
        maxWeight: max((s) => s.weightKg ?? 0),
        best1RM: max((s) => estimate1RM(s.weightKg ?? 0, s.reps ?? 0)),
        volume: sets.reduce((v, s) => v + setVolume(s), 0),
        maxReps: max((s) => s.reps ?? 0),
        maxDuration: max((s) => s.durationSec ?? 0),
        maxDistance: max((s) => s.distanceM ?? 0),
      };
    })
    .filter((p) => p.count > 0)
    .map(({ count: _count, ...p }) => p);
}

export interface WorkoutRecord {
  exerciseId: string;
  kinds: RecordKind[];
}

/**
 * Records set in one workout, compared with earlier workouts only. The first session of an
 * exercise sets no badges, and ties are not records.
 */
export function workoutRecords(
  workouts: Workout[],
  workoutId: string,
  types: Map<string, ExerciseType>,
): WorkoutRecord[] {
  const target = workouts.find((w) => w.id === workoutId);
  if (!target?.finishedAt) return [];
  const earlier = workouts.filter((w) => w.id !== target.id && w.startedAt < target.startedAt);
  const result: WorkoutRecord[] = [];
  const seen = new Set<string>();
  for (const e of target.exercises) {
    if (seen.has(e.exerciseId)) continue;
    seen.add(e.exerciseId);
    const type = types.get(e.exerciseId) ?? 'weight_reps';
    const before = exerciseRecords(earlier, e.exerciseId, type);
    if (!Object.keys(before).length) continue; // first session
    const now = exerciseRecords([target], e.exerciseId, type);
    const kinds = RECORD_KINDS[type].filter((k) => {
      const n = now[k];
      const b = before[k];
      return !!n && (!b || isBetter(k, n.value, b.value));
    });
    if (kinds.length) result.push({ exerciseId: e.exerciseId, kinds });
  }
  return result;
}

export interface ExerciseRecordRow {
  exerciseId: string;
  maxWeight?: number;
  maxReps?: number;
  best1RM?: number;
  longestDuration?: number;
  longestDistance?: number;
  leastAssistance?: number;
  sessions: number;
  lastDate: number;
}

/** One row per trained exercise for the global records table, most recently trained first. */
export function allExerciseRecords(workouts: Workout[], types: Map<string, ExerciseType>): ExerciseRecordRow[] {
  const ids = new Set(finishedAsc(workouts).flatMap((w) => w.exercises.map((e) => e.exerciseId)));
  const rows: ExerciseRecordRow[] = [];
  for (const id of ids) {
    const series = sessionSeries(workouts, id);
    if (!series.length) continue;
    const r = exerciseRecords(workouts, id, types.get(id) ?? 'weight_reps');
    rows.push({
      exerciseId: id,
      maxWeight: r.maxWeight?.value,
      maxReps: r.maxReps?.value,
      best1RM: r.best1RM?.value,
      longestDuration: r.longestDuration?.value,
      longestDistance: r.longestDistance?.value,
      leastAssistance: r.leastAssistance?.value,
      sessions: series.length,
      lastDate: series.at(-1)!.date,
    });
  }
  return rows.sort((a, b) => b.lastDate - a.lastDate);
}

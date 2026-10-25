import type { Exercise, Goal, GoalType, PlannedSession, Workout, WorkoutSet, Zone } from '../db/types';
import { addDays, daysBetween } from './dates';
import { sessionStatus } from './plan';
import { startOfWeek } from './profile';
import { partsOf, blocksSeconds } from './sports';
import { RACE_DISTANCES, predictRaces, vdot } from './zones';

// Dashboard numbers for running. Everything is derived from the logged sets and the plan,
// nothing is stored twice (see CLAUDE.md).

export interface RunSet {
  workoutId: string;
  startedAt: number;
  set: WorkoutSet;
}

/** Completed sets of running exercises of finished workouts. */
export function runSets(workouts: Workout[], exercises: ReadonlyMap<string, Exercise>): RunSet[] {
  const out: RunSet[] = [];
  for (const w of workouts) {
    if (!w.finishedAt) continue;
    for (const e of w.exercises) {
      if (exercises.get(e.exerciseId)?.sport !== 'run') continue;
      for (const set of e.sets) if (set.completed) out.push({ workoutId: w.id, startedAt: w.startedAt, set });
    }
  }
  return out;
}

export interface WeekVolume {
  weekStart: number; // Monday 00:00 local, epoch ms
  durationSec: number;
  distanceM: number;
  runs: number;
}

/** Running time and distance per calendar week for the last `weeks` weeks, oldest first. */
export function weeklyRunVolume(sets: RunSet[], now: number, weeks = 12): WeekVolume[] {
  const current = startOfWeek(now);
  const starts = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(current);
    d.setDate(d.getDate() - 7 * (weeks - 1 - i));
    return d.getTime();
  });
  const rows: (WeekVolume & { ids: Set<string> })[] = starts.map((weekStart) => ({ weekStart, durationSec: 0, distanceM: 0, runs: 0, ids: new Set() }));
  for (const r of sets) {
    const ws = startOfWeek(r.startedAt);
    const row = rows.find((x) => x.weekStart === ws);
    if (!row) continue;
    row.durationSec += r.set.durationSec ?? 0;
    row.distanceM += r.set.distanceM ?? 0;
    row.ids.add(r.workoutId);
  }
  return rows.map(({ ids, ...x }) => ({ ...x, runs: ids.size }));
}

/** Planned time of a session from its blocks; distance-only steps count at 6:00 per km. */
export function plannedSeconds(s: Pick<PlannedSession, 'blocks' | 'kind'> & Partial<Pick<PlannedSession, 'parts' | 'sport'>>): number {
  if (s.kind === 'race') return 0;
  return partsOf(s).reduce((n, p) => n + blocksSeconds(p.sport, p.blocks), 0);
}

export interface WeekAdherence {
  weekIndex: number;
  weekStart: string;
  planned: number; // sessions that are not skipped
  done: number;
  skipped: number;
  plannedSec: number;
  /** done / planned, undefined for weeks without planned sessions */
  share?: number;
}

/** Plan fulfilment per week up to and including the current week. Future weeks are left out. */
export function weeklyAdherence(
  weeks: { index: number; startDate: string }[],
  sessions: PlannedSession[],
  done: { has(id: string): boolean },
  today: string,
): WeekAdherence[] {
  return weeks
    .filter((w) => w.startDate <= today)
    .map((w) => {
      const inWeek = sessions.filter((s) => s.date >= w.startDate && s.date <= addDays(w.startDate, 6));
      const skipped = inWeek.filter((s) => sessionStatus(s, done, today) === 'skipped').length;
      const counted = inWeek.filter((s) => sessionStatus(s, done, today) !== 'skipped');
      // Sessions still ahead in the current week are planned but not yet due.
      const planned = counted.length;
      const doneCount = counted.filter((s) => done.has(s.id)).length;
      return {
        weekIndex: w.index,
        weekStart: w.startDate,
        planned,
        done: doneCount,
        skipped,
        plannedSec: counted.reduce((n, s) => n + plannedSeconds(s), 0),
        share: planned ? doneCount / planned : undefined,
      };
    });
}

export interface ZoneDistribution {
  seconds: Record<Zone, number>;
  /** time of sets without a zone, not part of the shares */
  unknownSec: number;
  knownSec: number;
  /** share of zone 1 and 2 of the known time, undefined without data */
  easyShare?: number;
}

/** Time per zone. Sets without a zone are reported separately. */
export function zoneDistribution(sets: RunSet[], sinceMs = 0): ZoneDistribution {
  const seconds: Record<Zone, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let unknownSec = 0;
  for (const r of sets) {
    if (r.startedAt < sinceMs || !r.set.durationSec) continue;
    if (r.set.zone) seconds[r.set.zone] += r.set.durationSec;
    else unknownSec += r.set.durationSec;
  }
  const knownSec = seconds[1] + seconds[2] + seconds[3] + seconds[4] + seconds[5];
  return { seconds, unknownSec, knownSec, easyShare: knownSec ? (seconds[1] + seconds[2]) / knownSec : undefined };
}

export interface PacePoint {
  at: number; // workout start, epoch ms
  paceSecPerKm: number;
  distanceM: number;
}

/**
 * Pace of easy running over time (same effort, so the trend shows fitness): per workout the
 * zone 2 sets together, only when they cover at least `minDistM`.
 */
export function easyPaceTrend(sets: RunSet[], zone: Zone = 2, minDistM = 2000): PacePoint[] {
  const byWorkout = new Map<string, { at: number; dist: number; sec: number }>();
  for (const r of sets) {
    if (r.set.zone !== zone || !r.set.distanceM || !r.set.durationSec) continue;
    const x = byWorkout.get(r.workoutId) ?? { at: r.startedAt, dist: 0, sec: 0 };
    x.dist += r.set.distanceM;
    x.sec += r.set.durationSec;
    byWorkout.set(r.workoutId, x);
  }
  return [...byWorkout.values()]
    .filter((x) => x.dist >= minDistM)
    .map((x) => ({ at: x.at, paceSecPerKm: (x.sec / x.dist) * 1000, distanceM: x.dist }))
    .sort((a, b) => a.at - b.at);
}

export interface LongestRun {
  workoutId: string;
  startedAt: number;
  distanceM: number;
  durationSec: number;
}

/** The workout with the most running distance (all running sets added up). */
export function longestRun(sets: RunSet[]): LongestRun | undefined {
  const by = new Map<string, LongestRun>();
  for (const r of sets) {
    const x = by.get(r.workoutId) ?? { workoutId: r.workoutId, startedAt: r.startedAt, distanceM: 0, durationSec: 0 };
    x.distanceM += r.set.distanceM ?? 0;
    x.durationSec += r.set.durationSec ?? 0;
    by.set(r.workoutId, x);
  }
  return [...by.values()].reduce<LongestRun | undefined>((best, x) => (x.distanceM > (best?.distanceM ?? 0) ? x : best), undefined);
}

export interface BestEffort {
  workoutId: string;
  startedAt: number;
  distanceM: number;
  timeSec: number;
  vdot: number;
}

/** The set with the highest VDOT among sets of at least `minDistM` (a hard continuous run). */
export function bestEffort(sets: RunSet[], minDistM = 3000): BestEffort | undefined {
  let best: BestEffort | undefined;
  for (const r of sets) {
    const { distanceM, durationSec } = r.set;
    if (!distanceM || !durationSec || distanceM < minDistM) continue;
    const v = vdot(distanceM, durationSec);
    if (v === undefined || v < 20 || v > 90) continue;
    if (!best || v > best.vdot) best = { workoutId: r.workoutId, startedAt: r.startedAt, distanceM, timeSec: durationSec, vdot: v };
  }
  return best;
}

const GOAL_DISTANCE: Partial<Record<GoalType, (typeof RACE_DISTANCES)[number]['id']>> = {
  '5k': '5k',
  '10k': '10k',
  half: 'half',
  marathon: 'marathon',
};

export interface GoalCheck {
  predictedSec: number;
  targetSec?: number;
  /** predicted - target; negative = faster than the goal */
  diffSec?: number;
  status?: 'ahead' | 'close' | 'behind';
  uncertain: boolean;
}

/** Predicted time over the goal distance from the reference run, compared with the target time. */
export function goalCheck(goal: Pick<Goal, 'type' | 'targetTimeSec'>, reference?: { distanceM: number; timeSec: number }): GoalCheck | undefined {
  const id = GOAL_DISTANCE[goal.type];
  if (!id || !reference) return undefined;
  const p = predictRaces(reference).find((x) => x.id === id);
  if (!p) return undefined;
  const target = goal.targetTimeSec;
  const diff = target ? p.timeSec - target : undefined;
  return {
    predictedSec: p.timeSec,
    targetSec: target,
    diffSec: diff,
    status: diff === undefined ? undefined : diff <= 0 ? 'ahead' : diff <= target! * 0.02 ? 'close' : 'behind',
    uncertain: p.uncertain,
  };
}

/** The next open session from today on (including today), or undefined. */
export function nextSession(sessions: PlannedSession[], done: { has(id: string): boolean }, today: string): PlannedSession | undefined {
  return sessions
    .filter((s) => s.date >= today && sessionStatus(s, done, today) === 'open')
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

/** Days from today to the session (0 = today). */
export const daysUntil = (date: string, today: string) => daysBetween(today, date);

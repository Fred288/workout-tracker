import type { Exercise, Workout, WorkoutSport } from '../db/types';
import { startOfWeek } from './profile';
import type { RunSet } from './endurance';

// Per-sport dashboard numbers for triathlon training (swim, bike, run). Derived from the sets.

export const ENDURANCE_SPORTS = ['swim', 'bike', 'run'] as const;
export type EnduranceSport = (typeof ENDURANCE_SPORTS)[number];

export type SportSet = RunSet & { sport: EnduranceSport };

/** Completed sets of swim, bike and run exercises of finished workouts. */
export function enduranceSets(workouts: Workout[], exercises: ReadonlyMap<string, Exercise>): SportSet[] {
  const out: SportSet[] = [];
  for (const w of workouts) {
    if (!w.finishedAt) continue;
    for (const e of w.exercises) {
      const sport = exercises.get(e.exerciseId)?.sport as WorkoutSport | undefined;
      if (sport !== 'swim' && sport !== 'bike' && sport !== 'run') continue;
      for (const set of e.sets) if (set.completed) out.push({ workoutId: w.id, startedAt: w.startedAt, set, sport });
    }
  }
  return out;
}

export interface SportWeek {
  weekStart: number; // Monday 00:00 local, epoch ms
  sec: Record<EnduranceSport, number>;
  distanceM: Record<EnduranceSport, number>;
}

const zero = (): Record<EnduranceSport, number> => ({ swim: 0, bike: 0, run: 0 });

/** Time and distance per sport and calendar week for the last `weeks` weeks, oldest first. */
export function weeklySportVolume(sets: SportSet[], now: number, weeks = 12): SportWeek[] {
  const current = startOfWeek(now);
  const rows: SportWeek[] = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(current);
    d.setDate(d.getDate() - 7 * (weeks - 1 - i));
    return { weekStart: d.getTime(), sec: zero(), distanceM: zero() };
  });
  for (const r of sets) {
    const row = rows.find((x) => x.weekStart === startOfWeek(r.startedAt));
    if (!row) continue;
    row.sec[r.sport] += r.set.durationSec ?? 0;
    row.distanceM[r.sport] += r.set.distanceM ?? 0;
  }
  return rows;
}

export interface PowerPoint {
  at: number;
  watts: number;
  durationSec: number;
}

/** Average power per ride (time-weighted over the sets with power), oldest first. */
export function bikePowerTrend(sets: SportSet[], minSec = 600): PowerPoint[] {
  const byWorkout = new Map<string, { at: number; sec: number; ws: number }>();
  for (const r of sets) {
    if (r.sport !== 'bike' || !r.set.avgPowerW || !r.set.durationSec) continue;
    const x = byWorkout.get(r.workoutId) ?? { at: r.startedAt, sec: 0, ws: 0 };
    x.sec += r.set.durationSec;
    x.ws += r.set.avgPowerW * r.set.durationSec;
    byWorkout.set(r.workoutId, x);
  }
  return [...byWorkout.values()]
    .filter((x) => x.sec >= minSec)
    .map((x) => ({ at: x.at, watts: Math.round(x.ws / x.sec), durationSec: x.sec }))
    .sort((a, b) => a.at - b.at);
}

export interface BestPower {
  watts: number;
  durationSec: number;
  startedAt: number;
}

/** Highest average power of a single set of at least `minSec` (default 20 min, the FTP test length). */
export function bestBikePower(sets: SportSet[], minSec = 1200): BestPower | undefined {
  let best: BestPower | undefined;
  for (const r of sets) {
    if (r.sport !== 'bike' || !r.set.avgPowerW || (r.set.durationSec ?? 0) < minSec) continue;
    if (!best || r.set.avgPowerW > best.watts) best = { watts: r.set.avgPowerW, durationSec: r.set.durationSec!, startedAt: r.startedAt };
  }
  return best;
}

/** Rough FTP estimate: 95 % of the best 20-minute power (Coggan). */
export const ftpFromBest = (watts: number) => Math.round(watts * 0.95);

export interface SwimPoint {
  at: number;
  secPer100m: number;
  distanceM: number;
}

/** Swim pace per session (all sets together) for sessions of at least `minDistM`, oldest first. */
export function swimPaceTrend(sets: SportSet[], minDistM = 400): SwimPoint[] {
  const byWorkout = new Map<string, { at: number; dist: number; sec: number }>();
  for (const r of sets) {
    if (r.sport !== 'swim' || !r.set.distanceM || !r.set.durationSec) continue;
    const x = byWorkout.get(r.workoutId) ?? { at: r.startedAt, dist: 0, sec: 0 };
    x.dist += r.set.distanceM;
    x.sec += r.set.durationSec;
    byWorkout.set(r.workoutId, x);
  }
  return [...byWorkout.values()]
    .filter((x) => x.dist >= minDistM)
    .map((x) => ({ at: x.at, secPer100m: (x.sec / x.dist) * 100, distanceM: x.dist }))
    .sort((a, b) => a.at - b.at);
}

/** Longest continuous swim set in metres. */
export function longestSwim(sets: SportSet[]): { distanceM: number; startedAt: number } | undefined {
  let best: { distanceM: number; startedAt: number } | undefined;
  for (const r of sets) {
    if (r.sport !== 'swim' || !r.set.distanceM) continue;
    if (!best || r.set.distanceM > best.distanceM) best = { distanceM: r.set.distanceM, startedAt: r.startedAt };
  }
  return best;
}

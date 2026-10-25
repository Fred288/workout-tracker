import type { PlannedSession, Workout, WorkoutSet } from '../db/types';
import type { ParsedActivity } from './activityFiles';
import { toIso } from './dates';
import { sessionStatus } from './plan';
import { SPORT_EXERCISE } from './sports';
import { zoneFromHr, type HrZones } from './zones';

export const SPORT_NAME = { run: 'Lauf', bike: 'Radfahren', swim: 'Schwimmen' } as const;

type ImportedSport = keyof typeof SPORT_NAME;

export function isImportable(a: ParsedActivity): a is ParsedActivity & { sport: ImportedSport } {
  return (a.sport === 'run' || a.sport === 'bike' || a.sport === 'swim') && a.durationSec > 0;
}

/** Stable id: importing the same file twice never creates a second workout. */
export const activityId = (a: Pick<ParsedActivity, 'source' | 'startedAt' | 'distanceM'>) =>
  `import-${a.source}-${a.startedAt}-${Math.round(a.distanceM)}`;

/**
 * Laps are worth keeping as sets when they differ (a structured interval workout). Evenly
 * sized laps (a lap per km) would only make noise.
 */
export function suggestUseLaps(a: Pick<ParsedActivity, 'laps'>): boolean {
  const laps = a.laps;
  if (laps.length < 2 || laps.length > 40) return false;
  const full = laps.slice(0, -1); // the last lap of an auto-lap activity is a remainder
  const d = full.map((l) => l.distanceM).filter((x) => x > 0);
  if (d.length < 2) return true;
  const median = [...d].sort((x, y) => x - y)[Math.floor(d.length / 2)];
  return d.some((x) => Math.abs(x - median) / median > 0.1);
}

export interface ImportOptions {
  useLaps: boolean;
  hrZones?: HrZones;
  plannedSessionId?: string;
  name?: string;
}

export function activityToWorkout(a: ParsedActivity & { sport: ImportedSport }, opts: ImportOptions): Workout {
  const id = activityId(a);
  const parts = opts.useLaps && a.laps.length > 1 ? a.laps : [a];
  const sets: WorkoutSet[] = parts.map((p, i) => ({
    id: `${id}-s${i}`,
    type: 'normal',
    ...(p.distanceM > 0 ? { distanceM: Math.round(p.distanceM) } : {}),
    durationSec: Math.round(p.durationSec),
    ...(p.avgHr ? { avgHr: p.avgHr, ...(opts.hrZones ? { zone: zoneFromHr(p.avgHr, opts.hrZones) } : {}) } : {}),
    ...(p.maxHr ? { maxHr: p.maxHr } : {}),
    ...(p.avgPowerW ? { avgPowerW: p.avgPowerW } : {}),
    completed: true,
  }));
  return {
    id,
    name: opts.name?.trim() || a.name || SPORT_NAME[a.sport],
    startedAt: a.startedAt,
    finishedAt: a.startedAt + Math.max(a.elapsedSec, a.durationSec) * 1000,
    sport: a.sport,
    ...(opts.plannedSessionId ? { plannedSessionId: opts.plannedSessionId } : {}),
    exercises: [{ id: `${id}-e`, exerciseId: SPORT_EXERCISE[a.sport], order: 0, sets }],
  };
}

/** Open planned sessions of the activity's day with the same sport, for linking. */
export function matchingSessions(
  a: Pick<ParsedActivity, 'startedAt' | 'sport'>,
  sessions: PlannedSession[],
  done: { has(id: string): boolean },
): PlannedSession[] {
  const day = toIso(new Date(a.startedAt));
  return sessions.filter((s) => s.date === day && s.sport === a.sport && s.kind !== 'race' && sessionStatus(s, done, day) !== 'done');
}

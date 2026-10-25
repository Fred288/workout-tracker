import type { Plan, PlannedSession, SessionKind, Weekday, Zone } from '../db/types';
import { addDays, daysBetween, weekdayIndex } from './dates';
import type { RunSet } from './endurance';
import { sessionStatus } from './plan';
import { ZONE_FRACTIONS, paceZones, timeForVdot, vdot, vdotForPace } from './zones';

// Plan adaptation in the style of Runna, always as a suggestion the user confirms:
// - missed key sessions can be moved to the next free run day,
// - a consistent pattern of runs faster or slower than the zones suggests a new reference time,
// - "not 100 %": a break skips the sessions and restarts the plan more gently afterwards,
// - a moved race date rebuilds the plan from today.

const KEY_KINDS: ReadonlySet<SessionKind> = new Set(['long', 'tempo', 'intervals']);
const HARD_KINDS: ReadonlySet<SessionKind> = new Set(['long', 'tempo', 'intervals', 'race']);

/** Missed key sessions older than this are not offered any more. */
export const RESCHEDULE_LOOKBACK_DAYS = 7;
/** How far ahead a missed session may move. */
export const RESCHEDULE_AHEAD_DAYS = 6;

export interface RescheduleSuggestion {
  sessionId: string;
  toDate: string;
  /** Easy run on the target day that gives way (gets skipped). */
  replacesId?: string;
}

/**
 * For every missed key session of the last week: the earliest run day from today on with no hard
 * session on it or next to it. An easy run on that day is replaced; an empty run day is used as
 * it is. Nothing is moved into the last two days before a race.
 */
export function rescheduleSuggestions(
  sessions: PlannedSession[],
  done: { has(id: string): boolean },
  runDays: Weekday[],
  today: string,
  raceDate?: string,
): RescheduleSuggestion[] {
  const status = (s: PlannedSession) => sessionStatus(s, done, today);
  const missed = sessions
    .filter((s) => KEY_KINDS.has(s.kind) && status(s) === 'missed' && daysBetween(s.date, today) <= RESCHEDULE_LOOKBACK_DAYS)
    .sort((a, b) => (a.kind === 'long' ? -1 : 0) - (b.kind === 'long' ? -1 : 0) || a.date.localeCompare(b.date));

  // Occupancy from today on, updated as suggestions are made.
  const active = sessions.filter((s) => s.date >= today && status(s) !== 'skipped');
  const hardDays = new Set(active.filter((s) => HARD_KINDS.has(s.kind)).map((s) => s.date));
  const doneDays = new Set(sessions.filter((s) => s.date >= today && done.has(s.id)).map((s) => s.date));
  const easyOn = new Map(active.filter((s) => s.kind === 'easy' && !done.has(s.id)).map((s) => [s.date, s.id]));
  const lastDay = raceDate ? addDays(raceDate, -2) : undefined;

  const out: RescheduleSuggestion[] = [];
  for (const m of missed) {
    for (let i = 0; i <= RESCHEDULE_AHEAD_DAYS; i++) {
      const d = addDays(today, i);
      if (lastDay && d > lastDay) break;
      if (!runDays.includes(weekdayIndex(d) as Weekday)) continue;
      if (doneDays.has(d) || hardDays.has(d) || hardDays.has(addDays(d, -1)) || hardDays.has(addDays(d, 1))) continue;
      const replacesId = easyOn.get(d);
      out.push({ sessionId: m.id, toDate: d, ...(replacesId ? { replacesId } : {}) });
      hardDays.add(d);
      easyOn.delete(d);
      break;
    }
  }
  return out;
}

export interface PaceSample {
  workoutId: string;
  startedAt: number;
  zone: Zone;
  paceSecPerKm: number;
  verdict: 'faster' | 'slower' | 'ok';
  /**
   * VDOT this pace would mean: at the fast end of the zone for faster runs, the slow end for
   * slower ones (conservative), the middle otherwise.
   */
  impliedVdot: number;
}

export interface PaceSuggestion {
  direction: 'faster' | 'slower';
  /** matching samples / samples looked at */
  matches: number;
  of: number;
  vdot: number;
  /** New time over the reference distance. */
  timeSec: number;
}

/** A pace counts as off when it is this much outside its zone. */
const PACE_TOLERANCE = 0.02;
export const PATTERN_SAMPLES = 5;
export const PATTERN_MIN_MATCHES = 3;
const PATTERN_MAX_AGE_DAYS = 42;

/**
 * One sample per workout: its longest set in zone 2-5 of at least 1 km, compared with that zone's
 * pace range. Zone 1 (warm-up, jog breaks) is too noisy to judge.
 */
export function paceSamples(sets: RunSet[], reference: { distanceM: number; timeSec: number; setAt?: number }, now: number): PaceSample[] {
  const v = vdot(reference.distanceM, reference.timeSec);
  if (v === undefined) return [];
  const zones = paceZones(v);
  const longest = new Map<string, RunSet>();
  for (const r of sets) {
    const { zone, distanceM, durationSec } = r.set;
    if (!zone || zone < 2 || !distanceM || distanceM < 1000 || !durationSec) continue;
    if (now - r.startedAt > PATTERN_MAX_AGE_DAYS * 86_400_000) continue;
    // Runs before the last change of the reference were judged against the old paces.
    if (reference.setAt !== undefined && r.startedAt <= reference.setAt) continue;
    const prev = longest.get(r.workoutId);
    if (!prev || distanceM > (prev.set.distanceM ?? 0)) longest.set(r.workoutId, r);
  }
  return [...longest.values()]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((r) => {
      const zone = r.set.zone!;
      const pace = (r.set.durationSec! / r.set.distanceM!) * 1000;
      const range = zones[zone];
      const verdict = pace < range.fast * (1 - PACE_TOLERANCE) ? 'faster' : pace > range.slow * (1 + PACE_TOLERANCE) ? 'slower' : 'ok';
      const [lo, hi] = ZONE_FRACTIONS[zone];
      const fraction = verdict === 'faster' ? hi : verdict === 'slower' ? lo : (lo + hi) / 2;
      return { workoutId: r.workoutId, startedAt: r.startedAt, zone, paceSecPerKm: pace, verdict, impliedVdot: vdotForPace(pace, fraction) } as PaceSample;
    });
}

/** One suggestion changes VDOT by at most this share, so paces move in small steps. */
const MAX_VDOT_STEP = 0.05;

/**
 * A pattern, not a single run: at least 3 of the last 5 samples off in the same direction.
 * The new VDOT is the median of those samples, at most 5 % away from the current one; the
 * reference distance stays.
 */
export function paceSuggestion(samples: PaceSample[], reference: { distanceM: number; timeSec: number }): PaceSuggestion | undefined {
  const recent = samples.slice(-PATTERN_SAMPLES);
  if (recent.length < PATTERN_MIN_MATCHES) return undefined;
  for (const direction of ['faster', 'slower'] as const) {
    const hits = recent.filter((s) => s.verdict === direction);
    if (hits.length < PATTERN_MIN_MATCHES) continue;
    const sorted = hits.map((s) => s.impliedVdot).sort((a, b) => a - b);
    const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const current = vdot(reference.distanceM, reference.timeSec)!;
    // Only suggest what points the same way as the pattern.
    if ((direction === 'faster' && median <= current) || (direction === 'slower' && median >= current)) continue;
    const next = Math.min(current * (1 + MAX_VDOT_STEP), Math.max(current * (1 - MAX_VDOT_STEP), median));
    return { direction, matches: hits.length, of: recent.length, vdot: next, timeSec: Math.round(timeForVdot(reference.distanceM, next)) };
  }
  return undefined;
}

/** Generator settings stored on a plan, undefined if the plan was never generated. */
export function planSettings(plan: Plan): { runDays: Weekday[]; longRunDay: Weekday; level: Plan['level']; baselineLongRunMin: number } | undefined {
  const runDays = Object.keys(plan.availability).map(Number) as Weekday[];
  if (plan.longRunDay === undefined || !runDays.length) return undefined;
  return { runDays: runDays.sort((a, b) => a - b), longRunDay: plan.longRunDay, level: plan.level, baselineLongRunMin: plan.baselineLongRunMin ?? 60 };
}

const longMinutes = (s: PlannedSession) =>
  (s.blocks ?? []).reduce((n, b) => n + b.repeat * b.steps.reduce((m, st) => m + (st.durationSec ?? 0), 0), 0) / 60;

/** Planned length of the latest long run before today (where the plan stands now). */
export function currentLongRunMin(sessions: PlannedSession[], today: string, fallback: number): number {
  const last = sessions
    .filter((s) => s.kind === 'long' && s.date < today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const min = last ? longMinutes(last) : 0;
  return min > 0 ? Math.round(min) : fallback;
}

/** After a break: 10 % less per started week off, at most 40 %, never below 20 min. */
export function baselineAfterBreak(longRunMin: number, daysOff: number): number {
  const weeks = Math.ceil(Math.max(0, daysOff) / 7);
  const factor = 1 - Math.min(0.4, 0.1 * weeks);
  return Math.max(20, Math.round((longRunMin * factor) / 5) * 5);
}

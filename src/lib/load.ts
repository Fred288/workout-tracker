import type { Exercise, GoalType, PlannedSession, Workout, WorkoutSet, Zone } from '../db/types';
import { addDays, daysBetween, toIso } from './dates';
import { DEFAULT_ZONE } from './runTemplates';
import { elapsedMs } from './runClock';
import { blocksSeconds, partsOf, stepSeconds } from './sports';
import { zoneFromHr, type HrZones } from './zones';

// Training load model ("Belastungspunkte"), modelled on TrainingPeaks' TSS / CTL / ATL / TSB but
// without the need for a power meter or heart rate strap:
//
//   points = hours x IF^2 x 100      (1 h at threshold = 100 points)
//
// The intensity factor IF of a set comes from the best data available, in this order:
//   1. power and FTP (cycling)       IF = power / FTP
//   2. heart rate and heart rate zones -> zone -> IF
//   3. the zone chosen on the set     -> IF
//   4. RPE 1-10                        IF = 0.45 + 0.055 x RPE
//   5. nothing: warm-up sets count as zone 1, other sets as zone 2
// Strength workouts add a flat 30 points per hour (at most two hours), so a heavy gym week
// still shows up as fatigue.
//
// Fitness (CTL) and fatigue (ATL) are exponentially weighted averages of the daily points over
// 42 and 7 days. Form (TSB) for a day is yesterday's fitness minus yesterday's fatigue. Every
// number is an estimate; the model needs about six weeks of history to settle.

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

/** Intensity factor in the middle of each zone. */
export const ZONE_IF: Record<Zone, number> = { 1: 0.55, 2: 0.7, 3: 0.82, 4: 0.95, 5: 1.08 };
const STRENGTH_POINTS_PER_HOUR = 30;
const STRENGTH_MAX_HOURS = 2;

export interface LoadContext {
  ftpW?: number;
  hrZones?: HrZones;
}

export type IfSource = 'power' | 'hr' | 'zone' | 'rpe' | 'default';

export function intensityFactor(set: WorkoutSet, ctx: LoadContext): { value: number; source: IfSource } {
  if (set.avgPowerW && ctx.ftpW && ctx.ftpW > 0) return { value: set.avgPowerW / ctx.ftpW, source: 'power' };
  if (set.avgHr && ctx.hrZones) return { value: ZONE_IF[zoneFromHr(set.avgHr, ctx.hrZones)], source: 'hr' };
  if (set.zone) return { value: ZONE_IF[set.zone], source: 'zone' };
  if (set.rpe && set.rpe >= 1 && set.rpe <= 10) return { value: 0.45 + 0.055 * set.rpe, source: 'rpe' };
  return { value: set.type === 'warmup' ? ZONE_IF[1] : ZONE_IF[2], source: 'default' };
}

export const points = (durationSec: number, intensity: number) => (durationSec / 3600) * intensity * intensity * 100;

export function setLoad(set: WorkoutSet, ctx: LoadContext): number {
  if (!set.completed || !set.durationSec || set.durationSec <= 0) return 0;
  return points(set.durationSec, intensityFactor(set, ctx).value);
}

/** Points of one finished workout: endurance sets by intensity, strength as a flat rate. */
export function workoutLoad(w: Workout, exercises: ReadonlyMap<string, Exercise>, ctx: LoadContext): number {
  if (!w.finishedAt) return 0;
  let endurance = 0;
  let hasStrength = false;
  for (const e of w.exercises) {
    const sport = exercises.get(e.exerciseId)?.sport;
    if (sport && sport !== 'strength') endurance += e.sets.reduce((n, s) => n + setLoad(s, ctx), 0);
    else if (e.sets.some((s) => s.completed)) hasStrength = true;
  }
  // Mixed workouts: the strength part is the time not covered by endurance sets.
  if (hasStrength) {
    const enduranceSec = w.exercises
      .filter((e) => {
        const sport = exercises.get(e.exerciseId)?.sport;
        return sport && sport !== 'strength';
      })
      .reduce((n, e) => n + e.sets.reduce((m, s) => m + (s.completed ? (s.durationSec ?? 0) : 0), 0), 0);
    const hours = Math.min(STRENGTH_MAX_HOURS, Math.max(0, elapsedMs(w, w.finishedAt) / 1000 - enduranceSec) / 3600);
    endurance += hours * STRENGTH_POINTS_PER_HOUR;
  }
  return endurance;
}

/** Points per local calendar day ("YYYY-MM-DD"). */
export function dailyLoads(workouts: Workout[], exercises: ReadonlyMap<string, Exercise>, ctx: LoadContext): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of workouts) {
    const load = workoutLoad(w, exercises, ctx);
    if (!load) continue;
    const day = toIso(new Date(w.startedAt));
    out.set(day, (out.get(day) ?? 0) + load);
  }
  return out;
}

/** Typical race intensity by distance (shorter races are run harder). */
const RACE_IF: Partial<Record<GoalType, number>> = { '5k': 1.05, '10k': 1.0, half: 0.92, marathon: 0.85, sprint: 0.95, olympic: 0.9 };
const PLAN_PACE_SEC_PER_KM = 360;

/**
 * Expected points of a planned session from its steps. Distance-only steps count at 6:00 per km
 * unless a race time is known.
 */
export function plannedLoad(s: Pick<PlannedSession, 'blocks' | 'kind'> & Partial<Pick<PlannedSession, 'parts' | 'sport'>>, opts: { goalType?: GoalType; raceTimeSec?: number } = {}): number {
  if (s.kind === 'race') {
    const intensity = (opts.goalType && RACE_IF[opts.goalType]) ?? 0.9;
    // Triathlon: every leg at race intensity, timed at planning speeds.
    if (s.parts?.length) return s.parts.reduce((n, p) => n + points(blocksSeconds(p.sport, p.blocks), intensity), 0);
    const distance = s.blocks?.[0]?.steps[0]?.distanceM ?? 0;
    const sec = opts.raceTimeSec ?? (distance / 1000) * PLAN_PACE_SEC_PER_KM;
    return points(sec, intensity);
  }
  return partsOf(s).reduce(
    (total, part) =>
      total +
      part.blocks.reduce(
        (n, b) =>
          n +
          b.repeat *
            b.steps.reduce((m, st) => m + points(stepSeconds(part.sport, st), ZONE_IF[st.zone ?? DEFAULT_ZONE[st.intensity]]), 0),
        0,
      ),
    0,
  );
}

export interface PmcDay {
  date: string;
  load: number;
  ctl: number; // fitness, after this day
  atl: number; // fatigue, after this day
  tsb: number; // form going into this day (yesterday's ctl - atl)
  projected: boolean;
}

const decay = (days: number) => 1 - Math.exp(-1 / days);

/**
 * Fitness, fatigue and form for every day from `from` to `to`. Days after `today` use
 * `planned` loads and are marked as projected. Starts at zero on `from`.
 */
export function performanceChart(
  actual: ReadonlyMap<string, number>,
  from: string,
  to: string,
  today: string,
  planned: ReadonlyMap<string, number> = new Map(),
): PmcDay[] {
  const out: PmcDay[] = [];
  const kc = decay(CTL_DAYS);
  const ka = decay(ATL_DAYS);
  let ctl = 0;
  let atl = 0;
  const days = daysBetween(from, to);
  for (let i = 0; i <= days; i++) {
    const date = addDays(from, i);
    const projected = date > today;
    const load = (projected ? planned.get(date) : actual.get(date)) ?? 0;
    const tsb = ctl - atl;
    ctl += (load - ctl) * kc;
    atl += (load - atl) * ka;
    out.push({ date, load, ctl, atl, tsb, projected });
  }
  return out;
}

export type FormState = 'overload' | 'building' | 'neutral' | 'fresh' | 'detraining';

/** Form ranges commonly used with TSB; race-ready is roughly +5 to +25. */
export function formState(tsb: number): FormState {
  if (tsb < -30) return 'overload';
  if (tsb < -10) return 'building';
  if (tsb <= 5) return 'neutral';
  if (tsb <= 25) return 'fresh';
  return 'detraining';
}

export const FORM_LABEL: Record<FormState, string> = {
  overload: 'Sehr müde, Überlastungsrisiko',
  building: 'Im Aufbau, müde',
  neutral: 'Ausgeglichen',
  fresh: 'Frisch, Wettkampfform',
  detraining: 'Sehr frisch, Fitness sinkt',
};

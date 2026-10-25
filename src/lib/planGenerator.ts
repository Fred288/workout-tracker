import type { GoalType, Level, PlanPhase, PlanWeek, PlannedSession, SessionBlock, SessionKind, Weekday } from '../db/types';
import { addDays, weekdayIndex } from './dates';
import { GOAL_LABEL, buildWeeks } from './plan';

// Rule-based running plan generator (no AI, no server). Everything is time based, so the plan
// works without paces or a GPS watch; paces follow in phase E5.
//
// Rules in short:
// - Weeks run from the plan start to the race week. Remaining weeks (from the current one) are
//   split into training weeks, taper weeks and the race week.
// - Training weeks: ~40 % base, ~40 % build, ~20 % peak. Every 3rd training week is a recovery
//   week (-20 %), except the last one before the taper.
// - Load factor p (1 = peak) rises linearly from the current long run to the peak long run, but
//   never more than 10 % from one training week to the next.
// - Long run = peak long run x p on the chosen day. Quality sessions (tempo, intervals) sit on the
//   run days farthest from the long run and never on two days in a row. The rest are easy runs.
// - Taper: volume drops (marathon 75 % then 55 %), one short quality session stays.
// - Race week: two short easy runs, none the day before, then the race.

export type GeneratedSession = Omit<PlannedSession, 'id' | 'planId'>;

export interface GeneratorInput {
  goalType: GoalType;
  targetDate: string; // race day
  startDate: string; // plan start (its week is week 0)
  firstDate: string; // today: nothing is planned before this day
  runDays: Weekday[];
  longRunDay: Weekday;
  level: Level;
  baselineLongRunMin: number; // longest run of the last weeks, in minutes
  /** Phases of weeks that already passed (kept as they were). */
  pastWeeks?: PlanWeek[];
}

export interface GeneratorResult {
  weeks: PlanWeek[];
  sessions: GeneratedSession[];
  warnings: string[];
}

interface GoalProfile {
  distanceM: number;
  peakLongMin: number;
  peakWeeklyMin: number; // beginner; intermediate x1.25
  taperWeeks: number;
  minWeeks: number;
  maxEasyMin: number;
  /** Long runs in the peak phase end with a block in zone 3 (race pace feel). */
  paceFinish: boolean;
}

export const GOAL_PROFILES: Partial<Record<GoalType, GoalProfile>> = {
  marathon: { distanceM: 42_195, peakLongMin: 180, peakWeeklyMin: 330, taperWeeks: 2, minWeeks: 12, maxEasyMin: 70, paceFinish: true },
  half: { distanceM: 21_097, peakLongMin: 120, peakWeeklyMin: 240, taperWeeks: 1, minWeeks: 8, maxEasyMin: 60, paceFinish: true },
  '10k': { distanceM: 10_000, peakLongMin: 90, peakWeeklyMin: 200, taperWeeks: 1, minWeeks: 6, maxEasyMin: 60, paceFinish: false },
  '5k': { distanceM: 5_000, peakLongMin: 75, peakWeeklyMin: 160, taperWeeks: 0, minWeeks: 4, maxEasyMin: 50, paceFinish: false },
};

const MAX_WEEKLY_GROWTH = 1.1;
const RECOVERY_FACTOR = 0.8;
const MIN_P = 0.3;
const MIN_EASY = 20;
const MIN_LONG = 30;

const round5 = (min: number) => Math.max(5, Math.round(min / 5) * 5);
const minutes = (m: number) => m * 60;

/** "45 min", "1:30 h" */
export function formatMinutes(m: number): string {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}

/** Circular distance between two weekdays (0..3). */
const dayDistance = (a: number, b: number) => Math.min((a - b + 7) % 7, (b - a + 7) % 7);

/**
 * Quality days: the run days farthest from the long run, never two quality days in a row
 * and never right before the long run if another day is free.
 */
export function pickQualityDays(runDays: Weekday[], longRunDay: Weekday, count: number): Weekday[] {
  const others = runDays.filter((d) => d !== longRunDay);
  const ranked = [...others].sort(
    (a, b) =>
      dayDistance(b, longRunDay) - dayDistance(a, longRunDay) ||
      // Equal distance: prefer the day after the long run's opposite side (earlier in the week).
      a - b,
  );
  const picked: Weekday[] = [];
  for (const d of ranked) {
    if (picked.length >= count) break;
    if (picked.some((p) => dayDistance(p, d) === 1)) continue;
    picked.push(d);
  }
  // Not enough non-adjacent days: fill up in rank order.
  for (const d of ranked) {
    if (picked.length >= count) break;
    if (!picked.includes(d)) picked.push(d);
  }
  return picked.sort((a, b) => a - b);
}

/** Load factors for the remaining weeks: training weeks, taper, race (last). */
export function loadFactors(
  trainingWeeks: number,
  taperWeeks: number,
  p0: number,
): { p: number; recovery: boolean }[] {
  const recovery = Array.from({ length: trainingWeeks }, (_, i) => (i + 1) % 3 === 0 && i < trainingWeeks - 1);
  const buildCount = recovery.filter((r) => !r).length;
  const out: { p: number; recovery: boolean }[] = [];
  let k = 0;
  let last = p0;
  for (let i = 0; i < trainingWeeks; i++) {
    if (recovery[i]) {
      out.push({ p: last * RECOVERY_FACTOR, recovery: true });
      continue;
    }
    const linear = buildCount <= 1 ? 1 : p0 + ((1 - p0) * k) / (buildCount - 1);
    const p = k === 0 ? Math.min(p0, 1) : Math.min(linear, last * MAX_WEEKLY_GROWTH);
    out.push({ p, recovery: false });
    last = p;
    k++;
  }
  const taper = taperWeeks >= 2 ? [0.75, 0.55] : taperWeeks === 1 ? [0.65] : [];
  for (const f of taper) out.push({ p: last * f, recovery: false });
  return out;
}

/** Base / build / peak split of the training weeks. */
export function trainingPhases(trainingWeeks: number): PlanPhase[] {
  if (trainingWeeks < 4) return Array(trainingWeeks).fill('build');
  const base = Math.round(trainingWeeks * 0.4);
  const peak = Math.max(1, Math.round(trainingWeeks * 0.2));
  const build = trainingWeeks - base - peak;
  return [...Array(base).fill('base'), ...Array(build).fill('build'), ...Array(peak).fill('peak')];
}

interface Built {
  kind: SessionKind;
  title: string;
  blocks: SessionBlock[];
  durationMin: number;
}

const warm = { intensity: 'warmup', durationSec: minutes(10) } as const;
const cool = { intensity: 'cooldown', durationSec: minutes(10) } as const;

function easyRun(min: number): Built {
  return { kind: 'easy', title: `Lockerer Lauf ${formatMinutes(min)}`, durationMin: min, blocks: [{ repeat: 1, steps: [{ intensity: 'easy', durationSec: minutes(min) }] }] };
}

function longRun(min: number, finishMin: number): Built {
  const steps: SessionBlock['steps'] = finishMin
    ? [
        { intensity: 'easy', durationSec: minutes(min - finishMin) },
        { intensity: 'steady', durationSec: minutes(finishMin), zone: 3 },
      ]
    : [{ intensity: 'easy', durationSec: minutes(min) }];
  return {
    kind: 'long',
    title: `Langer Lauf ${formatMinutes(min)}${finishMin ? ` (davon ${finishMin} min Zone 3)` : ''}`,
    durationMin: min,
    blocks: [{ repeat: 1, steps }],
  };
}

function tempoRun(tempoMin: number): Built {
  return {
    kind: 'tempo',
    title: `Tempolauf ${tempoMin} min`,
    durationMin: 20 + tempoMin,
    blocks: [{ repeat: 1, steps: [warm] }, { repeat: 1, steps: [{ intensity: 'tempo', durationSec: minutes(tempoMin), zone: 4 }] }, { repeat: 1, steps: [cool] }],
  };
}

function intervals(reps: number, workMin: number, jogMin: number, intensity: 'threshold' | 'interval', title: string): Built {
  return {
    kind: 'intervals',
    title,
    durationMin: 20 + reps * (workMin + jogMin),
    blocks: [
      { repeat: 1, steps: [warm] },
      {
        repeat: reps,
        steps: [
          { intensity, durationSec: minutes(workMin) },
          { intensity: 'recovery', durationSec: minutes(jogMin) },
        ],
      },
      { repeat: 1, steps: [cool] },
    ],
  };
}

/** Quality session number `slot` (0 = main, 1 = second) of a week. `t` = progress in its phase (0..1). */
function quality(phase: PlanPhase, slot: number, t: number, weekNo: number): Built {
  if (phase === 'base') return intervals(6, 1, 2, 'threshold', 'Fahrtspiel 6 × 1 min');
  if (phase === 'taper') return slot === 0 ? tempoRun(15) : intervals(4, 3, 2, 'interval', 'Intervalle 4 × 3 min');
  const reps = Math.round(4 + 2 * t);
  if (slot === 1) return intervals(reps, 3, 2, 'interval', `Intervalle ${reps} × 3 min`);
  if (phase === 'peak' && weekNo % 2 === 1) return intervals(reps, 5, 2, 'threshold', `Intervalle ${reps} × 5 min`);
  return tempoRun(round5(15 + 15 * t));
}

export function generatePlan(input: GeneratorInput): GeneratorResult {
  const profile = GOAL_PROFILES[input.goalType];
  if (!profile) throw new Error(`Für ${GOAL_LABEL[input.goalType]} gibt es noch keinen Plan-Generator.`);
  const runDays = [...new Set(input.runDays)].sort((a, b) => a - b) as Weekday[];
  if (runDays.length < 2) throw new Error('Bitte mindestens zwei Lauftage wählen.');
  if (!runDays.includes(input.longRunDay)) throw new Error('Der Tag für den langen Lauf muss ein Lauftag sein.');

  const warnings: string[] = [];
  const all = buildWeeks(input.startDate, input.targetDate);
  const firstMonday = addDays(input.firstDate, -weekdayIndex(input.firstDate));
  const from = Math.max(0, Math.min(all.length - 1, all.findIndex((w) => w.startDate === firstMonday)));
  const remaining = all.length - from;
  const taperWeeks = Math.min(profile.taperWeeks, Math.max(0, remaining - 2));
  const trainingWeeks = remaining - 1 - taperWeeks;

  if (remaining - 1 < profile.minWeeks) {
    warnings.push(
      `Für ${GOAL_LABEL[input.goalType]} sind mindestens ${profile.minWeeks} Wochen Vorbereitung empfohlen, bis zum Ziel sind es nur ${remaining - 1}.`,
    );
  }
  if (runDays.length < 3) warnings.push('Mit zwei Lauftagen pro Woche ist der Plan sehr knapp. Drei oder mehr sind besser.');
  if (input.baselineLongRunMin < profile.peakLongMin * MIN_P) {
    warnings.push('Dein bisher längster Lauf ist für dieses Ziel noch kurz. Der Plan startet vorsichtig, steigere nicht schneller.');
  }

  const intermediate = input.level !== 'beginner';
  const peakWeekly = profile.peakWeeklyMin * (intermediate ? 1.25 : 1);
  const p0 = Math.min(1, Math.max(MIN_P, input.baselineLongRunMin / profile.peakLongMin));
  const factors = loadFactors(trainingWeeks, taperWeeks, p0);
  const peakP = Math.max(0, ...factors.slice(0, trainingWeeks).map((f) => f.p));
  if (trainingWeeks > 0 && peakP < 0.95) {
    warnings.push('Bis zum Ziel reicht die Zeit nicht ganz für den vollen Umfang (höchstens 10 % mehr pro Woche).');
  }
  const phases = trainingPhases(trainingWeeks);

  const weeks: PlanWeek[] = all.map((w, i) => {
    if (i < from) return input.pastWeeks?.[i] ?? { ...w, phase: 'base', isRecovery: false };
    const r = i - from;
    if (r === remaining - 1) return { ...w, phase: 'race', isRecovery: false };
    if (r >= trainingWeeks) return { ...w, phase: 'taper', isRecovery: false };
    return { ...w, phase: phases[r], isRecovery: factors[r].recovery };
  });

  const sessions: GeneratedSession[] = [];
  const add = (weekIndex: number, date: string, b: Built) => {
    if (date < input.firstDate) return;
    sessions.push({ weekIndex, date, sport: 'run', kind: b.kind, title: b.title, blocks: b.blocks });
  };

  const others = runDays.filter((d) => d !== input.longRunDay);
  const maxQuality = Math.max(0, runDays.length - 2);

  for (let r = 0; r < remaining - 1; r++) {
    const week = weeks[from + r];
    const { p, recovery } = factors[r];
    const phase = week.phase;
    // Progress inside the phase for the quality progression.
    const phaseWeeks = weeks.slice(from, from + trainingWeeks).filter((w) => w.phase === phase);
    const posInPhase = phaseWeeks.findIndex((w) => w.index === week.index);
    const t = phaseWeeks.length > 1 ? posInPhase / (phaseWeeks.length - 1) : 1;

    const long = Math.max(MIN_LONG, round5(profile.peakLongMin * p));
    const finishShare = intermediate ? 0.25 : 0.15;
    const finish = profile.paceFinish && phase === 'peak' && !recovery ? round5(Math.min(45, long * finishShare)) : 0;
    const qualityCount = recovery
      ? 0
      : Math.min(maxQuality, phase === 'base' ? (intermediate ? 1 : 0) : phase === 'taper' ? 1 : intermediate && runDays.length >= 4 ? 2 : 1);
    const qDays = pickQualityDays(runDays, input.longRunDay, qualityCount);
    const qualities = qDays.map((d, slot) => ({ day: d, b: quality(phase, slot, t, r) }));
    const easyDays = others.filter((d) => !qDays.includes(d));
    const weekly = peakWeekly * p;
    const rest = weekly - long - qualities.reduce((n, q) => n + q.b.durationMin, 0);
    const easy = easyDays.length ? Math.min(profile.maxEasyMin, Math.max(MIN_EASY, round5(rest / easyDays.length))) : 0;

    add(week.index, addDays(week.startDate, input.longRunDay), longRun(long, finish));
    for (const q of qualities) add(week.index, addDays(week.startDate, q.day), q.b);
    for (const d of easyDays) add(week.index, addDays(week.startDate, d), easyRun(easy));
  }

  // Race week: two short easy runs (not the day before), then the race.
  const race = weeks[all.length - 1];
  const raceDay = weekdayIndex(input.targetDate);
  const shakeouts = runDays.filter((d) => d < raceDay - 1).slice(-2);
  shakeouts.forEach((d, i) => add(race.index, addDays(race.startDate, d), easyRun(i === shakeouts.length - 1 ? 20 : 30)));
  add(race.index, input.targetDate, {
    kind: 'race',
    title: `Wettkampf: ${GOAL_LABEL[input.goalType]}`,
    durationMin: 0,
    blocks: [{ repeat: 1, steps: [{ intensity: 'threshold', distanceM: profile.distanceM }] }],
  });

  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return { weeks, sessions, warnings };
}

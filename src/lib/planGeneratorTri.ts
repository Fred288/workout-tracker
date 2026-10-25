import type { GoalType, Level, PlanWeek, SessionBlock, SessionKind, SessionPart, Sport, Weekday, WorkoutSport } from '../db/types';
import { addDays, weekdayIndex } from './dates';
import { GOAL_LABEL, buildWeeks } from './plan';
import { formatMinutes, loadFactors, trainingPhases, type GeneratedSession, type GeneratorResult } from './planGenerator';

// Rule-based triathlon plan generator (sprint and olympic distance). Only the structure of
// common beginner plans is used (phases, rhythm, session types), no texts or weeks are copied.
//
// Rules in short:
// - Same phase logic as the running generator: base / build / peak, every 3rd training week
//   is a recovery week (-20 %), load grows by at most 10 % per week, one taper week, race week.
// - A training week has 2 swims, 2 rides, 2 runs and 1 core session. The long ride sits on the
//   chosen long day, the long run on the day after; the other sessions fill the remaining days,
//   combining swim + core or swim + run when there are fewer days.
// - From the build phase (or 40 % into the plan) the long ride becomes a brick: run right after.
// - Recovery weeks keep everything easy; quality (intervals, tempo) starts in the build phase.
// - Race week: short swim, ride and run early in the week, nothing the day before, then the race.

export type TriGoal = Extract<GoalType, 'sprint' | 'olympic'>;
export const TRI_GOALS: TriGoal[] = ['sprint', 'olympic'];
export const isTriGoal = (t: GoalType): t is TriGoal => (TRI_GOALS as GoalType[]).includes(t);

interface TriProfile {
  race: { swimM: number; bikeM: number; runM: number };
  /** Minutes at peak load for a beginner; intermediate x1.2. */
  peak: { swim: number; bikeLong: number; bikeInt: number; runLong: number; runInt: number; core: number; brickRun: number };
  taperWeeks: number;
  minWeeks: number;
}

export const TRI_PROFILES: Record<TriGoal, TriProfile> = {
  sprint: {
    race: { swimM: 750, bikeM: 20_000, runM: 5000 },
    peak: { swim: 45, bikeLong: 120, bikeInt: 60, runLong: 70, runInt: 45, core: 30, brickRun: 20 },
    taperWeeks: 1,
    minWeeks: 12,
  },
  olympic: {
    race: { swimM: 1500, bikeM: 40_000, runM: 10_000 },
    peak: { swim: 60, bikeLong: 180, bikeInt: 75, runLong: 90, runInt: 50, core: 30, brickRun: 30 },
    taperWeeks: 1,
    minWeeks: 16,
  },
};

export interface TriGeneratorInput {
  goalType: TriGoal;
  targetDate: string;
  startDate: string;
  firstDate: string;
  /** Training days of the week (at least three). */
  days: Weekday[];
  /** Day of the long ride (or brick); the long run follows the next training day. */
  longDay: Weekday;
  level: Level;
  /** Current training volume per week in hours, the starting point of the progression. */
  hoursPerWeek: number;
  pastWeeks?: PlanWeek[];
}

/** Planning speed for swim sessions: 2:30 per 100 m. */
const SWIM_M_PER_MIN = 40;
const MIN_P = 0.4;
const MIN_MIN: Record<keyof TriProfile['peak'], number> = { swim: 20, bikeLong: 45, bikeInt: 30, runLong: 25, runInt: 20, core: 15, brickRun: 10 };

const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);
const round50 = (m: number) => Math.max(50, Math.round(m / 50) * 50);
const sec = (m: number) => m * 60;
const rep = (repeat: number, ...steps: SessionBlock['steps']): SessionBlock => ({ repeat, steps });

type Slot = 'swimA' | 'swimB' | 'bikeInt' | 'runLong' | 'runInt' | 'core';

/**
 * What each training day holds, for the days after the long day in week order. Fewer days
 * combine sessions; with only two other days the second ride and the core session drop out.
 */
const DAY_TEMPLATES: Record<number, Slot[][]> = {
  6: [['runLong'], ['swimA'], ['bikeInt'], ['runInt'], ['swimB'], ['core']],
  5: [['runLong'], ['swimA', 'core'], ['bikeInt'], ['runInt'], ['swimB']],
  4: [['runLong'], ['swimA', 'core'], ['bikeInt'], ['swimB', 'runInt']],
  3: [['runLong'], ['swimA', 'core'], ['swimB', 'runInt']],
  2: [['runLong'], ['swimA', 'runInt']],
};

/** Training days other than the long day, in order from the day after the long day. */
export function daysAfterLong(days: Weekday[], longDay: Weekday): Weekday[] {
  return [...new Set(days)].filter((d) => d !== longDay).sort((a, b) => ((a - longDay + 7) % 7) - ((b - longDay + 7) % 7));
}

/** Weekday -> slots for one training week. */
export function weekLayout(days: Weekday[], longDay: Weekday): Map<Weekday, Slot[]> {
  const others = daysAfterLong(days, longDay);
  const template = DAY_TEMPLATES[Math.min(6, others.length)] ?? [];
  const out = new Map<Weekday, Slot[]>();
  others.forEach((d, i) => {
    if (template[i]) out.set(d, template[i]);
  });
  return out;
}

interface Built {
  sport: WorkoutSport;
  kind: SessionKind;
  title: string;
  blocks?: SessionBlock[];
  parts?: SessionPart[];
}

const single = (sport: Sport, kind: SessionKind, title: string, blocks: SessionBlock[]): Built => ({ sport, kind, title, blocks });

type Stage = 'base' | 'build' | 'peak';

function swim(minutes: number, variant: 'technique' | 'endurance' | 'intervals'): Built {
  const total = round50(minutes * SWIM_M_PER_MIN);
  const main = Math.max(100, total - 300);
  if (variant === 'intervals') {
    const k = Math.max(3, Math.round(main / 100));
    return single('swim', 'intervals', `Schwimmen ${k} × 100 m zügig`, [
      rep(1, { intensity: 'warmup', distanceM: 200 }),
      rep(k, { intensity: 'threshold', distanceM: 100 }),
      rep(1, { intensity: 'cooldown', distanceM: 100 }),
    ]);
  }
  if (variant === 'endurance') {
    return single('swim', 'long', `Schwimmen ${round50(main) + 300} m Ausdauer`, [
      rep(1, { intensity: 'warmup', distanceM: 200 }),
      rep(1, { intensity: 'easy', distanceM: round50(main) }),
      rep(1, { intensity: 'cooldown', distanceM: 100 }),
    ]);
  }
  const k = Math.max(2, Math.round(main / 100));
  return single('swim', 'easy', `Schwimmen ${k} × 100 m Technik`, [
    rep(1, { intensity: 'warmup', distanceM: 200 }),
    rep(k, { intensity: 'easy', distanceM: 100 }),
    rep(1, { intensity: 'cooldown', distanceM: 100 }),
  ]);
}

function bikeInt(minutes: number, stage: Stage | 'easy'): Built {
  if (stage === 'base' || stage === 'easy') return single('bike', 'easy', `Lockere Radfahrt ${formatMinutes(minutes)}`, [rep(1, { intensity: 'easy', durationSec: sec(minutes) })]);
  const work = stage === 'build' ? 5 : 8;
  const rest = stage === 'build' ? 3 : 4;
  const k = Math.max(2, Math.min(6, Math.round((minutes - 20) / (work + rest))));
  return single('bike', 'intervals', `Rad-Intervalle ${k} × ${work} min`, [
    rep(1, { intensity: 'warmup', durationSec: sec(10) }),
    rep(k, { intensity: 'threshold', durationSec: sec(work) }, { intensity: 'recovery', durationSec: sec(rest) }),
    rep(1, { intensity: 'cooldown', durationSec: sec(10) }),
  ]);
}

function runInt(minutes: number, stage: Stage | 'easy'): Built {
  if (stage === 'base' || stage === 'easy') return single('run', 'easy', `Lockerer Lauf ${formatMinutes(minutes)}`, [rep(1, { intensity: 'easy', durationSec: sec(minutes) })]);
  if (stage === 'build') {
    const tempo = Math.max(10, Math.min(25, round5(minutes - 20)));
    return single('run', 'tempo', `Tempolauf ${tempo} min`, [
      rep(1, { intensity: 'warmup', durationSec: sec(10) }),
      rep(1, { intensity: 'tempo', durationSec: sec(tempo), zone: 4 }),
      rep(1, { intensity: 'cooldown', durationSec: sec(10) }),
    ]);
  }
  const k = Math.max(3, Math.min(8, Math.round((minutes - 20) / 5)));
  return single('run', 'intervals', `Lauf-Intervalle ${k} × 3 min`, [
    rep(1, { intensity: 'warmup', durationSec: sec(10) }),
    rep(k, { intensity: 'interval', durationSec: sec(3) }, { intensity: 'recovery', durationSec: sec(2) }),
    rep(1, { intensity: 'cooldown', durationSec: sec(10) }),
  ]);
}

export function generateTriPlan(input: TriGeneratorInput): GeneratorResult {
  const profile = TRI_PROFILES[input.goalType];
  const others = daysAfterLong(input.days, input.longDay);
  if (!input.days.includes(input.longDay)) throw new Error('Der Tag für die lange Einheit muss ein Trainingstag sein.');
  if (others.length < 2) throw new Error('Bitte mindestens drei Trainingstage wählen.');

  const warnings: string[] = [];
  const all = buildWeeks(input.startDate, input.targetDate);
  const firstMonday = addDays(input.firstDate, -weekdayIndex(input.firstDate));
  const from = Math.max(0, Math.min(all.length - 1, all.findIndex((w) => w.startDate === firstMonday)));
  const remaining = all.length - from;
  const taperWeeks = Math.min(profile.taperWeeks, Math.max(0, remaining - 2));
  const trainingWeeks = remaining - 1 - taperWeeks;

  if (remaining - 1 < profile.minWeeks) {
    warnings.push(`Für ${GOAL_LABEL[input.goalType]} sind mindestens ${profile.minWeeks} Wochen Vorbereitung empfohlen, bis zum Ziel sind es nur ${remaining - 1}.`);
  }
  if (others.length < 4) warnings.push('Mit weniger als fünf Trainingstagen fallen Einheiten weg oder werden zusammengelegt. Fünf bis sieben Tage sind ideal.');

  const factor = input.level === 'beginner' ? 1 : 1.2;
  const peakWeekly = (2 * profile.peak.swim + profile.peak.bikeLong + profile.peak.bikeInt + profile.peak.runLong + profile.peak.runInt + profile.peak.core + profile.peak.brickRun) * factor;
  const p0 = Math.min(1, Math.max(MIN_P, (input.hoursPerWeek * 60) / peakWeekly));
  if ((input.hoursPerWeek * 60) / peakWeekly < MIN_P) warnings.push('Dein aktueller Umfang ist für dieses Ziel noch gering. Der Plan startet vorsichtig.');
  const factors = loadFactors(trainingWeeks, taperWeeks, p0);
  const peakP = Math.max(0, ...factors.slice(0, trainingWeeks).map((f) => f.p));
  if (trainingWeeks > 0 && peakP < 0.95) warnings.push('Bis zum Ziel reicht die Zeit nicht ganz für den vollen Umfang (höchstens 10 % mehr pro Woche).');
  const phases = trainingPhases(trainingWeeks);
  const brickFrom = Math.floor(trainingWeeks * 0.4);

  const weeks: PlanWeek[] = all.map((w, i) => {
    if (i < from) return input.pastWeeks?.[i] ?? { ...w, phase: 'base', isRecovery: false };
    const r = i - from;
    if (r === remaining - 1) return { ...w, phase: 'race', isRecovery: false };
    if (r >= trainingWeeks) return { ...w, phase: 'taper', isRecovery: false };
    return { ...w, phase: phases[r], isRecovery: factors[r].recovery };
  });

  const sessions: GeneratedSession[] = [];
  const add = (weekIndex: number, date: string, b: Built) => {
    if (date < input.firstDate || date >= input.targetDate) return;
    sessions.push({ weekIndex, date, sport: b.sport, kind: b.kind, title: b.title, ...(b.parts ? { parts: b.parts } : { blocks: b.blocks }) });
  };
  const layout = weekLayout(input.days, input.longDay);

  for (let r = 0; r < remaining - 1; r++) {
    const week = weeks[from + r];
    const { p, recovery } = factors[r];
    const stage: Stage = week.phase === 'taper' ? 'peak' : week.phase === 'build' || week.phase === 'peak' ? week.phase : 'base';
    const quality: Stage | 'easy' = recovery ? 'easy' : stage;
    const dur = (k: keyof TriProfile['peak']) => Math.max(MIN_MIN[k], round5(profile.peak[k] * factor * p));

    const slots: Record<Slot, () => Built> = {
      swimA: () => swim(dur('swim'), 'technique'),
      swimB: () => swim(dur('swim'), quality === 'easy' || quality === 'base' ? 'endurance' : 'intervals'),
      bikeInt: () => bikeInt(dur('bikeInt'), quality),
      runLong: () => single('run', 'long', `Langer Lauf ${formatMinutes(dur('runLong'))}`, [rep(1, { intensity: 'easy', durationSec: sec(dur('runLong')) })]),
      runInt: () => runInt(dur('runInt'), quality),
      core: () => single('strength', 'strength', stage === 'base' ? 'Stabi und Mobility' : 'Kraft und Stabi', [rep(1, { intensity: 'easy', durationSec: sec(dur('core')) })]),
    };

    // Long day: long ride, from the build phase on with a run right after (brick).
    const longDate = addDays(week.startDate, input.longDay);
    const bikeMin = dur('bikeLong');
    if (stage !== 'base' || r >= brickFrom) {
      const runMin = dur('brickRun');
      add(week.index, longDate, {
        sport: 'brick',
        kind: 'brick',
        title: `Koppel: Rad ${formatMinutes(bikeMin)} + Lauf ${runMin} min`,
        parts: [
          { sport: 'bike', blocks: [rep(1, { intensity: 'easy', durationSec: sec(bikeMin) })] },
          { sport: 'run', blocks: [rep(1, { intensity: 'steady', durationSec: sec(runMin) })] },
        ],
      });
    } else {
      add(week.index, longDate, single('bike', 'long', `Lange Radfahrt ${formatMinutes(bikeMin)}`, [rep(1, { intensity: 'easy', durationSec: sec(bikeMin) })]));
    }
    for (const [day, daySlots] of layout) for (const slot of daySlots) add(week.index, addDays(week.startDate, day), slots[slot]());
  }

  // Race week: a short swim, ride and run early in the week (not the day before), then the race.
  const race = weeks[all.length - 1];
  const raceDay = weekdayIndex(input.targetDate);
  const early = [...new Set(input.days)].filter((d) => d < raceDay - 1).sort((a, b) => a - b).slice(-3);
  const openers: Built[] = [
    single('swim', 'easy', 'Schwimmen 600 m locker', [rep(1, { intensity: 'easy', distanceM: 600 })]),
    single('bike', 'easy', 'Radfahrt 30 min mit 3 kurzen Steigerungen', [rep(1, { intensity: 'easy', durationSec: sec(24) }), rep(3, { intensity: 'tempo', durationSec: sec(1) }, { intensity: 'recovery', durationSec: sec(1) })]),
    single('run', 'easy', 'Lockerer Lauf 20 min', [rep(1, { intensity: 'easy', durationSec: sec(20) })]),
  ];
  early.forEach((d, i) => add(race.index, addDays(race.startDate, d), openers[openers.length - early.length + i]));
  const { swimM, bikeM, runM } = profile.race;
  sessions.push({
    weekIndex: race.index,
    date: input.targetDate,
    sport: 'brick',
    kind: 'race',
    title: `Wettkampf: ${GOAL_LABEL[input.goalType]}`,
    parts: [
      { sport: 'swim', blocks: [rep(1, { intensity: 'threshold', distanceM: swimM })] },
      { sport: 'bike', blocks: [rep(1, { intensity: 'threshold', distanceM: bikeM })] },
      { sport: 'run', blocks: [rep(1, { intensity: 'threshold', distanceM: runM })] },
    ],
  });

  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return { weeks, sessions, warnings };
}

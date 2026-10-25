import type { GoalType, Level, PlanPhase, Weekday } from '../db/types';
import { mondayOf } from './dates';
import { plannedSeconds } from './endurance';
import { generatePlan, type GeneratedSession } from './planGenerator';
import { generateTriPlan, isTriGoal } from './planGeneratorTri';

// Wizard helpers: sensible defaults per goal and a dry run of the generator for the preview.

export interface WizardInput {
  goalType: GoalType;
  targetDate: string;
  today: string;
  days: Weekday[];
  longDay: Weekday;
  level: Level;
  /** Triathlon: hours per week; run: longest run of the last weeks in minutes. */
  baseline: number;
}

export interface WizardDefaults {
  days: Weekday[];
  longDay: Weekday;
  baseline: number;
}

/** Typical training days for a goal (Mon = 0): the long session on Saturday, rest days in between. */
export function wizardDefaults(goalType: GoalType, level: Level): WizardDefaults {
  if (isTriGoal(goalType)) return { days: [0, 1, 2, 3, 5, 6], longDay: 5, baseline: level === 'beginner' ? 4 : 6 };
  const marathonLike = goalType === 'marathon' || goalType === 'half';
  if (marathonLike && level !== 'beginner') return { days: [1, 2, 3, 5, 6], longDay: 6, baseline: 90 };
  if (marathonLike) return { days: [1, 3, 5, 6], longDay: 6, baseline: 60 };
  return { days: [1, 3, 6], longDay: 6, baseline: level === 'beginner' ? 40 : 60 };
}

export interface PreviewDay {
  date: string;
  title: string;
  sport: string;
  minutes: number;
}

export interface PlanPreview {
  weekCount: number;
  phases: Partial<Record<PlanPhase, number>>;
  /** planned minutes of the first week that has sessions / of the hardest week */
  startMinutes: number;
  peakMinutes: number;
  /** first full week with sessions, for the example week */
  exampleWeek: PreviewDay[];
  warnings: string[];
}

const weekMinutes = (sessions: GeneratedSession[], weekIndex: number) =>
  Math.round(sessions.filter((s) => s.weekIndex === weekIndex).reduce((n, s) => n + plannedSeconds(s), 0) / 60);

/** Dry run of the generator with the wizard's answers; nothing is stored. Throws on invalid input. */
export function previewPlan(input: WizardInput): PlanPreview {
  const startDate = mondayOf(input.today);
  const common = { targetDate: input.targetDate, startDate, firstDate: input.today, level: input.level };
  const result = isTriGoal(input.goalType)
    ? generateTriPlan({ ...common, goalType: input.goalType, days: input.days, longDay: input.longDay, hoursPerWeek: input.baseline })
    : generatePlan({ ...common, goalType: input.goalType, runDays: input.days, longRunDay: input.longDay, baselineLongRunMin: Math.round(input.baseline) });

  const phases: PlanPreview['phases'] = {};
  for (const w of result.weeks) phases[w.phase] = (phases[w.phase] ?? 0) + 1;
  const minutes = result.weeks.map((w) => weekMinutes(result.sessions, w.index));
  const firstWith = result.weeks.findIndex((_, i) => minutes[i] > 0);
  const example = result.weeks.find((w) => !w.isRecovery && w.phase !== 'race' && result.sessions.filter((s) => s.weekIndex === w.index).length >= input.days.length) ?? result.weeks[Math.max(0, firstWith)];
  return {
    weekCount: result.weeks.length,
    phases,
    startMinutes: firstWith >= 0 ? minutes[firstWith] : 0,
    peakMinutes: Math.max(0, ...minutes),
    exampleWeek: result.sessions
      .filter((s) => s.weekIndex === example.index)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({ date: s.date, title: s.title ?? '', sport: s.sport, minutes: Math.round(plannedSeconds(s) / 60) })),
    warnings: result.warnings,
  };
}

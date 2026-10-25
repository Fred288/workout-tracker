import type { Goal, GoalType, Plan, PlanWeek, PlannedSession, Workout } from '../db/types';
import { addDays, daysBetween, mondayOf } from './dates';
import { newId } from './id';
import { RUN_EXERCISE_ID, blocksToSets } from './runTemplates';

export const GOAL_LABEL: Record<GoalType, string> = {
  '5k': '5 km',
  '10k': '10 km',
  half: 'Halbmarathon',
  marathon: 'Marathon',
  sprint: 'Sprint-Triathlon',
  olympic: 'Olympischer Triathlon',
  '70.3': 'Triathlon 70.3',
  ironman: 'Ironman',
};

/** Goal types the app can plan today (running only, triathlon follows later). */
export const RUN_GOALS: GoalType[] = ['5k', '10k', 'half', 'marathon'];

/**
 * Calendar weeks (Monday based) from the week of `startDate` to the week of `targetDate`.
 * Phases are placeholders (base, last week race); the plan generator assigns real ones.
 */
export function buildWeeks(startDate: string, targetDate: string): PlanWeek[] {
  const first = mondayOf(startDate);
  const last = mondayOf(targetDate);
  const count = Math.max(1, Math.floor(daysBetween(first, last) / 7) + 1);
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    startDate: addDays(first, i * 7),
    phase: i === count - 1 ? ('race' as const) : ('base' as const),
    isRecovery: false,
  }));
}

export function newPlan(goal: Goal, startDate: string): Plan {
  return {
    id: newId(),
    goalId: goal.id,
    name: GOAL_LABEL[goal.type],
    startDate,
    level: 'beginner',
    availability: {},
    weeks: buildWeeks(startDate, goal.targetDate),
    createdAt: Date.now(),
  };
}

/** Index of the plan week that contains `date`, or -1 outside the plan. */
export function weekIndexOf(plan: Pick<Plan, 'weeks'>, date: string): number {
  const first = plan.weeks[0]?.startDate;
  if (!first) return -1;
  const i = Math.floor(daysBetween(first, date) / 7);
  return i >= 0 && i < plan.weeks.length ? i : -1;
}

export type SessionStatus = 'done' | 'skipped' | 'missed' | 'open';

/** "done" is derived from a finished workout that links to the session. */
export function sessionStatus(s: PlannedSession, doneIds: { has(id: string): boolean }, today: string): SessionStatus {
  if (doneIds.has(s.id)) return 'done';
  if (s.skippedAt !== undefined) return 'skipped';
  return s.date < today ? 'missed' : 'open';
}

/** Sessions of one plan week, sorted by date. */
export function sessionsOfWeek(sessions: PlannedSession[], weekStart: string): PlannedSession[] {
  const end = addDays(weekStart, 6);
  return sessions.filter((s) => s.date >= weekStart && s.date <= end).sort((a, b) => a.date.localeCompare(b.date));
}

/** A not yet started workout for a planned session, linked back through plannedSessionId. */
export function workoutFromSession(s: PlannedSession, now: number): Workout {
  const sets = blocksToSets(s.blocks ?? [{ repeat: 1, steps: [{ intensity: 'easy' }] }]);
  return {
    id: newId(),
    name: s.title ?? 'Lauf',
    startedAt: now,
    sport: s.sport,
    plannedSessionId: s.id,
    exercises: [
      {
        id: newId(),
        exerciseId: RUN_EXERCISE_ID,
        order: 0,
        sets: sets.map((x) => ({ id: newId(), ...x, completed: false })),
      },
    ],
  };
}

/** Share of the time from plan start to the target date that has passed, for a progress bar. */
export function planProgress(plan: Pick<Plan, 'startDate'>, goal: Pick<Goal, 'targetDate'>, today: string): number {
  const total = daysBetween(plan.startDate, goal.targetDate);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, daysBetween(plan.startDate, today) / total));
}

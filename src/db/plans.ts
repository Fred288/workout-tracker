import { db } from './dexie';
import { startWorkout } from './activeWorkout';
import type { Goal, GoalPriority, GoalType, Level, PlannedSession, Weekday } from './types';
import { buildWeeks, newPlan, weekIndexOf, workoutFromSession } from '../lib/plan';
import { newId } from '../lib/id';
import { mondayOf } from '../lib/dates';
import type { RunPreset } from '../lib/runTemplates';
import { generatePlan } from '../lib/planGenerator';

export interface GoalInput {
  type: GoalType;
  targetDate: string; // YYYY-MM-DD
  targetTimeSec?: number;
  raceName?: string;
  priority?: GoalPriority;
}

/** Creates a goal together with its (still empty) plan, starting in the current week. */
export async function createGoalWithPlan(input: GoalInput, today: string): Promise<{ goalId: string; planId: string }> {
  const goal: Goal = { id: newId(), priority: 'A', createdAt: Date.now(), ...input };
  const plan = newPlan(goal, mondayOf(today));
  await db.transaction('rw', db.goals, db.plans, async () => {
    await db.goals.add(goal);
    await db.plans.add(plan);
  });
  return { goalId: goal.id, planId: plan.id };
}

/** Changes the goal; a new target date rebuilds the plan weeks and re-assigns the sessions. */
export async function updateGoal(goalId: string, patch: Partial<Omit<Goal, 'id' | 'createdAt'>>): Promise<void> {
  await db.transaction('rw', db.goals, db.plans, db.plannedSessions, async () => {
    const goal = await db.goals.get(goalId);
    if (!goal) return;
    const next = { ...goal, ...patch };
    await db.goals.put(next);
    if (patch.targetDate === undefined || patch.targetDate === goal.targetDate) return;
    for (const plan of await db.plans.where('goalId').equals(goalId).toArray()) {
      const weeks = buildWeeks(plan.startDate, next.targetDate);
      await db.plans.put({ ...plan, weeks });
      const sessions = await db.plannedSessions.where('planId').equals(plan.id).toArray();
      await db.plannedSessions.bulkPut(sessions.map((s) => ({ ...s, weekIndex: weekIndexOf({ weeks }, s.date) })));
    }
  });
}

/** Removes the goal with its plans and planned sessions. Finished workouts stay untouched. */
export async function deleteGoal(goalId: string): Promise<void> {
  await db.transaction('rw', db.goals, db.plans, db.plannedSessions, async () => {
    const planIds = (await db.plans.where('goalId').equals(goalId).primaryKeys()) as string[];
    await db.plannedSessions.where('planId').anyOf(planIds).delete();
    await db.plans.bulkDelete(planIds);
    await db.goals.delete(goalId);
  });
}

export async function addPlannedSession(planId: string, date: string, preset: RunPreset): Promise<string> {
  const plan = await db.plans.get(planId);
  if (!plan) throw new Error('Plan nicht gefunden.');
  const s: PlannedSession = {
    id: newId(),
    planId,
    weekIndex: weekIndexOf(plan, date),
    date,
    sport: 'run',
    kind: preset.kind,
    title: preset.name,
    blocks: preset.blocks,
  };
  await db.plannedSessions.add(s);
  return s.id;
}

export async function moveSession(id: string, date: string): Promise<void> {
  await db.transaction('rw', db.plans, db.plannedSessions, async () => {
    const s = await db.plannedSessions.get(id);
    const plan = s && (await db.plans.get(s.planId));
    if (s && plan) await db.plannedSessions.put({ ...s, date, weekIndex: weekIndexOf(plan, date) });
  });
}

export async function setSessionSkipped(id: string, skipped: boolean): Promise<void> {
  const s = await db.plannedSessions.get(id);
  if (!s) return;
  const { skippedAt: _, ...rest } = s;
  await db.plannedSessions.put(skipped ? { ...rest, skippedAt: Date.now() } : rest);
}

export async function deleteSession(id: string): Promise<void> {
  await db.plannedSessions.delete(id);
}

/** Session id -> id of the finished workout, for the sessions that have one. */
export async function doneSessions(sessionIds: string[]): Promise<Map<string, string>> {
  const done = await db.workouts
    .where('plannedSessionId')
    .anyOf(sessionIds)
    .filter((w) => !!w.finishedAt)
    .toArray();
  return new Map(done.map((w) => [w.plannedSessionId!, w.id]));
}

export interface PlanSettings {
  runDays: Weekday[];
  longRunDay: Weekday;
  level: Level;
  baselineLongRunMin: number;
}

/**
 * (Re)creates the sessions of a plan from today on. Sessions that already have a workout
 * (finished or running) and everything in the past stay; other sessions from today on are
 * replaced. Returns the generator warnings.
 */
export async function generatePlanSessions(planId: string, settings: PlanSettings, today: string): Promise<string[]> {
  return db.transaction('rw', [db.plans, db.goals, db.plannedSessions, db.workouts], async () => {
    const plan = await db.plans.get(planId);
    const goal = plan && (await db.goals.get(plan.goalId));
    if (!plan || !goal) throw new Error('Plan nicht gefunden.');
    const result = generatePlan({
      goalType: goal.type,
      targetDate: goal.targetDate,
      startDate: plan.startDate,
      firstDate: today,
      pastWeeks: plan.weeks,
      ...settings,
    });

    const existing = await db.plannedSessions.where('planId').equals(planId).toArray();
    const linked = new Set(
      (await db.workouts.where('plannedSessionId').anyOf(existing.map((s) => s.id)).toArray()).map((w) => w.plannedSessionId!),
    );
    const keep = existing.filter((s) => s.date < today || linked.has(s.id));
    const replace = existing.filter((s) => !keep.includes(s));
    const busy = new Set(keep.filter((s) => s.date >= today).map((s) => s.date));

    await db.plannedSessions.bulkDelete(replace.map((s) => s.id));
    await db.plannedSessions.bulkAdd(
      result.sessions.filter((s) => !busy.has(s.date)).map((s) => ({ ...s, id: newId(), planId })),
    );
    await db.plans.put({
      ...plan,
      weeks: result.weeks,
      level: settings.level,
      longRunDay: settings.longRunDay,
      baselineLongRunMin: settings.baselineLongRunMin,
      availability: Object.fromEntries(settings.runDays.map((d) => [d, ['run']])),
    });
    // Sessions that stay get the week index of the (possibly new) week layout.
    await db.plannedSessions.bulkPut(keep.map((s) => ({ ...s, weekIndex: weekIndexOf({ weeks: result.weeks }, s.date) })));
    return result.warnings;
  });
}

/** Starts the planned session as the active workout. Throws when a workout is already running. */
export async function startPlannedSession(id: string, now = Date.now()): Promise<void> {
  const s = await db.plannedSessions.get(id);
  if (!s) throw new Error('Einheit nicht gefunden.');
  await startWorkout(workoutFromSession(s, now));
}

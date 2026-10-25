import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './dexie';
import { finishActive, getActiveWorkout, mutateActive } from './activeWorkout';
import {
  addPlannedSession,
  applyReschedule,
  moveRace,
  startBreak,
  createGoalWithPlan,
  deleteGoal,
  deleteSession,
  doneSessions,
  generatePlanSessions,
  moveSession,
  setSessionSkipped,
  startPlannedSession,
  updateGoal,
} from './plans';
import { ENDURANCE_PRESETS } from '../lib/endurancePresets';

const preset = (id: string) => ENDURANCE_PRESETS.find((p) => p.id === id)!;

beforeEach(async () => {
  await Promise.all([db.goals, db.plans, db.plannedSessions, db.workouts, db.meta].map((t) => t.clear()));
});

async function setup() {
  const ids = await createGoalWithPlan({ type: 'marathon', targetDate: '2027-04-11' }, '2026-10-25');
  return ids;
}

describe('goals and plans', () => {
  it('creates a goal with a plan that starts in the current week', async () => {
    const { goalId, planId } = await setup();
    const plan = (await db.plans.get(planId))!;
    expect(plan.goalId).toBe(goalId);
    expect(plan.startDate).toBe('2026-10-19');
    expect(plan.weeks).toHaveLength(25);
    expect((await db.goals.get(goalId))!.priority).toBe('A');
  });

  it('changing the target date rebuilds weeks and re-assigns sessions', async () => {
    const { goalId, planId } = await setup();
    const sid = await addPlannedSession(planId, '2026-11-24', preset('easy'));
    expect((await db.plannedSessions.get(sid))!.weekIndex).toBe(5);
    await updateGoal(goalId, { targetDate: '2026-11-15' });
    const plan = (await db.plans.get(planId))!;
    expect(plan.weeks).toHaveLength(4);
    expect((await db.plannedSessions.get(sid))!.weekIndex).toBe(-1); // now after the race
    await updateGoal(goalId, { targetTimeSec: 12_600 });
    expect((await db.plans.get(planId))!.weeks).toHaveLength(4);
  });

  it('deleting a goal removes plan and sessions but keeps finished workouts', async () => {
    const { goalId, planId } = await setup();
    const sid = await addPlannedSession(planId, '2026-10-27', preset('easy'));
    await db.workouts.put({ id: 'w', name: 'x', startedAt: 1, finishedAt: 2, plannedSessionId: sid, exercises: [] });
    await deleteGoal(goalId);
    expect(await db.goals.count()).toBe(0);
    expect(await db.plans.count()).toBe(0);
    expect(await db.plannedSessions.count()).toBe(0);
    expect(await db.workouts.count()).toBe(1);
  });
});

describe('planned sessions', () => {
  it('adds, moves, skips and deletes', async () => {
    const { planId } = await setup();
    const sid = await addPlannedSession(planId, '2026-10-27', preset('intervals-time'));
    expect(await db.plannedSessions.get(sid)).toMatchObject({ kind: 'intervals', title: 'Intervalle 4 × 5 min', weekIndex: 1 });

    await moveSession(sid, '2026-11-04');
    expect(await db.plannedSessions.get(sid)).toMatchObject({ date: '2026-11-04', weekIndex: 2 });

    await setSessionSkipped(sid, true);
    expect((await db.plannedSessions.get(sid))!.skippedAt).toBeDefined();
    await setSessionSkipped(sid, false);
    expect(await db.plannedSessions.get(sid)).not.toHaveProperty('skippedAt');

    await deleteSession(sid);
    expect(await db.plannedSessions.count()).toBe(0);
  });

  it('rejects a session for an unknown plan', async () => {
    await expect(addPlannedSession('nope', '2026-10-27', preset('easy'))).rejects.toThrow();
  });
});

describe('starting a session', () => {
  it('starts a linked workout; it counts as done only once finished', async () => {
    const { planId } = await setup();
    const sid = await addPlannedSession(planId, '2026-10-27', preset('easy'));
    expect((await doneSessions([sid])).size).toBe(0);

    await startPlannedSession(sid, 1000);
    const active = (await getActiveWorkout())!;
    expect(active).toMatchObject({ plannedSessionId: sid, sport: 'run', name: 'Lockerer Lauf' });
    expect((await doneSessions([sid])).size).toBe(0); // running, not finished

    await mutateActive((w) => ({
      ...w,
      exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, completed: true })) })),
    }));
    await finishActive(5000);
    expect([...(await doneSessions([sid])).keys()]).toEqual([sid]);
  });

  it('refuses to start while another workout runs', async () => {
    const { planId } = await setup();
    const a = await addPlannedSession(planId, '2026-10-27', preset('easy'));
    const b = await addPlannedSession(planId, '2026-10-28', preset('long'));
    await startPlannedSession(a);
    await expect(startPlannedSession(b)).rejects.toThrow();
  });
});

describe('generatePlanSessions', () => {
  const settings = { runDays: [1, 3, 6] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[], longRunDay: 6 as const, level: 'beginner' as const, baselineLongRunMin: 60 };

  it('creates the sessions and stores phases and settings on the plan', async () => {
    const { planId } = await setup();
    const warnings = await generatePlanSessions(planId, settings, '2026-10-26');
    expect(warnings).toEqual([]);
    const plan = (await db.plans.get(planId))!;
    expect(plan).toMatchObject({ longRunDay: 6, baselineLongRunMin: 60, availability: { 1: ['run'], 3: ['run'], 6: ['run'] } });
    expect(plan.weeks.at(-1)!.phase).toBe('race');
    const sessions = await db.plannedSessions.where('planId').equals(planId).toArray();
    expect(sessions.length).toBeGreaterThan(60);
    expect(sessions.every((s) => s.date >= '2026-10-26')).toBe(true);
    expect(sessions.find((s) => s.kind === 'race')!.date).toBe('2027-04-11');
  });

  it('regenerating keeps past and linked sessions, replaces the other open ones', async () => {
    const { planId } = await setup();
    await generatePlanSessions(planId, settings, '2026-10-26');
    const before = await db.plannedSessions.where('planId').equals(planId).sortBy('date');
    const doneOne = before.find((s) => s.date === '2026-11-01')!; // Sunday long run, finished
    await db.workouts.put({ id: 'w1', name: 'x', startedAt: 1, finishedAt: 2, plannedSessionId: doneOne.id, exercises: [] });
    const past = before.find((s) => s.date === '2026-10-27')!; // in the past on regeneration, not done

    await generatePlanSessions(planId, { ...settings, runDays: [0, 2, 6], longRunDay: 6 }, '2026-11-01');
    const after = await db.plannedSessions.where('planId').equals(planId).toArray();
    expect(after.find((s) => s.id === doneOne.id)).toBeDefined();
    expect(after.find((s) => s.id === past.id)).toBeDefined();
    // No duplicate on the day of the kept session.
    expect(after.filter((s) => s.date === '2026-11-01')).toHaveLength(1);
    // New sessions use the new run days.
    const future = after.filter((s) => s.date > '2026-11-01' && s.kind !== 'race');
    expect(future.every((s) => [0, 2, 6].includes((new Date(s.date + 'T12:00').getDay() + 6) % 7))).toBe(true);
  });
});

describe('adaptation', () => {
  const settings = { runDays: [1, 3, 6] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[], longRunDay: 6 as const, level: 'beginner' as const, baselineLongRunMin: 60 };

  it('applyReschedule moves the session, clears skipped and skips the replaced easy run', async () => {
    const { planId } = await setup();
    const long = await addPlannedSession(planId, '2026-10-25', preset('long'));
    const easy = await addPlannedSession(planId, '2026-10-27', preset('easy'));
    await setSessionSkipped(long, true);
    await applyReschedule([{ sessionId: long, toDate: '2026-10-27', replacesId: easy }]);
    const moved = (await db.plannedSessions.get(long))!;
    expect(moved).toMatchObject({ date: '2026-10-27', weekIndex: 1 });
    expect(moved).not.toHaveProperty('skippedAt');
    expect((await db.plannedSessions.get(easy))!.skippedAt).toBeDefined();
  });

  it('startBreak skips the break days and restarts the plan gentler afterwards', async () => {
    const { planId } = await setup();
    await generatePlanSessions(planId, settings, '2026-10-26');
    await startBreak(planId, '2026-11-02', 10); // back on 2026-11-12
    const all = await db.plannedSessions.where('planId').equals(planId).toArray();
    const inBreak = all.filter((s) => s.date >= '2026-11-02' && s.date < '2026-11-12');
    expect(inBreak.length).toBeGreaterThan(0);
    expect(inBreak.every((s) => s.skippedAt !== undefined)).toBe(true);
    const after = all.filter((s) => s.date >= '2026-11-12' && s.kind === 'long').sort((a, b) => a.date.localeCompare(b.date));
    const firstLong = after[0].blocks![0].steps.reduce((n, st) => n + (st.durationSec ?? 0), 0) / 60;
    // Last long run before the break was the 60-65 min of week 1; two started weeks off -> -20 %.
    expect(firstLong).toBeLessThanOrEqual(55);
    expect((await db.plans.get(planId))!.baselineLongRunMin).toBeLessThan(60);
  });

  it('startBreak on a hand-made plan only skips sessions', async () => {
    const { planId } = await setup();
    const a = await addPlannedSession(planId, '2026-10-27', preset('easy'));
    const b = await addPlannedSession(planId, '2026-11-20', preset('easy'));
    expect(await startBreak(planId, '2026-10-26', 7)).toEqual([]);
    expect((await db.plannedSessions.get(a))!.skippedAt).toBeDefined();
    expect((await db.plannedSessions.get(b))!.skippedAt).toBeUndefined();
  });

  it('moveRace changes the date and rebuilds a generated plan to the new race day', async () => {
    const { goalId, planId } = await setup();
    await generatePlanSessions(planId, settings, '2026-10-26');
    await moveRace(goalId, '2027-05-09', '2026-11-02');
    expect((await db.goals.get(goalId))!.targetDate).toBe('2027-05-09');
    const sessions = await db.plannedSessions.where('planId').equals(planId).toArray();
    expect(sessions.filter((s) => s.kind === 'race').map((s) => s.date)).toEqual(['2027-05-09']);
    expect((await db.plans.get(planId))!.weeks.at(-1)!.phase).toBe('race');
  });
});

describe('triathlon plans', () => {
  it('generates a sprint plan with all sports and keeps the weekly hours', async () => {
    const { goalId, planId } = await createGoalWithPlan({ type: 'sprint', targetDate: '2027-02-14' }, '2026-10-26');
    const warnings = await generatePlanSessions(planId, { runDays: [0, 1, 2, 3, 5, 6], longRunDay: 5, level: 'beginner', baselineLongRunMin: 60, hoursPerWeek: 5 }, '2026-10-26');
    expect(warnings).toEqual([]);
    const sessions = await db.plannedSessions.where('planId').equals(planId).toArray();
    expect(new Set(sessions.map((s) => s.sport))).toEqual(new Set(['swim', 'bike', 'run', 'strength', 'brick']));
    expect(sessions.find((s) => s.kind === 'race')).toMatchObject({ date: '2027-02-14', sport: 'brick' });
    expect((await db.plans.get(planId))!.hoursPerWeek).toBe(5);

    await moveRace(goalId, '2027-03-07', '2026-11-09');
    const after = await db.plannedSessions.where('planId').equals(planId).toArray();
    expect(after.filter((s) => s.kind === 'race').map((s) => s.date)).toEqual(['2027-03-07']);
    // The new start volume is where the plan stood (last full week), not the original 5 h.
    expect((await db.plans.get(planId))!.hoursPerWeek).not.toBe(5);
  });
});

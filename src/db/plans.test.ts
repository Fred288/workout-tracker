import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './dexie';
import { finishActive, getActiveWorkout, mutateActive } from './activeWorkout';
import {
  addPlannedSession,
  createGoalWithPlan,
  deleteGoal,
  deleteSession,
  doneSessions,
  moveSession,
  setSessionSkipped,
  startPlannedSession,
  updateGoal,
} from './plans';
import { RUN_PRESETS } from '../lib/runTemplates';

const preset = (id: string) => RUN_PRESETS.find((p) => p.id === id)!;

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

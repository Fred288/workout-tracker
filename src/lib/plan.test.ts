import { describe, expect, it } from 'vitest';
import type { Goal, PlannedSession } from '../db/types';
import { buildWeeks, newPlan, planProgress, sessionStatus, sessionsOfWeek, weekIndexOf, workoutFromSession } from './plan';

const goal: Goal = { id: 'g', type: 'marathon', targetDate: '2027-04-11', priority: 'A', createdAt: 0 };
const session = (over: Partial<PlannedSession> = {}): PlannedSession => ({
  id: 's',
  planId: 'p',
  weekIndex: 0,
  date: '2026-10-28',
  sport: 'run',
  kind: 'easy',
  ...over,
});

describe('buildWeeks', () => {
  it('spans from the start week to the race week, Monday based', () => {
    const w = buildWeeks('2026-10-25', '2027-04-11'); // Sunday start, Sunday race
    expect(w[0].startDate).toBe('2026-10-19');
    expect(w.at(-1)!.startDate).toBe('2027-04-05');
    expect(w).toHaveLength(25);
    expect(w.at(-1)!.phase).toBe('race');
    expect(w.map((x) => x.index)).toEqual(w.map((_, i) => i));
  });

  it('always has at least one week', () => {
    expect(buildWeeks('2026-10-26', '2026-10-27')).toHaveLength(1);
    expect(buildWeeks('2026-10-26', '2026-10-20')).toHaveLength(1);
  });
});

describe('weekIndexOf', () => {
  const plan = newPlan(goal, '2026-10-26');

  it('maps dates to weeks and rejects dates outside', () => {
    expect(weekIndexOf(plan, '2026-10-26')).toBe(0);
    expect(weekIndexOf(plan, '2026-11-01')).toBe(0);
    expect(weekIndexOf(plan, '2026-11-02')).toBe(1);
    expect(weekIndexOf(plan, '2026-10-25')).toBe(-1);
    expect(weekIndexOf(plan, '2027-04-12')).toBe(-1);
  });
});

describe('sessionStatus', () => {
  it('derives status; done wins over skipped, past open sessions are missed', () => {
    const none = new Set<string>();
    expect(sessionStatus(session(), none, '2026-10-26')).toBe('open');
    expect(sessionStatus(session({ date: '2026-10-26' }), none, '2026-10-26')).toBe('open');
    expect(sessionStatus(session(), none, '2026-10-29')).toBe('missed');
    expect(sessionStatus(session({ skippedAt: 1 }), none, '2026-10-29')).toBe('skipped');
    expect(sessionStatus(session({ skippedAt: 1 }), new Set(['s']), '2026-10-29')).toBe('done');
  });
});

describe('sessionsOfWeek', () => {
  it('returns the sessions inside the week sorted by date', () => {
    const list = [
      session({ id: 'c', date: '2026-11-01' }),
      session({ id: 'x', date: '2026-11-02' }),
      session({ id: 'a', date: '2026-10-26' }),
    ];
    expect(sessionsOfWeek(list, '2026-10-26').map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('workoutFromSession', () => {
  it('builds a linked run workout from blocks', () => {
    const w = workoutFromSession(
      session({
        title: 'Intervalle',
        blocks: [{ repeat: 2, steps: [{ intensity: 'interval', distanceM: 800 }, { intensity: 'recovery', distanceM: 400 }] }],
      }),
      5,
    );
    expect(w).toMatchObject({ name: 'Intervalle', sport: 'run', plannedSessionId: 's', startedAt: 5 });
    expect(w.exercises[0].sets).toHaveLength(4);
    expect(w.exercises[0].sets.every((s) => !s.completed)).toBe(true);
  });

  it('falls back to one free step', () => {
    expect(workoutFromSession(session(), 1).exercises[0].sets).toHaveLength(1);
  });
});

describe('planProgress', () => {
  it('is clamped between 0 and 1', () => {
    const plan = { startDate: '2026-10-26' };
    expect(planProgress(plan, goal, '2026-10-20')).toBe(0);
    expect(planProgress(plan, goal, '2028-01-01')).toBe(1);
    expect(planProgress(plan, goal, '2026-12-01')).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { PlannedSession } from '../db/types';
import { plannedSeconds } from './endurance';
import { ENDURANCE_PRESETS, PRESET_GROUPS, templateFromPreset } from './endurancePresets';
import { formatSet } from './format';
import { ZONE_IF, plannedLoad, points } from './load';
import { workoutFromSession } from './plan';
import { SPORT_EXERCISE, blocksSeconds, partsOf, stepSeconds } from './sports';
import { blocksToSets } from './runTemplates';
import { workoutFromTemplate } from './workout';

const preset = (id: string) => ENDURANCE_PRESETS.find((p) => p.id === id)!;

describe('presets', () => {
  it('have unique ids and are grouped by sport in the offered order', () => {
    const ids = ENDURANCE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PRESET_GROUPS.map((g) => g.sport)).toEqual(['run', 'swim', 'bike', 'brick', 'strength']);
    expect(PRESET_GROUPS.every((g) => g.presets.length > 0)).toBe(true);
    expect(PRESET_GROUPS.flatMap((g) => g.presets)).toHaveLength(ids.length);
  });

  it('swim sets are distance steps in metres', () => {
    const sets = blocksToSets(preset('swim-technique').parts[0].blocks);
    expect(sets).toHaveLength(10); // warm-up, 8 x 100 m, cool-down
    expect(sets.filter((s) => s.type === 'normal').map((s) => s.distanceM)).toEqual(Array(8).fill(100));
    expect(sets[0]).toMatchObject({ type: 'warmup', distanceM: 200 });
  });

  it('a brick template has bike first, then run, and starts as a brick workout', () => {
    const t = templateFromPreset(preset('brick'));
    expect(t.exercises.map((e) => e.exerciseId)).toEqual([SPORT_EXERCISE.bike, SPORT_EXERCISE.run]);
    const w = workoutFromTemplate(t, 1);
    expect(w.sport).toBe('brick');
    expect(w.exercises.map((e) => e.order)).toEqual([0, 1]);
  });

  it('core uses the strength exercise', () => {
    expect(templateFromPreset(preset('core')).exercises[0].exerciseId).toBe('Core_and_Mobility');
  });
});

describe('sports helpers', () => {
  it('counts distance-only steps per sport', () => {
    expect(stepSeconds('run', { distanceM: 1000 })).toBeCloseTo(360);
    expect(stepSeconds('bike', { distanceM: 10_000 })).toBeCloseTo(1440);
    expect(stepSeconds('swim', { distanceM: 100 })).toBeCloseTo(120);
    expect(stepSeconds('swim', { durationSec: 90, distanceM: 100 })).toBe(90);
    expect(blocksSeconds('swim', [{ repeat: 4, steps: [{ intensity: 'easy', distanceM: 100 }] }])).toBeCloseTo(480);
  });
  it('partsOf falls back to a single run part', () => {
    expect(partsOf({ blocks: [] })).toEqual([{ sport: 'run', blocks: [] }]);
    expect(partsOf({ sport: 'brick', blocks: [] })[0].sport).toBe('run');
    expect(partsOf({ sport: 'swim', blocks: [] })[0].sport).toBe('swim');
    const parts = [{ sport: 'bike' as const, blocks: [] }];
    expect(partsOf({ sport: 'brick', blocks: undefined, parts })).toBe(parts);
  });
});

const session = (over: Partial<PlannedSession>): PlannedSession => ({ id: 's', planId: 'p', weekIndex: 0, date: '2026-10-27', sport: 'run', kind: 'easy', ...over });

describe('planned sessions with parts', () => {
  const brick = session({ sport: 'brick', kind: 'brick', title: 'Koppeltraining', parts: preset('brick').parts });
  const swim = session({ sport: 'swim', blocks: preset('swim-technique').parts[0].blocks });

  it('plannedSeconds adds the parts and uses swim speeds', () => {
    expect(plannedSeconds(brick)).toBe(45 * 60 + 15 * 60);
    expect(plannedSeconds(swim)).toBeCloseTo((200 + 800 + 100) * 1.2);
  });

  it('plannedLoad adds the parts by zone', () => {
    expect(plannedLoad(brick)).toBeCloseTo(points(45 * 60, ZONE_IF[2]) + points(15 * 60, ZONE_IF[3]));
  });

  it('workoutFromSession builds one exercise per part', () => {
    const w = workoutFromSession(brick, 5);
    expect(w).toMatchObject({ sport: 'brick', name: 'Koppeltraining', plannedSessionId: 's' });
    expect(w.exercises.map((e) => e.exerciseId)).toEqual(['Bicycling', 'Running']);
    const s = workoutFromSession(swim, 5);
    expect(s.exercises[0].exerciseId).toBe('Swimming');
    expect(s.exercises[0].sets[1]).toMatchObject({ distanceM: 100 });
    expect(workoutFromSession(session({ sport: 'bike' }), 5).exercises[0].exerciseId).toBe('Bicycling');
    expect(workoutFromSession(session({ sport: 'swim' }), 5).name).toBe('Schwimmen');
  });
});

describe('formatSet', () => {
  it('shows swim distances in metres', () => {
    const set = { id: 's', type: 'normal' as const, completed: true, distanceM: 400, durationSec: 500 };
    expect(formatSet(set, 'distance_duration', 'kg', 'swim')).toBe('400 m · 8:20');
    expect(formatSet(set, 'distance_duration', 'kg', 'run')).toBe('0,4 km · 8:20');
    expect(formatSet(set, 'distance_duration', 'kg')).toBe('0,4 km · 8:20');
  });
});

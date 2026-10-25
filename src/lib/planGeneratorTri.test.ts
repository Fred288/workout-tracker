import { describe, expect, it } from 'vitest';
import type { Weekday } from '../db/types';
import { addDays, weekdayIndex } from './dates';
import { plannedSeconds } from './endurance';
import { daysAfterLong, generateTriPlan, isTriGoal, weekLayout, type TriGeneratorInput } from './planGeneratorTri';
import { partsOf } from './sports';

// Monday 2026-10-26 start, sprint race on Sunday 2027-02-14 (16 weeks incl. race week).
const base: TriGeneratorInput = {
  goalType: 'sprint',
  targetDate: '2027-02-14',
  startDate: '2026-10-26',
  firstDate: '2026-10-26',
  days: [0, 1, 2, 3, 5, 6] as Weekday[], // Mon-Thu, Sat, Sun
  longDay: 5, // Saturday
  level: 'beginner',
  hoursPerWeek: 5,
};

const sportsOf = (s: { sport: string; parts?: { sport: string }[] }) => (s.parts ? s.parts.map((p) => p.sport) : [s.sport]);

describe('layout', () => {
  it('orders the other days from the day after the long day', () => {
    expect(daysAfterLong([0, 1, 2, 3, 5, 6] as Weekday[], 5)).toEqual([6, 0, 1, 2, 3]);
  });
  it('puts the long run the day after the long day and combines sessions on fewer days', () => {
    const six = weekLayout(base.days, 5);
    expect(six.get(6)).toEqual(['runLong']);
    expect([...six.values()].flat().sort()).toEqual(['bikeInt', 'core', 'runInt', 'runLong', 'swimA', 'swimB']);
    const four = weekLayout([1, 3, 5, 6] as Weekday[], 5);
    expect([...four.values()]).toEqual([['runLong'], ['swimA', 'core'], ['swimB', 'runInt']]);
  });
  it('recognises triathlon goals', () => {
    expect(isTriGoal('sprint')).toBe(true);
    expect(isTriGoal('olympic')).toBe(true);
    expect(isTriGoal('marathon')).toBe(false);
  });
});

describe('generateTriPlan', () => {
  const r = generateTriPlan(base);
  const inWeek = (i: number) => r.sessions.filter((s) => s.weekIndex === i);

  it('builds 16 weeks with phases, recovery weeks, one taper week and the race week', () => {
    expect(r.weeks).toHaveLength(16);
    expect(r.weeks.at(-1)!.phase).toBe('race');
    expect(r.weeks.at(-2)!.phase).toBe('taper');
    expect(r.weeks[0].phase).toBe('base');
    expect(r.weeks.some((w) => w.phase === 'build')).toBe(true);
    expect(r.weeks.some((w) => w.phase === 'peak')).toBe(true);
    expect(r.weeks.filter((w) => w.isRecovery).length).toBeGreaterThanOrEqual(4);
    expect(r.warnings).toEqual([]);
  });

  it('a training week has 2 swims, 2 rides, 2 runs and 1 core session', () => {
    const counts = (i: number) => {
      const c: Record<string, number> = {};
      for (const s of inWeek(i)) for (const sp of sportsOf(s)) c[sp] = (c[sp] ?? 0) + 1;
      return c;
    };
    // Week 1 (base, no brick yet): long ride is one bike session.
    expect(counts(0)).toEqual({ swim: 2, bike: 2, run: 2, strength: 1 });
    // A build week: brick adds a run on the long day.
    const build = r.weeks.find((w) => w.phase === 'build' && !w.isRecovery)!;
    expect(counts(build.index)).toEqual({ swim: 2, bike: 2, run: 3, strength: 1 });
  });

  it('puts the long ride or brick on the long day and the long run the day after', () => {
    for (const w of r.weeks.slice(0, -1)) {
      const long = inWeek(w.index).find((s) => s.kind === 'brick' || (s.kind === 'long' && s.sport === 'bike'))!;
      expect(weekdayIndex(long.date)).toBe(5);
      const run = inWeek(w.index).find((s) => s.kind === 'long' && s.sport === 'run')!;
      expect(weekdayIndex(run.date)).toBe(6);
    }
  });

  it('starts bricks from the build phase or 40 % into the plan', () => {
    const firstBrick = r.sessions.find((s) => s.kind === 'brick')!;
    expect(firstBrick.weekIndex).toBeGreaterThanOrEqual(4);
    expect(firstBrick.parts!.map((p) => p.sport)).toEqual(['bike', 'run']);
    expect(r.sessions.filter((s) => s.weekIndex > firstBrick.weekIndex && s.weekIndex < 15 && s.sport === 'bike' && s.kind === 'long')).toHaveLength(0);
  });

  it('keeps base and recovery weeks free of intervals and tempo', () => {
    for (const w of r.weeks) {
      const q = inWeek(w.index).filter((s) => s.kind === 'intervals' || s.kind === 'tempo');
      if (w.phase === 'base' || w.isRecovery || w.phase === 'race') expect(q).toHaveLength(0);
    }
    const build = r.weeks.find((w) => w.phase === 'build' && !w.isRecovery)!;
    expect(inWeek(build.index).filter((s) => s.kind === 'intervals' || s.kind === 'tempo').length).toBeGreaterThanOrEqual(2);
  });

  it('grows the weekly volume from about the current hours to ~7 h, then tapers', () => {
    const minutes = (i: number) => inWeek(i).filter((s) => s.kind !== 'race').reduce((n, s) => n + plannedSeconds(s), 0) / 60;
    expect(minutes(0)).toBeGreaterThan(250);
    expect(minutes(0)).toBeLessThan(380);
    const peak = Math.max(...r.weeks.slice(0, -2).map((w) => minutes(w.index)));
    expect(peak).toBeGreaterThan(400);
    expect(peak).toBeLessThan(520);
    expect(minutes(14)).toBeLessThan(peak);
    expect(minutes(15)).toBeLessThan(minutes(14));
  });

  it('race week: openers early, none the day before, a three-part race on the target date', () => {
    const week = inWeek(15);
    const raceSession = week.at(-1)!;
    expect(raceSession).toMatchObject({ kind: 'race', date: '2027-02-14', sport: 'brick', title: 'Wettkampf: Sprint-Triathlon' });
    expect(partsOf(raceSession).map((p) => [p.sport, p.blocks[0].steps[0].distanceM])).toEqual([
      ['swim', 750],
      ['bike', 20_000],
      ['run', 5000],
    ]);
    expect(week.some((s) => s.date === addDays('2027-02-14', -1))).toBe(false);
    expect(week.filter((s) => s.kind !== 'race').map((s) => s.sport)).toEqual(['swim', 'bike', 'run']);
  });

  it('only plans from the first date on and keeps past weeks', () => {
    const past = r.weeks;
    const later = generateTriPlan({ ...base, firstDate: '2026-12-02', pastWeeks: past });
    expect(later.sessions.every((s) => s.date >= '2026-12-02')).toBe(true);
    expect(later.weeks.slice(0, 5)).toEqual(past.slice(0, 5));
  });

  it('warns for short preparation, few days and low volume', () => {
    const w = generateTriPlan({ ...base, targetDate: '2026-12-20', days: [1, 3, 5] as Weekday[], hoursPerWeek: 1 }).warnings;
    expect(w.some((x) => x.includes('mindestens 12 Wochen'))).toBe(true);
    expect(w.some((x) => x.includes('Trainingstagen'))).toBe(true);
    expect(w.some((x) => x.includes('gering'))).toBe(true);
  });

  it('olympic distance has longer sessions and race distances', () => {
    const o = generateTriPlan({ ...base, goalType: 'olympic', targetDate: '2027-03-14', hoursPerWeek: 6 });
    const race = o.sessions.at(-1)!;
    expect(partsOf(race).map((p) => p.blocks[0].steps[0].distanceM)).toEqual([1500, 40_000, 10_000]);
    const longRide = (res: typeof o) => Math.max(...res.sessions.filter((s) => s.kind === 'brick' || (s.sport === 'bike' && s.kind === 'long')).map((s) => partsOf(s)[0].blocks[0].steps[0].durationSec ?? 0));
    expect(longRide(o)).toBeGreaterThan(longRide(r));
  });

  it('validates the input', () => {
    expect(() => generateTriPlan({ ...base, days: [5, 6] as Weekday[] })).toThrow();
    expect(() => generateTriPlan({ ...base, longDay: 4 })).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import type { Weekday } from '../db/types';
import { addDays, weekdayIndex } from './dates';
import { formatMinutes, generatePlan, loadFactors, pickQualityDays, trainingPhases, type GeneratorInput } from './planGenerator';

// Monday 2026-10-26 start, marathon on Sunday 2027-04-11 (24 weeks incl. race week).
const base: GeneratorInput = {
  goalType: 'marathon',
  targetDate: '2027-04-11',
  startDate: '2026-10-26',
  firstDate: '2026-10-26',
  runDays: [1, 3, 6] as Weekday[], // Tue, Thu, Sun
  longRunDay: 6,
  level: 'beginner',
  baselineLongRunMin: 60,
};

const minutesOf = (s: { blocks?: { repeat: number; steps: { durationSec?: number }[] }[] }) =>
  (s.blocks ?? []).reduce((n, b) => n + b.repeat * b.steps.reduce((m, x) => m + (x.durationSec ?? 0), 0), 0) / 60;

describe('formatMinutes', () => {
  it('formats short and long durations', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(90)).toBe('1:30 h');
    expect(formatMinutes(180)).toBe('3:00 h');
  });
});

describe('trainingPhases', () => {
  it('splits roughly 40/40/20 and keeps the order', () => {
    const p = trainingPhases(20);
    expect(p.filter((x) => x === 'base')).toHaveLength(8);
    expect(p.filter((x) => x === 'peak')).toHaveLength(4);
    expect(p.filter((x) => x === 'build')).toHaveLength(8);
    expect(p.indexOf('build')).toBeGreaterThan(p.lastIndexOf('base'));
    expect(p.indexOf('peak')).toBeGreaterThan(p.lastIndexOf('build'));
  });
  it('uses build only for short plans', () => {
    expect(trainingPhases(3)).toEqual(['build', 'build', 'build']);
    expect(trainingPhases(0)).toEqual([]);
  });
});

describe('loadFactors', () => {
  it('marks every third training week as recovery, not the last one', () => {
    const f = loadFactors(9, 0, 0.5);
    expect(f.map((x) => x.recovery)).toEqual([false, false, true, false, false, true, false, false, false]);
  });
  it('never grows more than 10 % between training weeks and recovery weeks drop 20 %', () => {
    const f = loadFactors(20, 2, 0.35);
    let last = 0;
    for (const x of f.slice(0, 20)) {
      if (x.recovery) {
        expect(x.p).toBeCloseTo(last * 0.8);
        continue;
      }
      if (last) expect(x.p).toBeLessThanOrEqual(last * 1.1 + 1e-9);
      last = x.p;
    }
  });
  it('reaches the peak when there is enough time and tapers afterwards', () => {
    const f = loadFactors(18, 2, 0.6);
    const peak = Math.max(...f.slice(0, 18).map((x) => x.p));
    expect(peak).toBeCloseTo(1);
    expect(f[18].p).toBeCloseTo(0.75);
    expect(f[19].p).toBeCloseTo(0.55);
  });
});

describe('pickQualityDays', () => {
  it('picks days far from the long run and never two in a row', () => {
    expect(pickQualityDays([1, 3, 6], 6, 1)).toEqual([3]);
    const two = pickQualityDays([0, 1, 2, 3, 6], 6, 2);
    expect(two).toHaveLength(2);
    expect(Math.abs(two[0] - two[1])).toBeGreaterThan(1);
    expect(two).not.toContain(6);
  });
  it('falls back to adjacent days when nothing else is free', () => {
    expect(pickQualityDays([2, 3, 6], 6, 2)).toEqual([2, 3]);
  });
});

describe('generatePlan', () => {
  it('builds 24 weeks with phases, recovery weeks, taper and race week', () => {
    const r = generatePlan(base);
    expect(r.weeks).toHaveLength(24);
    expect(r.weeks.at(-1)!.phase).toBe('race');
    expect(r.weeks.slice(-3, -1).map((w) => w.phase)).toEqual(['taper', 'taper']);
    expect(r.weeks[0].phase).toBe('base');
    expect(r.weeks.some((w) => w.phase === 'peak')).toBe(true);
    expect(r.weeks.filter((w) => w.isRecovery).length).toBeGreaterThanOrEqual(6);
    expect(r.warnings).toEqual([]);
  });

  it('places sessions only on run days, long run on the chosen day', () => {
    const r = generatePlan(base);
    for (const s of r.sessions) {
      if (s.kind === 'race') continue;
      expect(base.runDays).toContain(weekdayIndex(s.date));
    }
    const longs = r.sessions.filter((s) => s.kind === 'long');
    expect(longs.every((s) => weekdayIndex(s.date) === 6)).toBe(true);
    expect(longs).toHaveLength(23);
  });

  it('progresses the long run to 3 h, at most +10 % between training weeks', () => {
    const r = generatePlan(base);
    const longs = r.sessions.filter((s) => s.kind === 'long').map(minutesOf);
    expect(longs[0]).toBe(60);
    expect(Math.max(...longs)).toBe(180);
    const recovery = new Set(r.weeks.filter((w) => w.isRecovery).map((w) => w.index));
    const training = r.sessions.filter((s) => s.kind === 'long' && !recovery.has(s.weekIndex)).map(minutesOf);
    for (let i = 1; i < training.length; i++) {
      // Rounding to 5 min may add a little on top of 10 %.
      if (training[i] > training[i - 1]) expect(training[i]).toBeLessThanOrEqual(training[i - 1] * 1.1 + 5);
    }
  });

  it('tapers: race week volume is far below the peak week', () => {
    const r = generatePlan(base);
    const weekMinutes = (i: number) => r.sessions.filter((s) => s.weekIndex === i && s.kind !== 'race').reduce((n, s) => n + minutesOf(s), 0);
    const peak = Math.max(...r.weeks.map((w) => weekMinutes(w.index)));
    expect(weekMinutes(21)).toBeLessThan(peak);
    expect(weekMinutes(22)).toBeLessThan(weekMinutes(21));
    expect(weekMinutes(23)).toBeLessThan(weekMinutes(22));
  });

  it('race week: race on the target date, no run the day before, nothing after', () => {
    const r = generatePlan(base);
    const raceWeek = r.sessions.filter((s) => s.weekIndex === 23);
    expect(raceWeek.at(-1)).toMatchObject({ kind: 'race', date: '2027-04-11', title: 'Wettkampf: Marathon' });
    expect(raceWeek.some((s) => s.date === addDays('2027-04-11', -1))).toBe(false);
    expect(r.sessions.every((s) => s.date <= '2027-04-11')).toBe(true);
  });

  it('beginners: no quality in base and recovery weeks, at most one otherwise', () => {
    const r = generatePlan(base);
    for (const w of r.weeks) {
      const q = r.sessions.filter((s) => s.weekIndex === w.index && (s.kind === 'tempo' || s.kind === 'intervals'));
      if (w.phase === 'base' || w.isRecovery || w.phase === 'race') expect(q).toHaveLength(0);
      else expect(q.length).toBeLessThanOrEqual(1);
    }
  });

  it('intermediate with 5 days: two non-adjacent quality days in build weeks', () => {
    const r = generatePlan({ ...base, level: 'intermediate', runDays: [0, 1, 3, 4, 6] as Weekday[] });
    const build = r.weeks.find((w) => w.phase === 'build' && !w.isRecovery)!;
    const q = r.sessions.filter((s) => s.weekIndex === build.index && (s.kind === 'tempo' || s.kind === 'intervals'));
    expect(q).toHaveLength(2);
    expect(Math.abs(weekdayIndex(q[0].date) - weekdayIndex(q[1].date))).toBeGreaterThan(1);
  });

  it('peak long runs end with a zone 3 block for the marathon', () => {
    const r = generatePlan(base);
    const peak = r.weeks.find((w) => w.phase === 'peak' && !w.isRecovery)!;
    const long = r.sessions.find((s) => s.weekIndex === peak.index && s.kind === 'long')!;
    expect(long.blocks![0].steps.at(-1)).toMatchObject({ intensity: 'steady', zone: 3 });
  });

  it('does not plan anything before the first date and keeps past week phases', () => {
    const past = generatePlan(base).weeks;
    const r = generatePlan({ ...base, firstDate: '2026-12-02', pastWeeks: past });
    expect(r.sessions.every((s) => s.date >= '2026-12-02')).toBe(true);
    expect(r.weeks.slice(0, 5)).toEqual(past.slice(0, 5));
    // The progression restarts from the current week: the first long run is the baseline.
    expect(minutesOf(r.sessions.find((s) => s.kind === 'long')!)).toBe(60);
  });

  it('warns about short preparation and a low baseline', () => {
    const r = generatePlan({ ...base, targetDate: '2026-12-20', baselineLongRunMin: 30 });
    expect(r.warnings.some((w) => w.includes('mindestens 12 Wochen'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('noch kurz'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('10 %'))).toBe(true);
    expect(r.sessions.at(-1)!.kind).toBe('race');
  });

  it('works for shorter goals: 5k without taper', () => {
    const r = generatePlan({ ...base, goalType: '5k', targetDate: '2026-12-20', baselineLongRunMin: 40 });
    expect(r.weeks.some((w) => w.phase === 'taper')).toBe(false);
    expect(r.sessions.at(-1)).toMatchObject({ kind: 'race', title: 'Wettkampf: 5 km' });
    expect(Math.max(...r.sessions.filter((s) => s.kind === 'long').map(minutesOf))).toBeLessThanOrEqual(75);
  });

  it('validates the input', () => {
    expect(() => generatePlan({ ...base, runDays: [6] as Weekday[] })).toThrow();
    expect(() => generatePlan({ ...base, longRunDay: 5 })).toThrow();
    expect(() => generatePlan({ ...base, goalType: 'sprint' })).toThrow();
  });
});

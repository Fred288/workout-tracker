import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { previewPlan, wizardDefaults } from './planPreview';

const today = '2026-10-26'; // Monday

describe('wizardDefaults', () => {
  it('gives triathlon six days with the long ride on Saturday', () => {
    expect(wizardDefaults('sprint', 'beginner')).toMatchObject({ days: [0, 1, 2, 3, 5, 6], longDay: 5 });
  });
  it('gives marathon more days for advanced runners and always includes the long day', () => {
    for (const g of ['5k', '10k', 'half', 'marathon', 'olympic'] as const)
      for (const l of ['beginner', 'intermediate'] as const) {
        const d = wizardDefaults(g, l);
        expect(d.days).toContain(d.longDay);
      }
    expect(wizardDefaults('marathon', 'intermediate').days.length).toBeGreaterThan(wizardDefaults('marathon', 'beginner').days.length);
  });
});

describe('previewPlan', () => {
  it('summarises a marathon plan without storing anything', () => {
    const d = wizardDefaults('marathon', 'beginner');
    const p = previewPlan({ goalType: 'marathon', targetDate: addDays(today, 20 * 7 + 6), today, level: 'beginner', ...d });
    expect(p.weekCount).toBe(21);
    expect(p.phases.race).toBe(1);
    expect(p.peakMinutes).toBeGreaterThan(p.startMinutes);
    expect(p.exampleWeek.length).toBe(d.days.length);
    expect(p.exampleWeek.every((s) => s.minutes > 0)).toBe(true);
  });
  it('works for triathlon and reports warnings for a short preparation', () => {
    const d = wizardDefaults('sprint', 'beginner');
    const p = previewPlan({ goalType: 'sprint', targetDate: addDays(today, 8 * 7 + 6), today, level: 'beginner', ...d });
    expect(p.warnings.length).toBeGreaterThan(0);
    expect(p.exampleWeek.length).toBeGreaterThanOrEqual(6);
  });
  it('throws on invalid days', () => {
    expect(() => previewPlan({ goalType: 'marathon', targetDate: addDays(today, 140), today, level: 'beginner', days: [6], longDay: 6, baseline: 60 })).toThrow();
  });
});

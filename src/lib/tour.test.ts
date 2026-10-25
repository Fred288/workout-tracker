import { describe, expect, it } from 'vitest';
import { TOUR_STEPS, TOUR_TARGETS } from './tour';

const ROUTES = ['/workout', '/exercises', '/records', '/history', '/endurance', '/profile', '/settings'];

describe('tour steps', () => {
  it('have unique ids and texts for every step', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUR_STEPS) {
      expect(s.title.trim()).not.toBe('');
      expect(s.text.length).toBeGreaterThan(30);
    }
  });

  it('only use routes the app has and only known anchors', () => {
    for (const s of TOUR_STEPS) {
      expect(ROUTES).toContain(s.route);
      if (s.target) expect(TOUR_TARGETS).toContain(s.target);
    }
  });

  it('start and end on the start page, and use every anchor', () => {
    expect(TOUR_STEPS[0].route).toBe('/workout');
    expect(TOUR_STEPS.at(-1)!.route).toBe('/workout');
    const used = new Set(TOUR_STEPS.map((s) => s.target).filter(Boolean));
    for (const t of TOUR_TARGETS) expect(used.has(t)).toBe(true);
  });
});

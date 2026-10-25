import type { PlannedSession, SessionBlock, SessionPart, SessionStep, Sport, WorkoutSport } from '../db/types';

/** Library exercise each sport is filed under (seed ids). */
export const SPORT_EXERCISE: Record<Sport, string> = {
  run: 'Running',
  bike: 'Bicycling',
  swim: 'Swimming',
  strength: 'Core_and_Mobility',
};

export const SPORT_LABEL: Record<WorkoutSport, string> = {
  run: 'Laufen',
  bike: 'Rad',
  swim: 'Schwimmen',
  brick: 'Koppel',
  strength: 'Stabi',
};

/** Seconds per metre that distance-only steps are counted at when planning (about 6:00/km, 25 km/h, 2:00/100 m). */
const SEC_PER_M: Record<Sport, number> = { run: 0.36, bike: 0.144, swim: 1.2, strength: 0 };

export const stepSeconds = (sport: Sport, st: Pick<SessionStep, 'durationSec' | 'distanceM'>): number =>
  st.durationSec ?? (st.distanceM ?? 0) * SEC_PER_M[sport];

/** The exercises of a planned session: its parts, or its single block list as one part. */
export function partsOf(s: Pick<PlannedSession, 'blocks'> & Partial<Pick<PlannedSession, 'parts' | 'sport'>>): SessionPart[] {
  if (s.parts?.length) return s.parts;
  const sport: Sport = !s.sport || s.sport === 'brick' ? 'run' : s.sport;
  return [{ sport, blocks: s.blocks ?? [] }];
}

/** Total seconds of a block list, repeats included. */
export const blocksSeconds = (sport: Sport, blocks: SessionBlock[]): number =>
  blocks.reduce((n, b) => n + b.repeat * b.steps.reduce((m, st) => m + stepSeconds(sport, st), 0), 0);

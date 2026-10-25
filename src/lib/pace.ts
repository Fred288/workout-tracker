import type { Sport, WorkoutSet } from '../db/types';
import { formatClock } from './format';
import { formatNumber } from './units';

/** Seconds per km, or undefined without a usable distance and duration. */
export function paceSecPerKm(distanceM?: number, durationSec?: number): number | undefined {
  if (!distanceM || !durationSec || distanceM <= 0 || durationSec <= 0) return undefined;
  return (durationSec / distanceM) * 1000;
}

/** Seconds per 100 m (swimming). */
export function pacePer100m(distanceM?: number, durationSec?: number): number | undefined {
  if (!distanceM || !durationSec || distanceM <= 0 || durationSec <= 0) return undefined;
  return (durationSec / distanceM) * 100;
}

export function speedKmh(distanceM?: number, durationSec?: number): number | undefined {
  if (!distanceM || !durationSec || distanceM <= 0 || durationSec <= 0) return undefined;
  return (distanceM / 1000 / durationSec) * 3600;
}

/** "5:30 /km" for running, "2:05 /100 m" for swimming, "28,8 km/h" for cycling. */
export function formatPace(sport: Sport | undefined, distanceM?: number, durationSec?: number): string {
  if (sport === 'bike') {
    const v = speedKmh(distanceM, durationSec);
    return v === undefined ? '' : `${formatNumber(Math.round(v * 10) / 10)} km/h`;
  }
  if (sport === 'swim') {
    const p = pacePer100m(distanceM, durationSec);
    return p === undefined ? '' : `${formatClock(p)} /100 m`;
  }
  const p = paceSecPerKm(distanceM, durationSec);
  return p === undefined ? '' : `${formatClock(p)} /km`;
}

export const setPace = (sport: Sport | undefined, s: WorkoutSet) => formatPace(sport, s.distanceM, s.durationSec);

/** Short endurance extras for a set: "Z2 · 145 bpm · RPE 6". */
export function formatSetExtras(s: WorkoutSet): string {
  return [
    s.zone ? `Z${s.zone}` : '',
    s.avgHr ? `${s.avgHr} bpm` : '',
    s.avgPowerW ? `${s.avgPowerW} W` : '',
    s.rpe ? `RPE ${s.rpe}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Pace plus extras for history lists: "5:30 /km · Z2 · 145 bpm". Empty for strength sets. */
export function setDetail(sport: Sport | undefined, s: WorkoutSet): string {
  if (!sport || sport === 'strength') return '';
  return [setPace(sport, s), formatSetExtras(s)].filter(Boolean).join(' · ');
}

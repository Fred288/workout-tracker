import type { ExerciseType, WorkoutSet } from '../db/types';
import { formatNumber, kgToUnit, type WeightUnit } from './units';

const pad = (n: number) => String(n).padStart(2, '0');

/** 754 s -> "12:34", 3723 s -> "1:02:03". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Parses "1:30", "90" or "1:02:03" into seconds. */
export function parseClock(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return undefined;
  return t.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** Human duration for summaries: "1 h 05 min", "42 min". */
export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${pad(min % 60)} min` : `${min} min`;
}

/** Short text for a set, e.g. "60 kg × 8", "+10 kg × 8", "12 Wdh.", "1:30", "2,5 km · 12:00". */
export function formatSet(s: WorkoutSet, type: ExerciseType, unit: WeightUnit, sport?: string): string {
  const w = (kg: number) => `${formatNumber(kgToUnit(kg, unit))} ${unit}`;
  switch (type) {
    case 'weight_reps':
      return s.weightKg !== undefined && s.reps !== undefined
        ? `${w(s.weightKg)} × ${s.reps}`
        : s.reps !== undefined
          ? `${s.reps} Wdh.`
          : '–';
    case 'bodyweight_reps':
    case 'assisted_bodyweight': {
      if (s.reps === undefined) return '–';
      if (!s.weightKg) return `${s.reps} Wdh.`;
      return `${type === 'assisted_bodyweight' ? '−' : '+'}${w(s.weightKg)} × ${s.reps}`;
    }
    case 'duration':
      return s.durationSec !== undefined ? formatClock(s.durationSec) : '–';
    case 'distance_duration': {
      const parts = [
        s.distanceM !== undefined ? (sport === 'swim' ? `${Math.round(s.distanceM)} m` : `${formatNumber(s.distanceM / 1000)} km`) : '',
        s.durationSec !== undefined ? formatClock(s.durationSec) : '',
      ].filter(Boolean);
      return parts.join(' · ') || '–';
    }
  }
}

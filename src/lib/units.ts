import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';

export type WeightUnit = 'kg' | 'lb';

const KG_PER_LB = 0.45359237;

/** Weights are always stored in kg; this converts for display, rounded to 0.1. */
export function kgToUnit(kg: number, unit: WeightUnit): number {
  const v = unit === 'kg' ? kg : kg / KG_PER_LB;
  return Math.round(v * 10) / 10;
}

export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

/** Formats a number the German way (comma decimal, no trailing zeros). */
export function formatNumber(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

/** Parses user input like "62,5" or "62.5"; empty or invalid input yields undefined. */
export function parseNumber(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function useWeightUnit(): WeightUnit {
  return useLiveQuery(() => db.profile.get('me').then((p) => p?.unit ?? 'kg'), []) ?? 'kg';
}

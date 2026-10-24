import type { ExerciseType } from '../db/types';
import { formatClock, formatSet } from './format';
import type { RecordKind, RecordValue } from './records';
import { formatNumber, kgToUnit, type WeightUnit } from './units';

export function recordLabel(kind: RecordKind, type: ExerciseType): string {
  switch (kind) {
    case 'maxWeight':
      return type === 'bodyweight_reps' ? 'Höchstes Zusatzgewicht' : 'Höchstes Gewicht';
    case 'maxReps':
      return 'Meiste Wiederholungen';
    case 'bestSetVolume':
      return 'Bester Satz';
    case 'best1RM':
      return 'Geschätztes 1RM';
    case 'longestDuration':
      return 'Längste Dauer';
    case 'longestDistance':
      return 'Längste Distanz';
    case 'leastAssistance':
      return 'Geringste Unterstützung';
  }
}

export const BADGE_LABELS: Record<RecordKind, string> = {
  maxWeight: 'Gewicht',
  maxReps: 'Wdh.',
  bestSetVolume: 'Bester Satz',
  best1RM: '1RM',
  longestDuration: 'Dauer',
  longestDistance: 'Distanz',
  leastAssistance: 'Unterstützung',
};

export const weightText = (kg: number, unit: WeightUnit) => `${formatNumber(kgToUnit(kg, unit))} ${unit}`;

/** Main value of a record, e.g. "100 kg", "15 Wdh.", "1:35". */
export function recordValueText(kind: RecordKind, r: RecordValue, type: ExerciseType, unit: WeightUnit): string {
  switch (kind) {
    case 'maxWeight':
    case 'best1RM':
    case 'leastAssistance':
      return weightText(r.value, unit);
    case 'maxReps':
      return `${r.value} Wdh.`;
    case 'bestSetVolume':
      return formatSet(r.set, type, unit);
    case 'longestDuration':
      return formatClock(r.value);
    case 'longestDistance':
      return `${formatNumber(r.value / 1000)} km`;
  }
}

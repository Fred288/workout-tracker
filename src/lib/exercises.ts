import type { Equipment, Exercise } from '../db/types';
import type { MuscleId } from './muscleMap';

export type EquipmentFilter = 'all' | 'none' | 'any' | Exclude<Equipment, 'none'>;

export interface ExerciseFilters {
  query: string;
  equipment: EquipmentFilter; // 'any' = needs some equipment
  muscle: MuscleId | 'all';
  category: string | 'all';
  customOnly: boolean;
}

export const EMPTY_FILTERS: ExerciseFilters = {
  query: '',
  equipment: 'all',
  muscle: 'all',
  category: 'all',
  customOnly: false,
};

export function displayName(e: Pick<Exercise, 'name' | 'nameDe'>): string {
  return e.nameDe || e.name;
}

export function displayInstructions(e: Pick<Exercise, 'instructions' | 'instructionsDe'>): string[] {
  return e.instructionsDe?.length ? e.instructionsDe : e.instructions;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

function matchesEquipment(e: Exercise, f: EquipmentFilter): boolean {
  if (f === 'all') return true;
  if (f === 'any') return e.equipment !== 'none';
  return e.equipment === f;
}

/** Filters and sorts exercises alphabetically by display name. All search words must match (German or English name). */
export function filterExercises(list: Exercise[], f: ExerciseFilters): Exercise[] {
  const words = normalize(f.query).split(/\s+/).filter(Boolean);
  return list
    .filter((e) => {
      if (f.customOnly && !e.isCustom) return false;
      if (!matchesEquipment(e, f.equipment)) return false;
      if (f.muscle !== 'all' && !e.primaryMuscles.includes(f.muscle)) return false;
      if (f.category !== 'all' && e.category !== f.category) return false;
      if (words.length) {
        const hay = normalize(`${e.name} ${e.nameDe ?? ''}`);
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    })
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'de', { sensitivity: 'base' }));
}

export function letterOf(name: string): string {
  const c = normalize(name).charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/** Groups an already sorted list by first letter; '#' (digits, symbols) comes first. */
export function groupByLetter(list: Exercise[]): { letter: string; items: Exercise[] }[] {
  const map = new Map<string, Exercise[]>();
  for (const e of list) {
    const l = letterOf(displayName(e));
    const arr = map.get(l);
    if (arr) arr.push(e);
    else map.set(l, [e]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)))
    .map(([letter, items]) => ({ letter, items }));
}

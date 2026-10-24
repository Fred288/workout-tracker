import { create } from 'zustand';
import { EMPTY_FILTERS, type ExerciseFilters } from '../lib/exercises';

// Kept outside the page so filters survive navigating to a detail view and back.
export const useExerciseFilters = create<{
  filters: ExerciseFilters;
  set: (patch: Partial<ExerciseFilters>) => void;
  reset: () => void;
}>((set) => ({
  filters: EMPTY_FILTERS,
  set: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  reset: () => set({ filters: EMPTY_FILTERS }),
}));

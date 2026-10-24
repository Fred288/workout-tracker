import { useState } from 'react';
import ExerciseBrowser from './ExerciseBrowser';
import { EMPTY_FILTERS, type ExerciseFilters } from '../lib/exercises';

/** Full-screen exercise selection for the active workout; keeps the selection order. */
export default function ExercisePicker({
  onAdd,
  onClose,
}: {
  onAdd: (exerciseIds: string[]) => void;
  onClose: () => void;
}) {
  const [filters, setFilters] = useState<ExerciseFilters>(EMPTY_FILTERS);
  const [picked, setPicked] = useState<string[]>([]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Übungen hinzufügen"
      className="fixed inset-0 z-50 overflow-y-auto bg-bg pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto w-full max-w-md px-4 pb-24 md:max-w-3xl md:px-8 lg:max-w-5xl">
        <ExerciseBrowser
          filters={filters}
          onChange={(p) => setFilters((f) => ({ ...f, ...p }))}
          onReset={() => setFilters(EMPTY_FILTERS)}
          selected={new Set(picked)}
          onPick={(e) =>
            setPicked((list) => (list.includes(e.id) ? list.filter((id) => id !== e.id) : [...list, e.id]))
          }
          header={
            <div className="flex items-center justify-between gap-2 pt-3">
              <button className="min-h-11 text-accent" onClick={onClose}>
                Abbrechen
              </button>
              <h1 className="truncate text-lg font-semibold">Übungen</h1>
              <button
                className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-white disabled:opacity-40"
                disabled={!picked.length}
                onClick={() => onAdd(picked)}
              >
                Hinzufügen{picked.length ? ` (${picked.length})` : ''}
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
}

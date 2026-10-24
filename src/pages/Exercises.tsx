import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import type { Equipment } from '../db/types';
import {
  displayName,
  filterExercises,
  groupByLetter,
  type EquipmentFilter,
} from '../lib/exercises';
import { EQUIPMENT_LABELS, categoryLabel } from '../lib/labels';
import { MUSCLES_BY_LABEL, MUSCLE_LABELS, muscleLabel, type MuscleId } from '../lib/muscleMap';
import { exerciseImageUrl } from '../lib/images';
import { useExerciseFilters } from '../store/exerciseFilters';

const EQUIPMENT_OPTIONS: { value: EquipmentFilter; label: string }[] = [
  { value: 'all', label: 'Geräte' },
  { value: 'none', label: 'Ohne Geräte' },
  { value: 'any', label: 'Mit Geräten' },
  ...(Object.keys(EQUIPMENT_LABELS) as Equipment[])
    .filter((k) => k !== 'none')
    .map((k) => ({ value: k as EquipmentFilter, label: EQUIPMENT_LABELS[k] })),
];

const select =
  'min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm';

export default function Exercises() {
  const all = useLiveQuery(() => db.exercises.toArray());
  const { filters, set, reset } = useExerciseFilters();

  const categories = useMemo(
    () => [...new Set((all ?? []).map((e) => e.category).filter((c): c is string => !!c))].sort(),
    [all],
  );
  const groups = useMemo(() => groupByLetter(filterExercises(all ?? [], filters)), [all, filters]);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const active =
    filters.query ||
    filters.equipment !== 'all' ||
    filters.muscle !== 'all' ||
    filters.category !== 'all' ||
    filters.customOnly;

  return (
    <div className="relative">
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-bg px-4 pb-2">
        <div className="flex items-center justify-between pt-4">
          <h1 className="text-2xl font-bold">Übungen</h1>
          <Link
            to="/exercises/new"
            className="flex min-h-11 items-center rounded-lg px-3 font-medium text-accent"
          >
            + Neu
          </Link>
        </div>
        <input
          type="search"
          value={filters.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Suchen"
          className="min-h-11 w-full rounded-lg border border-border bg-surface px-3"
        />
        <div className="flex gap-2">
          <select
            aria-label="Ausrüstung"
            className={select}
            value={filters.equipment}
            onChange={(e) => set({ equipment: e.target.value as EquipmentFilter })}
          >
            {EQUIPMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Muskelgruppe"
            className={select}
            value={filters.muscle}
            onChange={(e) => set({ muscle: e.target.value as MuscleId | 'all' })}
          >
            <option value="all">Muskeln</option>
            {MUSCLES_BY_LABEL.map((m) => (
              <option key={m} value={m}>
                {MUSCLE_LABELS[m]}
              </option>
            ))}
          </select>
          <select
            aria-label="Kategorie"
            className={select}
            value={filters.category}
            onChange={(e) => set({ category: e.target.value })}
          >
            <option value="all">Kategorie</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 pr-5 text-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-accent"
              checked={filters.customOnly}
              onChange={(e) => set({ customOnly: e.target.checked })}
            />
            Eigene Übungen
          </label>
          <span className="ml-auto text-neutral-500">{count} Übungen</span>
          {active && (
            <button className="min-h-11 text-accent" onClick={reset}>
              Zurücksetzen
            </button>
          )}
        </div>
      </div>

      {all === undefined ? null : count === 0 ? (
        <p className="py-8 text-center text-neutral-500">Keine Übung gefunden.</p>
      ) : (
        <div className="pr-6">
          {groups.map((g) => (
            <section key={g.letter} id={`letter-${g.letter}`} className="scroll-mt-48">
              <h2 className="py-1 text-xs font-semibold text-neutral-500">{g.letter}</h2>
              <ul>
                {g.items.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/exercises/${encodeURIComponent(e.id)}`}
                      className="flex min-h-14 items-center gap-3 border-b border-border py-2"
                    >
                      {e.images[0] ? (
                        <img
                          src={exerciseImageUrl(e.images[0])}
                          alt=""
                          loading="lazy"
                          className="size-12 shrink-0 rounded-md bg-white object-cover"
                        />
                      ) : (
                        <div className="size-12 shrink-0 rounded-md bg-surface" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate">{displayName(e)}</div>
                        <div className="truncate text-xs text-neutral-500">
                          {[e.primaryMuscles.map(muscleLabel).join(', '), EQUIPMENT_LABELS[e.equipment]]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {groups.length > 1 && (
        <nav
          aria-label="Buchstaben-Index"
          className="fixed right-[max(0.25rem,calc(50vw-14rem+0.25rem))] top-[58%] z-20 flex -translate-y-1/2 flex-col text-[11px] font-semibold text-accent"
        >
          {groups.map((g) => (
            <button
              key={g.letter}
              className="px-1.5 py-px"
              onClick={() =>
                document.getElementById(`letter-${g.letter}`)?.scrollIntoView({ block: 'start' })
              }
            >
              {g.letter}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import type { Equipment, Exercise } from '../db/types';
import { displayName, filterExercises, groupByLetter, type EquipmentFilter, type ExerciseFilters } from '../lib/exercises';
import { EQUIPMENT_LABELS, categoryLabel } from '../lib/labels';
import { MUSCLES_BY_LABEL, MUSCLE_LABELS, muscleLabel, type MuscleId } from '../lib/muscleMap';
import { exerciseVisual } from '../lib/images';
import { searchExercises } from '../lib/search';

const EQUIPMENT_OPTIONS: { value: EquipmentFilter; label: string }[] = [
  { value: 'all', label: 'Geräte' },
  { value: 'none', label: 'Ohne Geräte' },
  { value: 'any', label: 'Mit Geräten' },
  ...(Object.keys(EQUIPMENT_LABELS) as Equipment[])
    .filter((k) => k !== 'none')
    .map((k) => ({ value: k as EquipmentFilter, label: EQUIPMENT_LABELS[k] })),
];

const select = 'min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm';

function Thumb({ exercise }: { exercise: Exercise }) {
  const { frames, kind } = exerciseVisual(exercise);
  if (!frames.length) return <div className="size-12 shrink-0 rounded-md bg-surface" />;
  // For drawings the end frame usually shows the movement better.
  const src = kind === 'illustration' ? (frames[1] ?? frames[0]) : frames[0];
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`size-12 shrink-0 rounded-md ${
        kind === 'illustration' ? 'border border-border bg-surface object-contain p-0.5' : 'bg-white object-cover'
      }`}
    />
  );
}

function Row({
  exercise: e,
  onPick,
  selected,
}: {
  exercise: Exercise;
  onPick?: (e: Exercise) => void;
  selected?: boolean;
}) {
  const body = (
    <>
      <Thumb exercise={e} />
      <div className="min-w-0 flex-1">
        <div className="truncate">{displayName(e)}</div>
        <div className="truncate text-xs text-neutral-500">
          {[e.primaryMuscles.map(muscleLabel).join(', '), EQUIPMENT_LABELS[e.equipment]].filter(Boolean).join(' · ')}
        </div>
      </div>
      {onPick && (
        <span
          aria-hidden
          className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-sm ${
            selected ? 'border-accent bg-accent text-white' : 'border-border'
          }`}
        >
          {selected ? '✓' : ''}
        </span>
      )}
    </>
  );
  const cls = `flex min-h-14 w-full items-center gap-3 border-b border-border py-2 text-left ${
    selected ? 'bg-accent/10' : ''
  }`;
  return onPick ? (
    <button type="button" className={cls} aria-pressed={selected} onClick={() => onPick(e)}>
      {body}
    </button>
  ) : (
    <Link to={`/exercises/${encodeURIComponent(e.id)}`} className={cls}>
      {body}
    </Link>
  );
}

// minmax(0,1fr) keeps long names from widening the columns (they truncate instead).
const grid = 'grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 md:gap-x-6 lg:grid-cols-3';

/**
 * Search, filters and the exercise list. Used by the Exercises tab (rows link to the
 * detail view) and by the workout picker (rows toggle selection via onPick).
 */
export default function ExerciseBrowser({
  header,
  filters,
  onChange,
  onReset,
  onPick,
  selected,
}: {
  header: ReactNode;
  filters: ExerciseFilters;
  onChange: (patch: Partial<ExerciseFilters>) => void;
  onReset: () => void;
  onPick?: (e: Exercise) => void;
  selected?: Set<string>;
}) {
  const all = useLiveQuery(() => db.exercises.toArray());

  const categories = useMemo(
    () => [...new Set((all ?? []).map((e) => e.category).filter((c): c is string => !!c))].sort(),
    [all],
  );
  // Filters narrow the pool first, then the search runs on it.
  const result = useMemo(() => {
    const pool = filterExercises(all ?? [], { ...filters, query: '' });
    return searchExercises(pool, filters.query);
  }, [all, filters]);
  const searching = filters.query.trim().length > 0;
  const groups = useMemo(() => (searching ? [] : groupByLetter(result.matches)), [result, searching]);
  const active =
    searching || filters.equipment !== 'all' || filters.muscle !== 'all' || filters.category !== 'all' || filters.customOnly;

  const row = (e: Exercise) => (
    <li key={e.id}>
      <Row exercise={e} onPick={onPick} selected={selected?.has(e.id)} />
    </li>
  );

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-bg px-4 pb-2 md:-mx-8 md:px-8">
        {header}
        <input
          type="search"
          value={filters.query}
          onChange={(e) => onChange({ query: e.target.value })}
          placeholder="Suchen, z. B. Bankdrücken, Rudern, Kurzhantel Schulter"
          className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
        />
        <div className="flex gap-2">
          <select
            aria-label="Ausrüstung"
            className={select}
            value={filters.equipment}
            onChange={(e) => onChange({ equipment: e.target.value as EquipmentFilter })}
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
            onChange={(e) => onChange({ muscle: e.target.value as MuscleId | 'all' })}
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
            onChange={(e) => onChange({ category: e.target.value })}
          >
            <option value="all">Kategorie</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-accent"
              checked={filters.customOnly}
              onChange={(e) => onChange({ customOnly: e.target.checked })}
            />
            Eigene Übungen
          </label>
          <span className="ml-auto text-neutral-500">{result.matches.length} Übungen</span>
          {active && (
            <button className="min-h-11 text-accent" onClick={onReset}>
              Zurücksetzen
            </button>
          )}
        </div>
      </div>

      {all === undefined ? null : searching ? (
        <>
          {result.matches.length > 0 ? (
            <ul className={grid}>{result.matches.map(row)}</ul>
          ) : (
            <p className="py-4 text-center text-sm text-neutral-500">Keine genaue Übereinstimmung.</p>
          )}
          {result.similar.length > 0 && (
            <section className="mt-4">
              <h2 className="py-1 text-xs font-semibold uppercase text-neutral-500">Ähnliche Übungen</h2>
              <ul className={grid}>{result.similar.map(row)}</ul>
            </section>
          )}
          {!result.matches.length && !result.similar.length && (
            <p className="text-center text-sm text-neutral-500">
              Nichts gefunden.{' '}
              <Link to="/exercises/new" className="text-accent">
                Eigene Übung anlegen
              </Link>
            </p>
          )}
        </>
      ) : result.matches.length === 0 ? (
        <p className="py-8 text-center text-neutral-500">Keine Übung gefunden.</p>
      ) : (
        <div className="flex">
          <div className="min-w-0 flex-1">
            {groups.map((g) => (
              <section key={g.letter} id={`letter-${g.letter}`} className="scroll-mt-48">
                <h2 className="py-1 text-xs font-semibold text-neutral-500">{g.letter}</h2>
                <ul className={grid}>{g.items.map(row)}</ul>
              </section>
            ))}
          </div>
          {groups.length > 1 && (
            <nav
              aria-label="Buchstaben-Index"
              className="sticky top-52 ml-1 flex h-fit flex-col self-start text-[11px] font-semibold text-accent"
            >
              {groups.map((g) => (
                <button
                  key={g.letter}
                  className="px-1.5 py-px"
                  onClick={() => document.getElementById(`letter-${g.letter}`)?.scrollIntoView({ block: 'start' })}
                >
                  {g.letter}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

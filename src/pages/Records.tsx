import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ExercisesTabs from '../components/ExercisesTabs';
import { db } from '../db/dexie';
import type { Exercise } from '../db/types';
import { displayName } from '../lib/exercises';
import { formatClock } from '../lib/format';
import { weightText } from '../lib/recordLabels';
import { allExerciseRecords, type ExerciseRecordRow } from '../lib/records';
import { searchExercises } from '../lib/search';
import { formatNumber, useWeightUnit } from '../lib/units';

type SortKey = 'recent' | 'name' | 'weight' | 'reps';

/** Main record for the "Bestwert" column, depending on the exercise type. */
function bestText(row: ExerciseRecordRow, ex: Exercise, unit: 'kg' | 'lb'): string {
  if (ex.type === 'duration') return row.longestDuration ? formatClock(row.longestDuration) : '–';
  if (ex.type === 'distance_duration') return row.longestDistance ? (ex.sport === 'swim' ? `${Math.round(row.longestDistance)} m` : `${formatNumber(row.longestDistance / 1000)} km`) : '–';
  if (ex.type === 'assisted_bodyweight') return row.leastAssistance !== undefined ? `−${weightText(row.leastAssistance, unit)}` : '–';
  return row.maxWeight ? weightText(row.maxWeight, unit) : '–';
}

export default function Records() {
  const unit = useWeightUnit();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const data = useLiveQuery(async () => {
    const workouts = await db.workouts.toArray();
    const ids = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
    const list = (await db.exercises.bulkGet(ids)).filter((e): e is Exercise => !!e);
    const exercises = new Map(list.map((e) => [e.id, e]));
    const rows = allExerciseRecords(workouts, new Map(list.map((e) => [e.id, e.type])));
    return { rows, exercises };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const known = data.rows.filter((r) => data.exercises.has(r.exerciseId));
    const allowed = query.trim()
      ? new Set(searchExercises([...data.exercises.values()], query).matches.map((e) => e.id))
      : null;
    const filtered = allowed ? known.filter((r) => allowed.has(r.exerciseId)) : known;
    const name = (r: ExerciseRecordRow) => displayName(data.exercises.get(r.exerciseId)!);
    const by: Record<SortKey, (a: ExerciseRecordRow, b: ExerciseRecordRow) => number> = {
      recent: (a, b) => b.lastDate - a.lastDate,
      name: (a, b) => name(a).localeCompare(name(b), 'de'),
      weight: (a, b) => (b.maxWeight ?? -1) - (a.maxWeight ?? -1),
      reps: (a, b) => (b.maxReps ?? -1) - (a.maxReps ?? -1),
    };
    return [...filtered].sort(by[sort]);
  }, [data, query, sort]);

  return (
    <div className="pb-6">
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-bg px-4 pb-2 pt-4 md:-mx-8 md:px-8">
        <h1 className="text-2xl font-bold">Rekorde</h1>
        <ExercisesTabs />
        <div className="flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Übung suchen"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-base"
          />
          <select
            aria-label="Sortierung"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="min-h-11 rounded-lg border border-border bg-surface px-2 text-sm"
          >
            <option value="recent">Zuletzt</option>
            <option value="name">Name</option>
            <option value="weight">Gewicht</option>
            <option value="reps">Wdh.</option>
          </select>
        </div>
      </div>

      {data === undefined ? null : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          {data.rows.length ? 'Keine Übung gefunden.' : 'Noch keine Rekorde. Beende dein erstes Workout.'}
        </p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-2 font-normal">Übung</th>
              <th className="w-20 py-2 text-right font-normal">Bestwert</th>
              <th className="w-20 py-2 text-right font-normal">Max. Wdh.</th>
              <th className="hidden w-24 py-2 text-right font-normal md:table-cell">Einheiten</th>
              <th className="hidden w-28 py-2 text-right font-normal md:table-cell">Zuletzt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ex = data.exercises.get(r.exerciseId)!;
              return (
                <tr key={r.exerciseId} className="border-t border-border">
                  <td className="py-2 pr-2">
                    <Link to={`/exercises/${encodeURIComponent(ex.id)}`} className="block truncate text-accent">
                      {displayName(ex)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums">{bestText(r, ex, unit)}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{r.maxReps ?? '–'}</td>
                  <td className="hidden py-2 text-right tabular-nums md:table-cell">{r.sessions}</td>
                  <td className="hidden whitespace-nowrap py-2 pl-3 text-right text-neutral-400 md:table-cell">
                    {new Date(r.lastDate).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

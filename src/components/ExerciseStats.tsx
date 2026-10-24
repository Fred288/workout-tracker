import { Suspense, lazy, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import type { Exercise } from '../db/types';
import RecordBadges from './RecordBadges';
import { formatSet } from '../lib/format';
import { recordLabel, recordValueText } from '../lib/recordLabels';
import { RECORD_KINDS, exerciseRecords, exerciseSessions, sessionSeries, workoutRecords } from '../lib/records';
import { isCountingSet } from '../lib/stats';
import { useWeightUnit } from '../lib/units';

// Recharts is large, so it only loads when the charts tab is opened.
const ExerciseCharts = lazy(() => import('./ExerciseCharts'));

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

/** Verlauf, Diagramme and Rekorde tabs of the exercise detail view. */
export default function ExerciseStats({ exercise, tab }: { exercise: Exercise; tab: 'Verlauf' | 'Diagramme' | 'Rekorde' }) {
  const unit = useWeightUnit();
  const workouts = useLiveQuery(() => db.workouts.toArray(), []);
  const stats = useMemo(() => {
    if (!workouts) return undefined;
    const types = new Map([[exercise.id, exercise.type]]);
    const sessions = exerciseSessions(workouts, exercise.id);
    return {
      sessions,
      badges: new Map(
        sessions.map((s) => [s.workoutId, workoutRecords(workouts, s.workoutId, types)[0]?.kinds ?? []]),
      ),
      series: sessionSeries(workouts, exercise.id),
      records: exerciseRecords(workouts, exercise.id, exercise.type),
    };
  }, [workouts, exercise.id, exercise.type]);

  if (!stats) return null;
  if (!stats.sessions.length) {
    return (
      <p className="py-8 text-center text-sm text-neutral-500">Noch keine Daten. Absolviere ein Workout mit dieser Übung.</p>
    );
  }

  if (tab === 'Diagramme') {
    return (
      <Suspense fallback={<p className="py-8 text-center text-sm text-neutral-500">Lade Diagramme …</p>}>
        <ExerciseCharts series={stats.series} type={exercise.type} unit={unit} />
      </Suspense>
    );
  }

  if (tab === 'Rekorde') {
    const kinds = RECORD_KINDS[exercise.type].filter((k) => stats.records[k]);
    if (!kinds.length) return <p className="py-8 text-center text-sm text-neutral-500">Noch keine Rekorde (Aufwärmsätze zählen nicht).</p>;
    return (
      <ul className="grid gap-3 pb-6 sm:grid-cols-2">
        {kinds.map((k) => {
          const r = stats.records[k]!;
          return (
            <li key={k} className="rounded-xl border border-border bg-surface p-4">
              <div className="text-sm text-neutral-400">{recordLabel(k, exercise.type)}</div>
              <div className="text-2xl font-semibold tabular-nums">{recordValueText(k, r, exercise.type, unit)}</div>
              <Link to={`/history/${r.workoutId}`} className="text-xs text-accent">
                {longDate(r.date)}
                {k !== 'bestSetVolume' && ` · ${formatSet(r.set, exercise.type, unit)}`}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  const last = stats.sessions[0];
  return (
    <div className="pb-6">
      <p className="mb-3 text-sm text-neutral-400">
        {stats.series.length} Durchführung{stats.series.length === 1 ? '' : 'en'} · zuletzt am {longDate(last.date)}
      </p>
      <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
        {stats.sessions.map((s) => (
          <li key={s.workoutId} className="rounded-xl border border-border bg-surface p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <Link to={`/history/${s.workoutId}`} className="text-sm font-semibold text-accent">
                {longDate(s.date)}
              </Link>
              <RecordBadges kinds={stats.badges.get(s.workoutId) ?? []} />
            </div>
            <ol className="space-y-0.5 text-sm text-neutral-300">
              {s.sets.map((set, i) => (
                <li key={set.id} className={`tabular-nums ${isCountingSet(set) ? '' : 'text-neutral-500'}`}>
                  <span className="inline-block w-6 text-neutral-500">{i + 1}</span>
                  {formatSet(set, exercise.type, unit)}
                  {set.type === 'warmup' && <span className="ml-2 text-xs">Aufwärmen</span>}
                  {set.type === 'drop' && <span className="ml-2 text-xs text-neutral-500">Dropsatz</span>}
                  {set.type === 'failure' && <span className="ml-2 text-xs text-neutral-500">Versagen</span>}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  );
}

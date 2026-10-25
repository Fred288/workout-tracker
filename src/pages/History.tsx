import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import PageTitle from '../components/PageTitle';
import { db } from '../db/dexie';
import { displayName } from '../lib/exercises';
import { formatDuration, formatSet } from '../lib/format';
import { groupByMonth } from '../lib/history';
import { bestSet, workoutDurationMs, workoutVolume } from '../lib/stats';
import { workoutRecords } from '../lib/records';
import { formatNumber, kgToUnit, useWeightUnit } from '../lib/units';

export default function History() {
  const unit = useWeightUnit();
  const data = useLiveQuery(async () => {
    const workouts = (await db.workouts.toArray()).filter((w) => w.finishedAt);
    const ids = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
    const list = await db.exercises.bulkGet(ids);
    return { workouts, exercises: new Map(list.filter((e) => !!e).map((e) => [e!.id, e!])) };
  }, []);
  const groups = useMemo(() => groupByMonth(data?.workouts ?? []), [data]);
  // Exercises with a new record, per workout.
  const prs = useMemo(() => {
    if (!data) return new Map<string, Set<string>>();
    const types = new Map([...data.exercises.values()].map((e) => [e.id, e.type]));
    return new Map(
      data.workouts.map((w) => [w.id, new Set(workoutRecords(data.workouts, w.id, types).map((r) => r.exerciseId))]),
    );
  }, [data]);

  return (
    <>
      <PageTitle>Verlauf</PageTitle>
      {data === undefined ? null : groups.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">
          <p>Noch keine Workouts.</p>
          <Link to="/workout" className="mt-2 inline-flex min-h-11 items-center text-accent">
            Erstes Workout starten
          </Link>
        </div>
      ) : (
        <div className="space-y-6 pb-6">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-sm font-semibold text-neutral-400">{g.label}</h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {g.workouts.map((w) => (
                  <li key={w.id}>
                    <Link to={`/history/${w.id}`} className="block rounded-xl border border-border bg-surface p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold">{w.name}</span>
                        <span className="shrink-0 text-xs text-neutral-500">
                          {new Date(w.startedAt).toLocaleDateString('de-DE', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>
                      <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
                        <span>
                          {formatDuration(workoutDurationMs(w))} · {formatNumber(kgToUnit(workoutVolume(w), unit))} {unit}
                        </span>
                        {!!prs.get(w.id)?.size && (
                          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 font-medium text-amber-300">
                            🏆 {prs.get(w.id)!.size} Rekord{prs.get(w.id)!.size === 1 ? '' : 'e'}
                          </span>
                        )}
                      </div>
                      <ul className="space-y-0.5 text-sm text-neutral-300">
                        {w.exercises.slice(0, 5).map((e) => {
                          const ex = data.exercises.get(e.exerciseId);
                          const best = bestSet(e.sets);
                          return (
                            <li key={e.id} className="flex justify-between gap-3">
                              <span className="truncate">
                                {prs.get(w.id)?.has(e.exerciseId) && (
                                  <span className="mr-1" role="img" aria-label="Neuer Rekord">
                                    🏆
                                  </span>
                                )}
                                {e.sets.length} × {ex ? displayName(ex) : 'Unbekannte Übung'}
                              </span>
                              <span className="shrink-0 tabular-nums text-neutral-500">
                                {best ? formatSet(best, ex?.type ?? 'weight_reps', unit, ex?.sport) : ''}
                              </span>
                            </li>
                          );
                        })}
                        {w.exercises.length > 5 && (
                          <li className="text-xs text-neutral-500">+ {w.exercises.length - 5} weitere</li>
                        )}
                      </ul>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

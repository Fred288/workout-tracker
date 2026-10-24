import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { saveWorkoutAsTemplate } from '../db/templates';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { displayName } from '../lib/exercises';
import { formatDuration, formatSet } from '../lib/format';
import { workoutDurationMs, workoutVolume } from '../lib/stats';
import { workoutRecords } from '../lib/records';
import RecordBadges from '../components/RecordBadges';
import { formatNumber, kgToUnit, useWeightUnit } from '../lib/units';

export default function WorkoutSummary() {
  const { id = '' } = useParams();
  const unit = useWeightUnit();
  const [saved, setSaved] = useState(false);
  const data = useLiveQuery(async () => {
    const w = await db.workouts.get(id);
    if (!w) return null;
    const list = await db.exercises.bulkGet(w.exercises.map((e) => e.exerciseId));
    const exercises = new Map(list.filter((e) => !!e).map((e) => [e!.id, e!]));
    const earlier = await db.workouts.where('startedAt').below(w.startedAt).toArray();
    const records = workoutRecords([w, ...earlier], w.id, new Map([...exercises.values()].map((e) => [e.id, e.type])));
    return { w, exercises, records: new Map(records.map((r) => [r.exerciseId, r.kinds])) };
  }, [id]);

  if (data === undefined) return null;
  if (data === null) return <p className="py-8 text-center text-neutral-500">Workout nicht gefunden.</p>;
  const { w, exercises, records } = data;
  const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const stats = [
    { label: 'Dauer', value: formatDuration(workoutDurationMs(w)) },
    { label: 'Volumen', value: `${formatNumber(kgToUnit(workoutVolume(w), unit))} ${unit}` },
    { label: 'Sätze', value: String(sets) },
  ];

  return (
    <div className="pb-8">
      <h1 className="pt-6 text-2xl font-bold">Starkes Training!</h1>
      <p className="text-neutral-400">
        {w.name} · {new Date(w.startedAt).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      <div className="my-4 grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-surface p-3 text-center">
            <div className="text-lg font-semibold">{s.value}</div>
            <div className="text-xs text-neutral-500">{s.label}</div>
          </div>
        ))}
      </div>

      {records.size > 0 && (
        <p className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          🏆 {records.size === 1 ? 'Neuer Rekord' : `Neue Rekorde in ${records.size} Übungen`}!
        </p>
      )}

      <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
        {w.exercises.map((item) => {
          const ex = exercises.get(item.exerciseId);
          return (
            <li key={item.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-1 font-semibold">{ex ? displayName(ex) : 'Unbekannte Übung'}</div>
              <RecordBadges kinds={records.get(item.exerciseId) ?? []} />
              <ol className="space-y-0.5 text-sm text-neutral-300">
                {item.sets.map((s, i) => (
                  <li key={s.id} className="tabular-nums">
                    <span className="inline-block w-6 text-neutral-500">{i + 1}</span>
                    {formatSet(s, ex?.type ?? 'weight_reps', unit)}
                    {s.type !== 'normal' && (
                      <span className="ml-2 text-xs text-neutral-500">
                        {{ warmup: 'Aufwärmen', drop: 'Dropsatz', failure: 'Versagen' }[s.type]}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          to="/workout"
          replace
          className="flex min-h-12 flex-1 items-center justify-center rounded-lg bg-accent font-semibold text-white md:flex-none md:px-8"
        >
          Fertig
        </Link>
        <button
          className="min-h-12 rounded-lg border border-border bg-surface px-4 text-sm disabled:opacity-60"
          disabled={saved}
          onClick={async () => {
            const name = prompt('Name der Vorlage', w.name);
            if (name === null) return;
            await saveWorkoutAsTemplate(w, name);
            setSaved(true);
          }}
        >
          {saved ? 'Vorlage gespeichert ✓' : 'Als Vorlage speichern'}
        </button>
        <Link
          to={`/history/${w.id}`}
          replace
          className="flex min-h-12 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm"
        >
          Im Verlauf ansehen
        </Link>
      </div>
    </div>
  );
}

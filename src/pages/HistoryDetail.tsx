import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { startWorkout, useActiveWorkout } from '../db/activeWorkout';
import { saveWorkoutAsTemplate } from '../db/templates';
import type { Workout } from '../db/types';
import WorkoutExerciseCard from '../components/WorkoutExerciseCard';
import RecordBadges from '../components/RecordBadges';
import { workoutRecords } from '../lib/records';
import { displayName } from '../lib/exercises';
import { formatDuration, formatSet } from '../lib/format';
import { fromLocalInput, toLocalInput } from '../lib/history';
import { workoutDurationMs, workoutVolume } from '../lib/stats';
import { formatNumber, kgToUnit, useWeightUnit } from '../lib/units';
import { setDetail } from '../lib/pace';
import {
  addCompletedSet,
  moveExercise,
  previousSets,
  removeExercise,
  removeSet,
  updateExercise,
  updateSet,
  workoutFromPrevious,
} from '../lib/workout';

const SET_LABEL = { normal: '', warmup: 'Aufwärmen', drop: 'Dropsatz', failure: 'Versagen' } as const;

export default function HistoryDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const unit = useWeightUnit();
  const active = useActiveWorkout();
  const [editing, setEditing] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const workout = await db.workouts.get(id);
    if (!workout?.finishedAt) return null;
    const list = await db.exercises.bulkGet(workout.exercises.map((e) => e.exerciseId));
    const earlier = await db.workouts.where('startedAt').below(workout.startedAt).toArray();
    return { workout, earlier, exercises: new Map(list.filter((e) => !!e).map((e) => [e!.id, e!])) };
  }, [id]);

  if (data === undefined) return null;
  if (data === null) {
    return (
      <p className="py-8 text-center text-neutral-500">
        Workout nicht gefunden.{' '}
        <Link to="/history" className="text-accent">
          Zum Verlauf
        </Link>
      </p>
    );
  }
  const { workout: w, earlier, exercises } = data;
  const prs = new Map(
    workoutRecords([w, ...earlier], w.id, new Map([...exercises.values()].map((e) => [e.id, e.type]))).map((r) => [
      r.exerciseId,
      r.kinds,
    ]),
  );
  const save = (fn: (x: Workout) => Workout) => void db.workouts.put(fn(w));

  async function onRepeat() {
    if (active) {
      alert('Es läuft bereits ein Workout. Beende oder verwirf es zuerst.');
      return;
    }
    await startWorkout(workoutFromPrevious(w, Date.now()));
    navigate('/workout/active');
  }

  async function onSaveTemplate() {
    const name = prompt('Name der Vorlage', w.name);
    if (name === null) return;
    await saveWorkoutAsTemplate(w, name);
    setSavedMsg('Vorlage gespeichert. Du findest sie unter Workout.');
  }

  async function onDelete() {
    if (!confirm(`„${w.name}“ endgültig löschen?`)) return;
    await db.workouts.delete(w.id);
    navigate('/history', { replace: true });
  }

  const btn = 'min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-medium';

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <div className="flex items-center justify-between pt-3">
        <Link to="/history" className="flex min-h-11 items-center text-sm text-accent">
          ← Verlauf
        </Link>
        <button className="min-h-11 text-sm font-medium text-accent" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Fertig' : 'Bearbeiten'}
        </button>
      </div>

      {editing ? (
        <input
          aria-label="Name des Workouts"
          value={w.name}
          onChange={(e) => save((x) => ({ ...x, name: e.target.value }))}
          className="mb-1 w-full rounded-lg bg-surface px-3 py-2 text-2xl font-bold"
        />
      ) : (
        <h1 className="text-2xl font-bold">{w.name}</h1>
      )}

      {editing ? (
        <label className="mb-2 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
          Start
          <input
            type="datetime-local"
            value={toLocalInput(w.startedAt)}
            onChange={(e) => {
              const ms = fromLocalInput(e.target.value);
              if (ms === undefined) return;
              // Keep the duration, only move the workout in time.
              save((x) => ({ ...x, startedAt: ms, finishedAt: ms + workoutDurationMs(x) }));
            }}
            className="min-h-11 rounded-lg bg-surface px-3 text-base text-neutral-100"
          />
        </label>
      ) : (
        <p className="text-sm text-neutral-400">
          {new Date(w.startedAt).toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          , {new Date(w.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
        </p>
      )}

      <div className="my-4 grid grid-cols-3 gap-2">
        {[
          { label: 'Dauer', value: formatDuration(workoutDurationMs(w)) },
          { label: 'Volumen', value: `${formatNumber(kgToUnit(workoutVolume(w), unit))} ${unit}` },
          { label: 'Sätze', value: String(w.exercises.reduce((n, e) => n + e.sets.length, 0)) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-surface p-3 text-center">
            <div className="text-lg font-semibold">{s.value}</div>
            <div className="text-xs text-neutral-500">{s.label}</div>
          </div>
        ))}
      </div>

      {editing ? (
        <div className="space-y-4">
          {w.exercises.map((item, idx) => (
            <WorkoutExerciseCard
              key={item.id}
              hideCheck
              item={item}
              exercise={exercises.get(item.exerciseId)}
              previous={previousSets(earlier, item.exerciseId, w.id)}
              unit={unit}
              isFirst={idx === 0}
              isLast={idx === w.exercises.length - 1}
              onSetChange={(setId, patch) => save((x) => updateSet(x, item.id, setId, patch))}
              onSetType={(setId, type) => save((x) => updateSet(x, item.id, setId, { type }))}
              onRemoveSet={(setId) => save((x) => removeSet(x, item.id, setId))}
              onAddSet={() => save((x) => addCompletedSet(x, item.id))}
              onUpdate={(patch) => save((x) => updateExercise(x, item.id, patch))}
              onMove={(dir) => save((x) => moveExercise(x, item.id, dir))}
              onRemove={() => save((x) => removeExercise(x, item.id))}
              onToggleSet={() => {}}
            />
          ))}
          <textarea
            aria-label="Notiz zum Workout"
            placeholder="Notiz zum Workout"
            rows={2}
            defaultValue={w.note}
            onChange={(e) => save((x) => ({ ...x, note: e.target.value || undefined }))}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
          />
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            {w.exercises.map((item) => {
              const ex = exercises.get(item.exerciseId);
              return (
                <li key={item.id} className="rounded-xl border border-border bg-surface p-3">
                  <Link
                    to={ex ? `/exercises/${encodeURIComponent(ex.id)}` : '#'}
                    className="mb-1 block font-semibold text-accent"
                  >
                    {ex ? displayName(ex) : 'Unbekannte Übung'}
                  </Link>
                  <RecordBadges kinds={prs.get(item.exerciseId) ?? []} />
                  <ol className="space-y-0.5 text-sm text-neutral-300">
                    {item.sets.map((s, i) => (
                      <li key={s.id} className="tabular-nums">
                        <span className="inline-block w-6 text-neutral-500">{i + 1}</span>
                        {formatSet(s, ex?.type ?? 'weight_reps', unit)}
                        {setDetail(ex?.sport, s) && <span className="ml-2 text-xs text-neutral-400">{setDetail(ex?.sport, s)}</span>}
                        {s.type !== 'normal' && <span className="ml-2 text-xs text-neutral-500">{SET_LABEL[s.type]}</span>}
                      </li>
                    ))}
                  </ol>
                  {item.note && <p className="mt-2 text-sm italic text-neutral-400">{item.note}</p>}
                </li>
              );
            })}
          </ul>
          {w.note && <p className="mt-4 rounded-xl bg-surface p-3 text-sm text-neutral-300">{w.note}</p>}
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button className={`${btn} bg-accent text-white`} onClick={() => void onRepeat()}>
          Workout wiederholen
        </button>
        <button className={btn} onClick={() => void onSaveTemplate()}>
          Als Vorlage speichern
        </button>
        <button className={`${btn} text-red-400`} onClick={() => void onDelete()}>
          Löschen
        </button>
      </div>
      {savedMsg && <p className="mt-2 text-sm text-accent">{savedMsg}</p>}
      {active && <p className="mt-2 text-xs text-neutral-500">Zum Wiederholen zuerst das laufende Workout beenden.</p>}
    </div>
  );
}

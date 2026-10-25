import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { discardActive, finishActive, mutateActive, useActiveWorkout } from '../db/activeWorkout';
import type { Workout } from '../db/types';
import ExercisePicker from '../components/ExercisePicker';
import RunPanel from '../components/RunPanel';
import SortableList from '../components/SortableList';
import WorkoutExerciseCard from '../components/WorkoutExerciseCard';
import { formatClock } from '../lib/format';
import { useNow, useWakeLock } from '../lib/hooks';
import { completeStep, currentStep } from '../lib/runClock';
import { useWeightUnit } from '../lib/units';
import {
  addExercises,
  addSet,
  countCompletedSets,
  countIncompleteSets,
  moveExercise,
  reorderExercise,
  previousSets,
  removeExercise,
  removeSet,
  toggleSet,
  updateExercise,
  updateSet,
} from '../lib/workout';

export default function ActiveWorkout() {
  const workout = useActiveWorkout();
  const navigate = useNavigate();
  const unit = useWeightUnit();
  const [picking, setPicking] = useState(false);
  const now = useNow(1000, !!workout);
  useWakeLock(!!workout);

  const exerciseIds = workout?.exercises.map((e) => e.exerciseId).join('|') ?? '';
  const exercises = useLiveQuery(
    async () => {
      const ids = exerciseIds ? exerciseIds.split('|') : [];
      const list = await db.exercises.bulkGet(ids);
      return new Map(list.filter((e) => !!e).map((e) => [e!.id, e!]));
    },
    [exerciseIds],
  );
  // Earlier workouts for the "Vorher" column.
  const history = useLiveQuery(
    () => (workout ? db.workouts.where('startedAt').below(workout.startedAt).toArray() : []),
    [workout?.startedAt],
  );
  const previousByExercise = useMemo(() => {
    const map = new Map<string, ReturnType<typeof previousSets>>();
    for (const id of exerciseIds ? exerciseIds.split('|') : []) map.set(id, previousSets(history ?? [], id));
    return map;
  }, [history, exerciseIds]);

  if (workout === undefined) return null;
  if (workout === null) return <Navigate to="/workout" replace />;

  const mutate = (fn: (w: Workout) => Workout) => void mutateActive(fn);

  const endurance = !!workout.sport && workout.sport !== 'strength';

  async function onFinish(distanceM?: number) {
    let w = workout!;
    // The last (or only) step is finished with the time it really took; a free run is one step.
    const step = currentStep(w);
    if (endurance && step && step.number === step.total) {
      await mutateActive((x) => completeStep(x, Date.now(), distanceM));
      w = completeStep(w, Date.now(), distanceM);
    }
    const completed = countCompletedSets(w);
    if (completed === 0) {
      if (confirm('Noch kein Satz abgehakt. Workout verwerfen?')) await onDiscard(true);
      return;
    }
    const open = countIncompleteSets(w);
    const msg = open
      ? `${open} nicht abgehakte${open === 1 ? 'r Satz wird' : ' Sätze werden'} verworfen. Workout beenden?`
      : 'Workout beenden?';
    if (!confirm(msg)) return;
    const done = await finishActive();
    if (done) navigate(`/workout/summary/${done.id}`, { replace: true });
  }

  async function onDiscard(confirmed = false) {
    if (!confirmed && !confirm('Workout verwerfen? Alle Eingaben gehen verloren.')) return;
    await discardActive();
    navigate('/workout', { replace: true });
  }

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-border bg-bg px-4 py-2 md:-mx-8 md:px-8">
        <div className="min-w-0 flex-1">
          <input
            aria-label="Name des Workouts"
            defaultValue={workout.name}
            onChange={(e) => {
              const name = e.target.value;
              mutate((w) => ({ ...w, name: name.trim() ? name : w.name }));
            }}
            className="w-full truncate bg-transparent text-lg font-bold"
          />
          <div className="text-sm tabular-nums text-neutral-400">{formatClock((now - workout.startedAt) / 1000)}</div>
        </div>
        <button className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-white" onClick={() => void onFinish()}>
          Beenden
        </button>
      </div>

      {endurance && (
        <div className="mt-4">
          <RunPanel
            workout={workout}
            now={now}
            onMutate={mutate}
            onNext={(d) => mutate((w) => completeStep(w, Date.now(), d))}
            onFinish={(d) => void onFinish(d)}
          />
          <h2 className="mb-1 mt-6 text-sm font-semibold text-neutral-400">Schritte und Sätze</h2>
        </div>
      )}

      <div className="mt-4 space-y-4">
        <SortableList
          ids={workout.exercises.map((e) => e.id)}
          onReorder={(from, to) => mutate((w) => reorderExercise(w, from, to))}
          render={(_, idx, handle) => {
            const item = workout.exercises[idx];
            return (
          <WorkoutExerciseCard
            dragHandle={handle}
            item={item}
            exercise={exercises?.get(item.exerciseId)}
            previous={previousByExercise.get(item.exerciseId) ?? []}
            unit={unit}
            isFirst={idx === 0}
            isLast={idx === workout.exercises.length - 1}
            onSetChange={(setId, patch) => mutate((w) => updateSet(w, item.id, setId, patch))}
            onSetType={(setId, type) => mutate((w) => updateSet(w, item.id, setId, { type }))}
            onRemoveSet={(setId) => mutate((w) => removeSet(w, item.id, setId))}
            onAddSet={() => mutate((w) => addSet(w, item.id))}
            onUpdate={(patch) => mutate((w) => updateExercise(w, item.id, patch))}
            onMove={(dir) => mutate((w) => moveExercise(w, item.id, dir))}
            onRemove={() => mutate((w) => removeExercise(w, item.id))}
            onToggleSet={(set, prev) => mutate((w) => toggleSet(w, item.id, set.id, prev))}
          />
            );
          }}
        />
      </div>

      {workout.exercises.length === 0 && (
        <p className="py-8 text-center text-neutral-500">Füge deine erste Übung hinzu.</p>
      )}

      <button
        className="mt-4 min-h-12 w-full rounded-lg bg-accent/20 font-semibold text-accent"
        onClick={() => setPicking(true)}
      >
        + Übungen hinzufügen
      </button>

      <textarea
        aria-label="Notiz zum Workout"
        placeholder="Notiz zum Workout"
        rows={2}
        defaultValue={workout.note}
        onChange={(e) => {
          const note = e.target.value;
          mutate((w) => ({ ...w, note: note || undefined }));
        }}
        className="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
      />

      <button className="mt-4 min-h-11 w-full text-sm text-red-400" onClick={() => void onDiscard()}>
        Workout verwerfen
      </button>

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onAdd={(ids) => {
            mutate((w) => addExercises(w, ids));
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

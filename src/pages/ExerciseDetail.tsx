import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import ExerciseAnimation from '../components/ExerciseAnimation';
import MuscleBody from '../components/MuscleBody';
import { displayInstructions, displayName } from '../lib/exercises';
import { EQUIPMENT_LABELS, LEVEL_LABELS, TYPE_LABELS, categoryLabel } from '../lib/labels';
import { muscleLabel } from '../lib/muscleMap';

const TABS = ['Info', 'Verlauf', 'Diagramme', 'Rekorde'] as const;
type Tab = (typeof TABS)[number];

export default function ExerciseDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('Info');
  const exercise = useLiveQuery(() => db.exercises.get(id).then((e) => e ?? null), [id]);

  if (exercise === undefined) return null;
  if (exercise === null) {
    return (
      <div className="py-8 text-center text-neutral-500">
        Übung nicht gefunden.{' '}
        <Link to="/exercises" className="text-accent">
          Zur Liste
        </Link>
      </div>
    );
  }

  const name = displayName(exercise);
  const instructions = displayInstructions(exercise);
  const chips = [
    EQUIPMENT_LABELS[exercise.equipment],
    exercise.level && LEVEL_LABELS[exercise.level],
    exercise.category && categoryLabel(exercise.category),
    TYPE_LABELS[exercise.type],
    exercise.isCustom && 'Eigene Übung',
  ].filter((c): c is string => !!c);

  async function onDelete() {
    if (!confirm(`„${name}“ löschen?`)) return;
    await db.exercises.delete(id);
    navigate('/exercises', { replace: true });
  }

  return (
    <>
      <div className="flex items-center justify-between pt-3">
        <button onClick={() => navigate(-1)} className="min-h-11 text-sm text-accent">
          ← Zurück
        </button>
        {exercise.isCustom && (
          <Link
            to={`/exercises/${encodeURIComponent(id)}/edit`}
            className="flex min-h-11 items-center text-sm text-accent"
          >
            Bearbeiten
          </Link>
        )}
      </div>
      <h1 className="pb-1 text-2xl font-bold">{name}</h1>
      {exercise.nameDe && exercise.nameDe !== exercise.name && (
        <p className="text-sm text-neutral-500">{exercise.name}</p>
      )}

      <div role="tablist" className="my-3 grid grid-cols-4 rounded-lg bg-surface p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-10 rounded-md ${tab === t ? 'bg-border font-semibold' : 'text-neutral-400'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Info' ? (
        <div className="space-y-5 pb-6">
          <ExerciseAnimation exercise={exercise} alt={name} />

          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-surface px-3 py-1 text-xs text-neutral-300">
                {c}
              </span>
            ))}
          </div>

          <section>
            <MuscleBody primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} />
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="flex items-center gap-1.5 text-neutral-400">
                  <span className="size-2.5 rounded-full bg-accent" /> Primär:
                </dt>
                <dd>{exercise.primaryMuscles.map(muscleLabel).join(', ') || '–'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="flex items-center gap-1.5 text-neutral-400">
                  <span className="size-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_50%,#6b7280)]" /> Sekundär:
                </dt>
                <dd>{exercise.secondaryMuscles.map(muscleLabel).join(', ') || '–'}</dd>
              </div>
            </dl>
          </section>

          {instructions.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">Anleitung</h2>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-300">
                {instructions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          )}

          {exercise.isCustom && (
            <button onClick={() => void onDelete()} className="min-h-11 text-sm text-red-400">
              Übung löschen
            </button>
          )}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-neutral-500">
          Noch keine Daten. Absolviere ein Workout mit dieser Übung.
        </p>
      )}
    </>
  );
}

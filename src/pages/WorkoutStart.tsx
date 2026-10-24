import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import PageTitle from '../components/PageTitle';
import Reminders from '../components/Reminders';
import { startWorkout, useActiveWorkout } from '../db/activeWorkout';
import { db } from '../db/dexie';
import { deleteTemplate, renameTemplate } from '../db/templates';
import type { Template, Workout } from '../db/types';
import { displayName } from '../lib/exercises';
import { formatClock } from '../lib/format';
import { useNow } from '../lib/hooks';
import { createWorkout, workoutFromPrevious, workoutFromTemplate } from '../lib/workout';

const RECENT_COUNT = 3;

export default function WorkoutStart() {
  const active = useActiveWorkout();
  const navigate = useNavigate();
  const now = useNow(1000, !!active);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const templates = (await db.templates.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const recent = (await db.workouts.orderBy('startedAt').reverse().filter((w) => !!w.finishedAt).limit(RECENT_COUNT).toArray());
    const ids = new Set([...templates, ...recent].flatMap((x) => x.exercises.map((e) => e.exerciseId)));
    const list = await db.exercises.bulkGet([...ids]);
    return { templates, recent, names: new Map(list.filter((e) => !!e).map((e) => [e!.id, displayName(e!)])) };
  }, []);

  async function begin(w: Workout) {
    await startWorkout(w);
    navigate('/workout/active');
  }

  const summary = (items: { exerciseId: string }[]) => {
    const names = items.map((e) => data?.names.get(e.exerciseId) ?? 'Unbekannte Übung');
    return names.slice(0, 3).join(', ') + (names.length > 3 ? ` + ${names.length - 3} weitere` : '');
  };

  const startBtn =
    'min-h-12 w-full rounded-lg bg-accent font-semibold text-white md:w-auto md:px-8 disabled:opacity-50';

  return (
    <div className="pb-6">
      <PageTitle>Workout</PageTitle>
      <Reminders />
      {active === undefined ? null : active ? (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
          <div className="text-sm text-neutral-400">Läuft seit {formatClock((now - active.startedAt) / 1000)}</div>
          <div className="mb-3 text-lg font-semibold">{active.name}</div>
          <button className={startBtn} onClick={() => navigate('/workout/active')}>
            Workout fortsetzen
          </button>
        </div>
      ) : (
        <button className={startBtn} onClick={() => void begin(createWorkout(Date.now()))}>
          Leeres Workout starten
        </button>
      )}

      {data && (
        <>
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-neutral-400">Vorlagen</h2>
            {data.templates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-neutral-500">
                Noch keine Vorlagen. Speichere ein beendetes Workout im Verlauf oder in der Zusammenfassung als Vorlage.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.templates.map((t: Template) => (
                  <li key={t.id} className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{t.name}</div>
                        <div className="line-clamp-2 text-sm text-neutral-500">{summary(t.exercises)}</div>
                      </div>
                      <button
                        aria-label={`Optionen für ${t.name}`}
                        aria-expanded={menuFor === t.id}
                        className="min-h-11 min-w-11 rounded-lg text-xl text-neutral-400"
                        onClick={() => setMenuFor((m) => (m === t.id ? null : t.id))}
                      >
                        ⋯
                      </button>
                    </div>
                    {menuFor === t.id && (
                      <div className="mt-2 flex gap-2 text-sm">
                        <button
                          className="min-h-10 rounded-md bg-border px-3"
                          onClick={async () => {
                            const name = prompt('Neuer Name', t.name);
                            if (name !== null) await renameTemplate(t.id, name);
                            setMenuFor(null);
                          }}
                        >
                          Umbenennen
                        </button>
                        <button
                          className="min-h-10 rounded-md bg-border px-3 text-red-400"
                          onClick={async () => {
                            if (confirm(`Vorlage „${t.name}“ löschen?`)) await deleteTemplate(t.id);
                            setMenuFor(null);
                          }}
                        >
                          Löschen
                        </button>
                      </div>
                    )}
                    <button
                      className="mt-2 min-h-11 w-full rounded-lg bg-border text-sm font-medium disabled:opacity-40"
                      disabled={!!active}
                      onClick={() => void begin(workoutFromTemplate(t, Date.now()))}
                    >
                      Starten
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.recent.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-neutral-400">Zuletzt durchgeführt</h2>
              <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.recent.map((w) => (
                  <li key={w.id} className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{w.name}</span>
                      <span className="shrink-0 text-xs text-neutral-500">
                        {new Date(w.startedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="line-clamp-2 text-sm text-neutral-500">{summary(w.exercises)}</div>
                    <button
                      className="mt-2 min-h-11 w-full rounded-lg bg-border text-sm font-medium disabled:opacity-40"
                      disabled={!!active}
                      onClick={() => void begin(workoutFromPrevious(w, Date.now()))}
                    >
                      Wiederholen
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {active && (
        <p className="mt-4 text-xs text-neutral-500">Beende oder verwirf das laufende Workout, um ein neues zu starten.</p>
      )}
    </div>
  );
}

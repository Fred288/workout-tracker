import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { deleteMeasurement, saveMeasurement, saveProfile, useMeasurements, useProfile } from '../db/profile';
import type { BodyMeasurement, Profile as ProfileData } from '../db/types';
import { dateKeyToMs, goalStreak, sortedMeasurements, toDateKey, weeklyWorkoutCounts, weightSummary } from '../lib/profile';
import { formatNumber, kgToUnit, parseNumber, unitToKg } from '../lib/units';

// Recharts is large, so the charts load after the page itself.
const WeightChart = lazy(() => import('../components/ProfileCharts').then((m) => ({ default: m.WeightChart })));
const WeeklyChart = lazy(() => import('../components/ProfileCharts').then((m) => ({ default: m.WeeklyChart })));

const card = 'rounded-xl border border-border bg-surface p-4';
const input = 'min-h-11 w-full rounded-lg border border-border bg-bg px-3 text-base';
const label = 'mb-1 block text-sm text-neutral-400';
const chartFallback = <p className="py-10 text-center text-sm text-neutral-500">Lade Diagramm …</p>;

/** Text input that saves when it loses focus; empty or invalid input clears the value. */
function Field({
  id,
  text,
  inputMode,
  placeholder,
  onCommit,
}: {
  id: string;
  text: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(text);
  useEffect(() => setValue(text), [text]);
  return (
    <input
      id={id}
      className={input}
      value={value}
      inputMode={inputMode}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        onCommit(value);
        // Show the stored value again; if the input was invalid nothing changed and this drops it.
        setValue(text);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function WeightEntryForm({
  unit,
  editing,
  onDone,
}: {
  unit: 'kg' | 'lb';
  editing?: BodyMeasurement;
  onDone: () => void;
}) {
  const [date, setDate] = useState(editing?.date ?? toDateKey(new Date()));
  const [value, setValue] = useState(editing ? formatNumber(kgToUnit(editing.weightKg, unit)) : '');
  const parsed = parseNumber(value);
  const valid = parsed !== undefined && parsed >= 20 && parsed <= 700 && date <= toDateKey(new Date());

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        await saveMeasurement(date, unitToKg(parsed, unit), editing?.id);
        onDone();
      }}
    >
      <div className="min-w-36 flex-1">
        <label className={label} htmlFor="w-date">
          Datum
        </label>
        <input
          id="w-date"
          type="date"
          className={input}
          value={date}
          max={toDateKey(new Date())}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </div>
      <div className="min-w-28 flex-1">
        <label className={label} htmlFor="w-value">
          Gewicht ({unit})
        </label>
        <input
          id="w-value"
          className={input}
          inputMode="decimal"
          placeholder="z. B. 80,5"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <button type="submit" disabled={!valid} className="min-h-11 rounded-lg bg-accent px-5 font-semibold text-white disabled:opacity-40">
        Speichern
      </button>
      <button type="button" className="min-h-11 px-3 text-neutral-400" onClick={onDone}>
        Abbrechen
      </button>
    </form>
  );
}

export default function Profile() {
  const profile = useProfile();
  const measurements = useMeasurements();
  const workouts = useLiveQuery(() => db.workouts.filter((w) => !!w.finishedAt).toArray(), []);
  const [entering, setEntering] = useState<'new' | BodyMeasurement | null>(null);
  const [showAll, setShowAll] = useState(false);

  const unit = profile?.unit ?? 'kg';
  const sorted = useMemo(() => sortedMeasurements(measurements ?? []), [measurements]);
  const summary = weightSummary(sorted, profile?.targetWeightKg);
  const weeks = useMemo(() => weeklyWorkoutCounts(workouts ?? [], Date.now()), [workouts]);

  if (!profile) return null;
  const goal = profile.workoutsPerWeekGoal;
  const thisWeek = weeks.at(-1)?.count ?? 0;
  const streak = goalStreak(weeks, goal);
  const save = (patch: Partial<Omit<ProfileData, 'id'>>) => void saveProfile(patch);
  const num = (text: string, min: number, max: number) => {
    const n = parseNumber(text);
    return n !== undefined && n >= min && n <= max ? n : undefined;
  };
  const w = (kg: number) => `${formatNumber(kgToUnit(kg, unit))} ${unit}`;
  const signed = (kg: number) => `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${formatNumber(Math.abs(kgToUnit(kg, unit)))} ${unit}`;

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between pt-3">
        <h1 className="py-1 text-2xl font-bold">{profile.name ? `Hallo, ${profile.name}` : 'Profil'}</h1>
        <Link to="/settings" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-accent">
          Einstellungen
        </Link>
      </div>

      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <section className={`${card} md:col-span-2`} aria-labelledby="weight-h">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="weight-h" className="text-sm text-neutral-400">
                Aktuelles Gewicht
              </h2>
              {summary ? (
                <>
                  <div className="text-3xl font-semibold tabular-nums">{w(summary.latest.weightKg)}</div>
                  <div className="text-xs text-neutral-500">
                    {new Date(dateKeyToMs(summary.latest.date)).toLocaleDateString('de-DE', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    {summary.changeKg !== undefined && ` · ${signed(summary.changeKg)} seit dem Eintrag davor`}
                  </div>
                  {summary.toTargetKg !== undefined && (
                    <div className="mt-1 text-sm text-neutral-300">
                      {Math.abs(summary.toTargetKg) < 0.05
                        ? 'Zielgewicht erreicht 🎯'
                        : `Noch ${w(Math.abs(summary.toTargetKg))} ${summary.toTargetKg < 0 ? 'abnehmen' : 'zunehmen'} bis zum Ziel`}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-neutral-500">Noch kein Gewicht eingetragen.</p>
              )}
            </div>
            {!entering && (
              <button className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-white" onClick={() => setEntering('new')}>
                Gewicht eintragen
              </button>
            )}
          </div>
          {entering && (
            <WeightEntryForm
              key={entering === 'new' ? 'new' : entering.id}
              unit={unit}
              editing={entering === 'new' ? undefined : entering}
              onDone={() => setEntering(null)}
            />
          )}
          {sorted.length > 0 && (
            <div className="mt-4">
              <Suspense fallback={chartFallback}>
                <WeightChart measurements={sorted} targetKg={profile.targetWeightKg} unit={unit} />
              </Suspense>
              <button className="mt-2 min-h-11 text-sm text-accent" aria-expanded={showAll} onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Einträge ausblenden' : `Alle Einträge (${sorted.length})`}
              </button>
              {showAll && (
                <ul className="divide-y divide-border text-sm">
                  {[...sorted].reverse().map((m) => (
                    <li key={m.id} className="flex items-center gap-2 py-1">
                      <span className="flex-1 text-neutral-400">
                        {new Date(dateKeyToMs(m.date)).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="tabular-nums">{w(m.weightKg)}</span>
                      <button className="min-h-11 px-2 text-accent" onClick={() => setEntering(m)}>
                        Bearbeiten
                      </button>
                      <button
                        className="min-h-11 px-2 text-red-400"
                        aria-label={`Eintrag vom ${m.date} löschen`}
                        onClick={() => confirm('Eintrag löschen?') && void deleteMeasurement(m.id)}
                      >
                        Löschen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className={card} aria-labelledby="goals-h">
          <h2 id="goals-h" className="mb-3 font-semibold">
            Ziele
          </h2>
          <div className="space-y-3">
            <div>
              <label className={label} htmlFor="target">
                Zielgewicht ({unit})
              </label>
              <Field
                id="target"
                inputMode="decimal"
                placeholder="optional"
                text={profile.targetWeightKg !== undefined ? formatNumber(kgToUnit(profile.targetWeightKg, unit)) : ''}
                onCommit={(t) => {
                  const n = num(t, 20, 700);
                  save({ targetWeightKg: n !== undefined ? unitToKg(n, unit) : undefined });
                }}
              />
            </div>
            <div>
              <span className={label} id="goal-l">
                Workouts pro Woche
              </span>
              <div className="flex items-center gap-3" role="group" aria-labelledby="goal-l">
                <button
                  className="min-h-11 min-w-11 rounded-lg bg-border text-xl disabled:opacity-40"
                  aria-label="Ziel verringern"
                  disabled={goal <= 1}
                  onClick={() => save({ workoutsPerWeekGoal: goal - 1 })}
                >
                  −
                </button>
                <span className="w-8 text-center text-xl font-semibold tabular-nums" aria-live="polite">
                  {goal}
                </span>
                <button
                  className="min-h-11 min-w-11 rounded-lg bg-border text-xl disabled:opacity-40"
                  aria-label="Ziel erhöhen"
                  disabled={goal >= 7}
                  onClick={() => save({ workoutsPerWeekGoal: goal + 1 })}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={card} aria-labelledby="personal-h">
          <h2 id="personal-h" className="mb-3 font-semibold">
            Persönliche Daten
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={label} htmlFor="name">
                Name
              </label>
              <Field id="name" text={profile.name} onCommit={(t) => save({ name: t.trim() })} />
            </div>
            <div>
              <label className={label} htmlFor="year">
                Geburtsjahr
              </label>
              <Field
                id="year"
                inputMode="numeric"
                placeholder="z. B. 1990"
                text={profile.birthYear?.toString() ?? ''}
                onCommit={(t) => {
                  const n = num(t, 1900, new Date().getFullYear());
                  save({ birthYear: n !== undefined ? Math.round(n) : undefined });
                }}
              />
            </div>
            <div>
              <label className={label} htmlFor="height">
                Größe (cm)
              </label>
              <Field
                id="height"
                inputMode="numeric"
                placeholder="z. B. 180"
                text={profile.heightCm?.toString() ?? ''}
                onCommit={(t) => {
                  const n = num(t, 80, 250);
                  save({ heightCm: n !== undefined ? Math.round(n) : undefined });
                }}
              />
            </div>
            <div>
              <label className={label} htmlFor="gender">
                Geschlecht (optional)
              </label>
              <select
                id="gender"
                className={input}
                value={profile.gender ?? ''}
                onChange={(e) => save({ gender: (e.target.value || undefined) as ProfileData['gender'] })}
              >
                <option value="">Keine Angabe</option>
                <option value="female">Weiblich</option>
                <option value="male">Männlich</option>
                <option value="diverse">Divers</option>
              </select>
            </div>
            <div>
              <span className={label} id="unit-l">
                Einheit
              </span>
              <div role="radiogroup" aria-labelledby="unit-l" className="flex gap-1 rounded-lg bg-bg p-1">
                {(['kg', 'lb'] as const).map((u) => (
                  <button
                    key={u}
                    role="radio"
                    aria-checked={unit === u}
                    className={`min-h-10 flex-1 rounded-md text-sm ${unit === u ? 'bg-border font-semibold' : 'text-neutral-400'}`}
                    onClick={() => save({ unit: u })}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={`${card} md:col-span-2`} aria-labelledby="weeks-h">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="weeks-h" className="font-semibold">
              Workouts pro Woche
            </h2>
            <span className="text-sm text-neutral-400">
              Diese Woche: {thisWeek} von {goal}
              {streak > 0 && ` · ${streak} ${streak === 1 ? 'Woche' : 'Wochen'} in Folge geschafft 🔥`}
            </span>
          </div>
          <Suspense fallback={chartFallback}>
            <WeeklyChart weeks={weeks} goal={goal} />
          </Suspense>
        </section>
      </div>

      <p className="mt-6 text-sm text-neutral-500">
        Version {__APP_VERSION__} ({__APP_BUILD__})
      </p>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { createGoalWithPlan, generatePlanSessions } from '../db/plans';
import type { GoalType, Level, Weekday } from '../db/types';
import { WEEKDAYS_SHORT, addDays, formatDay, isIsoDate } from '../lib/dates';
import { formatClock, parseClock } from '../lib/format';
import { GOAL_LABEL, RUN_GOALS } from '../lib/plan';
import { formatMinutes } from '../lib/planGenerator';
import { TRI_GOALS, isTriGoal } from '../lib/planGeneratorTri';
import { previewPlan, wizardDefaults } from '../lib/planPreview';
import { SPORT_LABEL } from '../lib/sports';
import { parseNumber } from '../lib/units';

const btn = 'min-h-11 rounded-lg bg-border px-3 text-sm font-medium disabled:opacity-40';
const input = 'min-h-11 rounded-lg bg-border px-3 text-base';
const STEPS = ['Ziel', 'Du', 'Tage', 'Vorschau'] as const;
const PHASE_LABEL = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Tapering', race: 'Wettkampf' } as const;
const LEVELS: { value: Level; label: string }[] = [
  { value: 'beginner', label: 'Einsteiger' },
  { value: 'intermediate', label: 'Fortgeschritten' },
];

/**
 * Guided plan creation: goal, experience and volume, training days, then a preview of the plan
 * (phases, volume, an example week, warnings). Only the last step stores a goal and its plan.
 */
export default function PlanWizard({ today }: { today: string }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<GoalType>('marathon');
  const [date, setDate] = useState(addDays(today, 16 * 7));
  const [time, setTime] = useState('');
  const [level, setLevel] = useState<Level>('beginner');
  const defaults = wizardDefaults(type, level);
  // Days, long day and volume follow goal and level until the user changes them.
  const [custom, setCustom] = useState<{ days?: Weekday[]; longDay?: Weekday; baseline?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const tri = isTriGoal(type);
  const days = custom.days ?? defaults.days;
  const longDay = custom.longDay !== undefined && days.includes(custom.longDay) ? custom.longDay : days.includes(defaults.longDay) ? defaults.longDay : days.at(-1)!;
  const baselineText = custom.baseline ?? String(defaults.baseline).replace('.', ',');
  const baseline = parseNumber(baselineText) ?? NaN;
  const timeSec = parseClock(time);

  const goalValid = isIsoDate(date) && date > today && (!time.trim() || timeSec !== undefined);
  const baselineValid = tri ? baseline >= 0.5 && baseline <= 30 : baseline >= 10 && baseline <= 300;
  const daysValid = days.length >= (tri ? 3 : 2) && days.includes(longDay);
  const valid = [goalValid, goalValid && baselineValid, goalValid && baselineValid && daysValid, true][step];

  const preview = useMemo(() => {
    if (step < 3 || !goalValid || !baselineValid || !daysValid) return undefined;
    try {
      return { ok: previewPlan({ goalType: type, targetDate: date, today, days, longDay, level, baseline }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, type, date, today, days.join(), longDay, level, baseline, goalValid, baselineValid, daysValid]);

  const toggle = (d: Weekday) => setCustom((c) => ({ ...c, days: (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]).sort((a, b) => a - b) as Weekday[] }));

  async function create() {
    setBusy(true);
    setError('');
    try {
      const { planId } = await createGoalWithPlan({ type, targetDate: date, ...(timeSec ? { targetTimeSec: timeSec } : {}) }, today);
      await generatePlanSessions(
        planId,
        tri
          ? { runDays: days, longRunDay: longDay, level, baselineLongRunMin: 60, hoursPerWeek: baseline }
          : { runDays: days, longRunDay: longDay, level, baselineLongRunMin: Math.round(baseline) },
        today,
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="max-w-lg space-y-4 rounded-xl border border-border bg-surface p-4" data-tour="plan-wizard">
      <div>
        <h2 className="text-lg font-semibold">Plan erstellen</h2>
        <ol className="mt-2 flex gap-1" aria-label="Schritte">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined} className={`flex-1 rounded-md py-1 text-center text-xs ${i === step ? 'bg-accent font-semibold text-white' : i < step ? 'bg-border text-neutral-200' : 'bg-bg text-neutral-500'}`}>
              {i + 1} · {s}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-400">Worauf trainierst du hin? Aus Ziel und Datum entstehen Phasen und Wochen.</p>
          <label className="block text-sm text-neutral-400">
            Wettkampf
            <select className={`${input} mt-1 block w-full text-neutral-100`} value={type} onChange={(e) => { setType(e.target.value as GoalType); setCustom({}); }}>
              <optgroup label="Laufen">
                {RUN_GOALS.map((g) => (
                  <option key={g} value={g}>
                    {GOAL_LABEL[g]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Triathlon">
                {TRI_GOALS.map((g) => (
                  <option key={g} value={g}>
                    {GOAL_LABEL[g]}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="block text-sm text-neutral-400">
            Zieldatum
            <input type="date" className={`${input} mt-1 block w-full text-neutral-100`} value={date} min={addDays(today, 1)} onChange={(e) => setDate(e.target.value)} />
          </label>
          {!tri && (
            <label className="block text-sm text-neutral-400">
              Zielzeit (optional, h:mm:ss)
              <input inputMode="text" placeholder="z. B. 4:15:00" className={`${input} mt-1 block w-full text-neutral-100`} value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-400">Damit der Plan nicht zu leicht oder zu hart startet.</p>
          <div role="radiogroup" aria-label="Erfahrung" className="flex gap-1 rounded-lg bg-bg p-1 text-sm">
            {LEVELS.map((l) => (
              <button key={l.value} role="radio" aria-checked={level === l.value} onClick={() => setLevel(l.value)} className={`min-h-11 flex-1 rounded-md ${level === l.value ? 'bg-border font-semibold' : 'text-neutral-400'}`}>
                {l.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-500">Einsteiger: bisher selten oder erst seit kurzem regelmäßig trainiert. Fortgeschritten: seit Monaten regelmäßig dabei.</p>
          <label className="block text-sm text-neutral-400">
            {tri ? 'Training zuletzt (Stunden pro Woche)' : 'Längster Lauf zuletzt (Minuten)'}
            <input inputMode={tri ? 'decimal' : 'numeric'} className={`${input} mt-1 block w-full text-neutral-100`} value={baselineText} onChange={(e) => setCustom((c) => ({ ...c, baseline: e.target.value }))} />
          </label>
          <p className="text-xs text-neutral-500">
            {tri ? 'Ehrlich schätzen: Schwimmen, Rad und Laufen zusammen. Der Plan beginnt etwa dort und steigert höchstens 10 % pro Woche.' : 'Von diesem Wert aus wächst der lange Lauf Woche für Woche.'}
          </p>
          {!baselineValid && <p className="text-sm text-amber-300">{tri ? 'Gib Stunden zwischen 0,5 und 30 an.' : 'Gib Minuten zwischen 10 und 300 an.'}</p>}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-400">{tri ? 'An welchen Tagen kannst du trainieren? Ideal sind 5 bis 7.' : 'An welchen Tagen willst du laufen?'}</p>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS_SHORT.map((label, i) => {
              const d = i as Weekday;
              const on = days.includes(d);
              return (
                <button key={label} type="button" aria-pressed={on} className={`min-h-11 rounded-lg text-sm font-medium ${on ? 'bg-accent text-white' : 'bg-border text-neutral-300'}`} onClick={() => toggle(d)}>
                  {label}
                </button>
              );
            })}
          </div>
          <label className="block text-sm text-neutral-400">
            {tri ? 'Lange Radeinheit am' : 'Langer Lauf am'}
            <select className={`${input} mt-1 block w-full text-neutral-100`} value={longDay} onChange={(e) => setCustom((c) => ({ ...c, longDay: Number(e.target.value) as Weekday }))}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {WEEKDAYS_SHORT[d]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-neutral-500">
            {tri ? 'Der lange Lauf liegt am Tag nach der langen Radeinheit. Ein Wochenendtag passt meist am besten.' : 'Der lange Lauf ist die wichtigste Einheit der Woche, lege ihn auf einen Tag mit viel Zeit.'}
          </p>
          {!daysValid && <p className="text-sm text-amber-300">{days.length < (tri ? 3 : 2) ? `Wähle mindestens ${tri ? 3 : 2} Tage.` : 'Wähle einen der Trainingstage als langen Tag.'}</p>}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {preview?.error && <p className="text-sm text-red-400">{preview.error}</p>}
          {preview?.ok && (
            <>
              <p className="text-sm">
                <strong>{GOAL_LABEL[type]}</strong> am {formatDay(date)}{timeSec ? `, Ziel ${formatClock(timeSec)}` : ''}: <strong>{preview.ok.weekCount} Wochen</strong>.
              </p>
              <ul className="flex flex-wrap gap-1 text-xs">
                {(Object.keys(PHASE_LABEL) as (keyof typeof PHASE_LABEL)[])
                  .filter((p) => preview.ok.phases[p])
                  .map((p) => (
                    <li key={p} className="rounded-full bg-border px-2 py-1">
                      {PHASE_LABEL[p]} · {preview.ok.phases[p]} Wo.
                    </li>
                  ))}
              </ul>
              <p className="text-sm text-neutral-300">
                Umfang pro Woche: Start etwa <strong>{formatMinutes(preview.ok.startMinutes)}</strong>, in der härtesten Woche etwa <strong>{formatMinutes(preview.ok.peakMinutes)}</strong>.
              </p>
              {preview.ok.warnings.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                  {preview.ok.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div>
                <h3 className="mb-1 text-sm font-semibold">Beispielwoche</h3>
                <ul className="divide-y divide-border rounded-lg bg-bg text-sm">
                  {preview.ok.exampleWeek.map((s) => (
                    <li key={s.date + s.title} className="flex items-center gap-2 px-3 py-2">
                      <span className="w-8 text-neutral-400">{WEEKDAYS_SHORT[(new Date(s.date + 'T00:00').getDay() + 6) % 7]}</span>
                      <span className="flex-1">
                        {s.title}
                        <span className="ml-1 text-xs text-neutral-500">{SPORT_LABEL[s.sport as keyof typeof SPORT_LABEL] ?? ''}</span>
                      </span>
                      <span className="tabular-nums text-neutral-400">{s.minutes ? formatMinutes(s.minutes) : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-neutral-500">Danach kannst du jede Einheit verschieben, überspringen oder den Plan mit anderen Angaben neu erstellen.</p>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        {step > 0 && (
          <button className={btn} disabled={busy} onClick={() => setStep(step - 1)}>
            Zurück
          </button>
        )}
        {step < 3 ? (
          <button className="min-h-12 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-50" disabled={!valid} onClick={() => setStep(step + 1)}>
            Weiter
          </button>
        ) : (
          <button className="min-h-12 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-50" disabled={!preview?.ok || busy} onClick={() => void create()}>
            Plan erstellen
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-500">Der Plan ist eine Orientierung und ersetzt keine Trainingsberatung. Bei Beschwerden ärztlich abklären.</p>
    </section>
  );
}

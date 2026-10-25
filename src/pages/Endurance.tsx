import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import PageTitle from '../components/PageTitle';
import ActivityImport from '../components/ActivityImport';
import EnduranceToday from '../components/EnduranceToday';
import ZonesSection from '../components/ZonesSection';

const EnduranceStats = lazy(() => import('../components/EnduranceStats'));
import { useActiveWorkout } from '../db/activeWorkout';
import { db } from '../db/dexie';
import {
  addPlannedSession,
  createGoalWithPlan,
  deleteGoal,
  deleteSession,
  doneSessions,
  generatePlanSessions,
  moveSession,
  setSessionSkipped,
  startPlannedSession,
  moveRace,
  updateGoal,
} from '../db/plans';
import type { Goal, GoalType, Level, Plan, PlannedSession, Weekday } from '../db/types';
import { WEEKDAYS_SHORT, addDays, daysBetween, formatDay, isIsoDate, parseIso, toIso } from '../lib/dates';
import { formatClock, parseClock } from '../lib/format';
import { parseNumber } from '../lib/units';
import { TRI_GOALS, isTriGoal } from '../lib/planGeneratorTri';
import { GOAL_LABEL, RUN_GOALS, planProgress, sessionStatus, sessionsOfWeek, weekIndexOf, type SessionStatus } from '../lib/plan';
import { PRESET_GROUPS } from '../lib/endurancePresets';
import { SPORT_LABEL } from '../lib/sports';

const PHASE_LABEL = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Tapering', race: 'Wettkampfwoche' } as const;
const STATUS_LABEL: Record<SessionStatus, string> = { done: 'Erledigt', skipped: 'Übersprungen', missed: 'Verpasst', open: 'Geplant' };
const STATUS_CLS: Record<SessionStatus, string> = {
  done: 'bg-accent/20 text-accent',
  skipped: 'bg-border text-neutral-400',
  missed: 'bg-amber-400/15 text-amber-300',
  open: 'bg-border text-neutral-300',
};

const btn = 'min-h-11 rounded-lg bg-border px-3 text-sm font-medium disabled:opacity-40';
const input = 'min-h-11 rounded-lg bg-border px-3 text-base';

export default function Endurance() {
  const today = toIso(new Date());
  const data = useLiveQuery(async () => {
    const goals = (await db.goals.toArray()).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
    const goal = goals.find((g) => g.targetDate >= today) ?? goals.at(-1);
    const plan = goal ? await db.plans.where('goalId').equals(goal.id).first() : undefined;
    const sessions = plan ? await db.plannedSessions.where('planId').equals(plan.id).toArray() : [];
    const done = await doneSessions(sessions.map((s) => s.id));
    return { goal, plan, sessions, done };
  }, [today]);

  const [tab, setTab] = useState<Tab | undefined>(undefined);
  if (!data) return null;
  const current: Tab = tab ?? (data.goal && data.plan ? 'today' : 'plan');

  return (
    <div className="pb-6">
      <PageTitle>Ausdauer</PageTitle>
      <div role="tablist" aria-label="Bereich" data-tour="endurance-tabs" className="mb-4 flex gap-1 rounded-lg bg-surface p-1 text-sm md:max-w-md">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={current === t.value}
            onClick={() => setTab(t.value)}
            className={`min-h-11 flex-1 rounded-md ${current === t.value ? 'bg-border font-semibold' : 'text-neutral-400'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {current === 'today' && (
        <>
          <EnduranceToday goal={data.goal} plan={data.plan} sessions={data.sessions} done={data.done} today={today} onOpenPlan={() => setTab('plan')} />
          <ActivityImport sessions={data.sessions} done={data.done} />
        </>
      )}
      {current === 'plan' && (
        <>
          {data.goal && data.plan ? (
            <PlanView goal={data.goal} plan={data.plan} sessions={data.sessions} done={data.done} today={today} />
          ) : (
            <GoalForm today={today} />
          )}
          <ZonesSection />
        </>
      )}
      {current === 'stats' && (
        <Suspense fallback={<p className="py-8 text-center text-sm text-neutral-500">Lade Auswertung …</p>}>
          <EnduranceStats goal={data.goal} plan={data.plan} sessions={data.sessions} done={data.done} today={today} />
        </Suspense>
      )}
    </div>
  );
}

type Tab = 'today' | 'plan' | 'stats';
const TABS: { value: Tab; label: string }[] = [
  { value: 'today', label: 'Heute' },
  { value: 'plan', label: 'Plan' },
  { value: 'stats', label: 'Auswertung' },
];

function GoalForm({ today }: { today: string }) {
  const [type, setType] = useState<GoalType>('marathon');
  const [date, setDate] = useState(addDays(today, 16 * 7));
  const [time, setTime] = useState('');
  const timeSec = parseClock(time);
  const valid = isIsoDate(date) && date > today && (!time.trim() || timeSec !== undefined);

  return (
    <form
      className="max-w-lg space-y-4 rounded-xl border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void createGoalWithPlan({ type, targetDate: date, ...(timeSec ? { targetTimeSec: timeSec } : {}) }, today);
      }}
    >
      <h2 className="text-lg font-semibold">Neues Ziel</h2>
      <label className="block text-sm text-neutral-400">
        Wettkampf
        <select className={`${input} mt-1 block w-full text-neutral-100`} value={type} onChange={(e) => setType(e.target.value as GoalType)}>
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
      <label className="block text-sm text-neutral-400">
        Zielzeit (optional, h:mm:ss)
        <input
          inputMode="text"
          placeholder="z. B. 4:15:00"
          className={`${input} mt-1 block w-full text-neutral-100`}
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <button type="submit" disabled={!valid} className="min-h-12 w-full rounded-lg bg-accent font-semibold text-white disabled:opacity-50">
        Ziel anlegen
      </button>
      <p className="text-xs text-neutral-500">
        Der Plan ist eine Orientierung und ersetzt keine Trainingsberatung. Bei Beschwerden ärztlich abklären.
      </p>
    </form>
  );
}

function PlanView({
  goal,
  plan,
  sessions,
  done,
  today,
}: {
  goal: Goal;
  plan: Plan;
  sessions: PlannedSession[];
  done: Map<string, string>;
  today: string;
}) {
  const current = Math.max(0, weekIndexOf(plan, today));
  const [week, setWeek] = useState(current);
  const [editing, setEditing] = useState(false);
  const hasFuture = sessions.some((s) => s.date >= today);
  const [setup, setSetup] = useState(!hasFuture);
  const [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => setWeek((w) => Math.min(w, plan.weeks.length - 1)), [plan.weeks.length]);

  const w = plan.weeks[Math.min(week, plan.weeks.length - 1)];
  const days = daysBetween(today, goal.targetDate);
  const list = sessionsOfWeek(sessions, w.startDate);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">{GOAL_LABEL[goal.type]}</div>
            <div className="text-sm text-neutral-400">
              {parseIso(goal.targetDate).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
              {goal.targetTimeSec ? ` · Ziel ${formatClock(goal.targetTimeSec)}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{Math.max(0, days)}</div>
            <div className="text-xs text-neutral-500">{days === 1 ? 'Tag' : 'Tage'}</div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Fortschritt bis zum Ziel" aria-valuenow={Math.round(planProgress(plan, goal, today) * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-accent" style={{ width: `${planProgress(plan, goal, today) * 100}%` }} />
        </div>
        <button className="mt-3 min-h-11 text-sm text-neutral-400" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Schließen' : 'Ziel bearbeiten'}
        </button>
        {editing && <GoalEdit goal={goal} today={today} onDone={() => setEditing(false)} />}
      </section>

      {setup ? (
        <PlanSetup
          plan={plan}
          tri={isTriGoal(goal.type)}
          replacing={hasFuture}
          onCancel={hasFuture ? () => setSetup(false) : undefined}
          onDone={(w) => {
            setWarnings(w);
            setSetup(false);
            setWeek(current);
          }}
          today={today}
        />
      ) : (
        <button className={`${btn} w-full md:w-auto`} onClick={() => setSetup(true)}>
          Plan neu erstellen
        </button>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <section>
        <div className="mb-2 flex items-center gap-2">
          <button aria-label="Vorherige Woche" className={`${btn} w-11 px-0`} disabled={week <= 0} onClick={() => setWeek(week - 1)}>
            ‹
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="font-semibold">
              Woche {w.index + 1} von {plan.weeks.length}
              {w.index === current ? ' · aktuell' : ''}
            </div>
            <div className="text-sm text-neutral-400">
              {formatDay(w.startDate)} – {formatDay(addDays(w.startDate, 6))} · {PHASE_LABEL[w.phase]}
              {w.isRecovery ? ' · Ruhewoche' : ''}
            </div>
          </div>
          <button aria-label="Nächste Woche" className={`${btn} w-11 px-0`} disabled={week >= plan.weeks.length - 1} onClick={() => setWeek(week + 1)}>
            ›
          </button>
        </div>

        <WeekStrip plan={plan} sessions={sessions} done={done} selected={w.index} current={current} onSelect={setWeek} />

        <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 7 }, (_, i) => addDays(w.startDate, i)).map((date) => (
            <DayCard key={date} date={date} today={today} plan={plan} sessions={list.filter((s) => s.date === date)} done={done} />
          ))}
        </ul>
      </section>
    </div>
  );
}

/** One small bar per week: filled share = done sessions of planned ones. */
function WeekStrip({
  plan,
  sessions,
  done,
  selected,
  current,
  onSelect,
}: {
  plan: Plan;
  sessions: PlannedSession[];
  done: Map<string, string>;
  selected: number;
  current: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1" role="group" aria-label="Wochenübersicht">
      {plan.weeks.map((w) => {
        const planned = sessions.filter((s) => s.weekIndex === w.index);
        const share = planned.length ? planned.filter((s) => done.has(s.id)).length / planned.length : 0;
        return (
          <button
            key={w.index}
            aria-label={`Woche ${w.index + 1}`}
            aria-current={w.index === selected}
            onClick={() => onSelect(w.index)}
            className={`relative h-8 overflow-hidden rounded-sm border text-[10px] ${
              w.index === selected ? 'border-accent' : w.index === current ? 'border-neutral-400' : 'border-border'
            } ${planned.length ? 'bg-border' : 'bg-surface'}`}
          >
            <span className="absolute inset-x-0 bottom-0 bg-accent/70" style={{ height: `${share * 100}%` }} />
            <span className="relative text-neutral-300">{w.index + 1}</span>
          </button>
        );
      })}
    </div>
  );
}

function DayCard({
  date,
  today,
  plan,
  sessions,
  done,
}: {
  date: string;
  today: string;
  plan: Plan;
  sessions: PlannedSession[];
  done: Map<string, string>;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <li className={`rounded-xl border bg-surface p-3 ${date === today ? 'border-accent/60' : 'border-border'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className={`font-semibold ${date === today ? 'text-accent' : ''}`}>{formatDay(date)}</span>
        <button className="min-h-11 rounded-lg px-3 text-sm text-accent" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          {adding ? 'Abbrechen' : '+ Einheit'}
        </button>
      </div>
      {adding && (
        <div className="mb-2 grid gap-1">
          {PRESET_GROUPS.map((g) => (
            <div key={g.sport} className="grid gap-1">
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{SPORT_LABEL[g.sport]}</div>
              {g.presets.map((p) => (
                <button
                  key={p.id}
                  className="min-h-11 rounded-lg bg-border px-3 text-left text-sm"
                  onClick={async () => {
                    await addPlannedSession(plan.id, date, p);
                    setAdding(false);
                  }}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-xs text-neutral-400">{p.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {sessions.length === 0 && !adding && <p className="text-sm text-neutral-600">Ruhetag</p>}
      <div className="space-y-2">
        {sessions.map((s) => (
          <SessionCard key={s.id} session={s} today={today} workoutId={done.get(s.id)} status={sessionStatus(s, done, today)} />
        ))}
      </div>
    </li>
  );
}

function SessionCard({ session: s, today, workoutId, status }: { session: PlannedSession; today: string; workoutId?: string; status: SessionStatus }) {
  const navigate = useNavigate();
  const active = useActiveWorkout();
  const [menu, setMenu] = useState(false);
  const finished = status === 'done';

  async function start() {
    await startPlannedSession(s.id);
    navigate('/workout/active');
  }

  return (
    <div className="rounded-lg bg-bg p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{s.title ?? 'Lauf'}</div>
          <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>
        </div>
        <button aria-label={`Optionen für ${s.title ?? 'Einheit'}`} aria-expanded={menu} className="min-h-11 min-w-11 rounded-lg text-xl text-neutral-400" onClick={() => setMenu((m) => !m)}>
          ⋯
        </button>
      </div>
      {finished && workoutId && (
        <Link to={`/history/${workoutId}`} className="mt-1 block min-h-11 py-3 text-sm text-accent">
          Zum Workout
        </Link>
      )}
      {!finished && status !== 'skipped' && (
        <button className="mt-2 min-h-11 w-full rounded-lg bg-accent font-semibold text-white disabled:opacity-40" disabled={!!active} onClick={() => void start()}>
          Starten
        </button>
      )}
      {menu && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-neutral-400">
            Verschieben
            <input
              type="date"
              className={`${input} text-neutral-100`}
              value={s.date}
              min={today}
              onChange={(e) => isIsoDate(e.target.value) && void moveSession(s.id, e.target.value)}
            />
          </label>
          {!finished && (
            <button className={btn} onClick={() => void setSessionSkipped(s.id, s.skippedAt === undefined)}>
              {s.skippedAt === undefined ? 'Überspringen' : 'Wiederherstellen'}
            </button>
          )}
          <button
            className={`${btn} text-red-400`}
            onClick={() => {
              if (confirm('Geplante Einheit löschen?')) void deleteSession(s.id);
            }}
          >
            Löschen
          </button>
        </div>
      )}
    </div>
  );
}

function GoalEdit({ goal, today, onDone }: { goal: Goal; today: string; onDone: () => void }) {
  const [date, setDate] = useState(goal.targetDate);
  const [time, setTime] = useState(goal.targetTimeSec ? formatClock(goal.targetTimeSec) : '');
  const timeSec = parseClock(time);
  const valid = isIsoDate(date) && date > today && (!time.trim() || timeSec !== undefined);
  return (
    <div className="mt-2 space-y-3 border-t border-border pt-3">
      <label className="block text-sm text-neutral-400">
        Zieldatum
        <input type="date" className={`${input} mt-1 block w-full text-neutral-100`} value={date} onChange={(e) => setDate(e.target.value)} />
        {date !== goal.targetDate && <span className="mt-1 block text-xs text-neutral-500">Ein erstellter Plan wird ab heute auf das neue Datum verteilt, erledigte Einheiten bleiben.</span>}
      </label>
      <label className="block text-sm text-neutral-400">
        Zielzeit (h:mm:ss)
        <input className={`${input} mt-1 block w-full text-neutral-100`} value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button
          className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-50"
          disabled={!valid}
          onClick={async () => {
            await updateGoal(goal.id, { targetTimeSec: time.trim() ? timeSec : undefined });
            // A new race date rebuilds a generated plan from today on.
            if (date !== goal.targetDate) await moveRace(goal.id, date, today);
            onDone();
          }}
        >
          Speichern
        </button>
        <button
          className={`${btn} text-red-400`}
          onClick={async () => {
            if (confirm('Ziel mit Plan und geplanten Einheiten löschen? Erledigte Workouts bleiben erhalten.')) await deleteGoal(goal.id);
          }}
        >
          Ziel löschen
        </button>
      </div>
    </div>
  );
}

const LEVELS: { value: Level; label: string }[] = [
  { value: 'beginner', label: 'Einsteiger' },
  { value: 'intermediate', label: 'Fortgeschritten' },
];

/** Generator settings: run days, long run day, level and current longest run. */
function PlanSetup({
  plan,
  tri,
  replacing,
  today,
  onCancel,
  onDone,
}: {
  plan: Plan;
  /** Triathlon goal: training days, long ride day and weekly hours instead of run settings. */
  tri: boolean;
  replacing: boolean;
  today: string;
  onCancel?: () => void;
  onDone: (warnings: string[]) => void;
}) {
  const saved = Object.keys(plan.availability).map(Number) as Weekday[];
  const [days, setDays] = useState<Weekday[]>(saved.length ? saved : tri ? [0, 1, 2, 3, 5, 6] : [1, 3, 6]);
  const [longDay, setLongDay] = useState<Weekday>(plan.longRunDay ?? (tri ? 5 : 6));
  const [level, setLevel] = useState<Level>(plan.level === 'beginner' ? 'beginner' : 'intermediate');
  const [baseline, setBaseline] = useState(tri ? String(plan.hoursPerWeek ?? 5).replace('.', ',') : String(plan.baselineLongRunMin ?? 60));
  const [error, setError] = useState('');
  const baselineValue = parseNumber(baseline) ?? NaN;
  const longDayValid = days.includes(longDay);
  const baselineValid = tri ? baselineValue >= 0.5 && baselineValue <= 30 : baselineValue >= 10 && baselineValue <= 300;
  const valid = days.length >= (tri ? 3 : 2) && longDayValid && baselineValid;

  const toggle = (d: Weekday) => setDays((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d].sort((a, b) => a - b)));

  async function submit() {
    if (replacing && !confirm('Offene Einheiten ab heute werden durch den neuen Plan ersetzt. Erledigte bleiben. Fortfahren?')) return;
    try {
      const settings = tri
        ? { runDays: days, longRunDay: longDay, level, baselineLongRunMin: plan.baselineLongRunMin ?? 60, hoursPerWeek: baselineValue }
        : { runDays: days, longRunDay: longDay, level, baselineLongRunMin: Math.round(baselineValue) };
      onDone(await generatePlanSessions(plan.id, settings, today));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">{replacing ? 'Plan neu erstellen' : 'Plan erstellen'}</h2>
      <fieldset>
        <legend className="mb-1 text-sm text-neutral-400">{tri ? 'Trainingstage (ideal 5 bis 7)' : 'Lauftage'}</legend>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS_SHORT.map((label, i) => {
            const d = i as Weekday;
            const on = days.includes(d);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                className={`min-h-11 rounded-lg text-sm font-medium ${on ? 'bg-accent text-white' : 'bg-border text-neutral-300'}`}
                onClick={() => toggle(d)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm text-neutral-400">
          {tri ? 'Lange Radeinheit am' : 'Langer Lauf am'}
          <select
            className={`${input} mt-1 block w-full text-neutral-100`}
            value={longDay}
            onChange={(e) => setLongDay(Number(e.target.value) as Weekday)}
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {WEEKDAYS_SHORT[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-neutral-400">
          Erfahrung
          <select className={`${input} mt-1 block w-full text-neutral-100`} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-neutral-400">
          {tri ? 'Training zuletzt (h pro Woche)' : 'Längster Lauf zuletzt (min)'}
          <input
            inputMode={tri ? 'decimal' : 'numeric'}
            className={`${input} mt-1 block w-full text-neutral-100`}
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
          />
        </label>
      </div>
      {!longDayValid && days.length > 0 && (
        <p className="text-sm text-amber-300">{tri ? 'Wähle einen Trainingstag für die lange Radeinheit.' : 'Wähle einen Lauftag für den langen Lauf.'}</p>
      )}
      {tri && <p className="text-xs text-neutral-500">Der lange Lauf liegt am Trainingstag nach der langen Radeinheit, Samstag als langer Tag passt meist am besten.</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="min-h-12 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-50" disabled={!valid} onClick={() => void submit()}>
          Plan erstellen
        </button>
        {onCancel && (
          <button className={btn} onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Regelbasiert: Grundlage, Aufbau, Spitze, Tapering, jede 3. Woche Ruhewoche, höchstens 10 % mehr pro Woche.
        {tri ? ' Pro Woche 2 × Schwimmen, 2 × Rad, 2 × Laufen und Stabi, ab dem Aufbau Koppeltraining.' : ''} Intensität nach Zone,
        die Zielpaces kommen aus „Zonen und Tempo“.
      </p>
    </section>
  );
}

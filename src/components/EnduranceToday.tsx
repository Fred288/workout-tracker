import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import AdaptCards from './AdaptCards';
import { useActiveWorkout } from '../db/activeWorkout';
import { db } from '../db/dexie';
import { startPlannedSession } from '../db/plans';
import type { Goal, Plan, PlannedSession } from '../db/types';
import { addDays, daysBetween, formatDay, parseIso } from '../lib/dates';
import { daysUntil, nextSession, plannedSeconds, runSets, weeklyAdherence, weeklyRunVolume } from '../lib/endurance';
import { formatClock } from '../lib/format';
import { GOAL_LABEL, weekIndexOf } from '../lib/plan';
import { formatNumber } from '../lib/units';

const PHASE_LABEL = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Tapering', race: 'Wettkampfwoche' } as const;

const minutes = (sec: number) => `${Math.round(sec / 60)} min`;

function dayWord(date: string, today: string): string {
  const n = daysUntil(date, today);
  return n === 0 ? 'Heute' : n === 1 ? 'Morgen' : n < 7 ? formatDay(date) : `${formatDay(date)} (in ${n} Tagen)`;
}

/** The "Heute" tab: what is next, how the week goes, how far the goal is. */
export default function EnduranceToday({
  goal,
  plan,
  sessions,
  done,
  today,
  onOpenPlan,
}: {
  goal?: Goal;
  plan?: Plan;
  sessions: PlannedSession[];
  done: Map<string, string>;
  today: string;
  onOpenPlan: () => void;
}) {
  const navigate = useNavigate();
  const active = useActiveWorkout();
  const workouts = useLiveQuery(async () => {
    const list = await db.workouts.filter((w) => !!w.finishedAt && w.startedAt > Date.now() - 42 * 86_400_000).toArray();
    const ids = [...new Set(list.flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
    const ex = await db.exercises.bulkGet(ids);
    return runSets(list, new Map(ex.filter((e) => !!e).map((e) => [e!.id, e!])));
  }, []);

  const next = useMemo(() => nextSession(sessions, done, today), [sessions, done, today]);
  const weekIdx = plan ? weekIndexOf(plan, today) : -1;
  const week = plan && weekIdx >= 0 ? plan.weeks[weekIdx] : undefined;
  const adherence = useMemo(
    () => (plan && week ? weeklyAdherence(plan.weeks, sessions, done, addDays(week.startDate, 6)).find((a) => a.weekIndex === week.index) : undefined),
    [plan, week, sessions, done],
  );
  const volume = workouts ? weeklyRunVolume(workouts, Date.now(), 1)[0] : undefined;

  if (!goal || !plan) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-neutral-400">
        <p>Lege im Reiter „Plan“ ein Ziel mit Zieldatum an, dann siehst du hier deine nächste Einheit und den Wochenfortschritt.</p>
        <button className="mt-3 min-h-11 rounded-lg bg-accent px-4 font-semibold text-white" onClick={onOpenPlan}>
          Zum Plan
        </button>
      </div>
    );
  }

  const days = daysBetween(today, goal.targetDate);
  const weeksLeft = Math.ceil(Math.max(0, days) / 7);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="text-sm text-neutral-400">Nächste Einheit</div>
        {next ? (
          <>
            <div className="mt-1 text-lg font-semibold">{next.title ?? 'Lauf'}</div>
            <div className="text-sm text-neutral-400">
              {dayWord(next.date, today)}
              {plannedSeconds(next) > 0 ? ` · ca. ${minutes(plannedSeconds(next))}` : ''}
            </div>
            <button
              className="mt-3 min-h-12 w-full rounded-lg bg-accent font-semibold text-white disabled:opacity-40 md:w-auto md:px-8"
              disabled={!!active}
              onClick={async () => {
                await startPlannedSession(next.id);
                navigate('/workout/active');
              }}
            >
              Starten
            </button>
            {active && <p className="mt-2 text-xs text-neutral-500">Beende erst das laufende Workout.</p>}
          </>
        ) : (
          <p className="mt-1 text-sm text-neutral-400">
            Keine offene Einheit geplant.{' '}
            <button className="min-h-11 text-accent" onClick={onOpenPlan}>
              Plan öffnen
            </button>
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="text-sm text-neutral-400">{GOAL_LABEL[goal.type]}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{Math.max(0, days)}</span>
          <span className="text-neutral-400">{days === 1 ? 'Tag' : 'Tage'} bis zum Ziel</span>
        </div>
        <div className="text-sm text-neutral-400">
          {parseIso(goal.targetDate).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
          {goal.targetTimeSec ? ` · Ziel ${formatClock(goal.targetTimeSec)}` : ''}
        </div>
        {week && (
          <div className="mt-2 text-sm">
            Woche {week.index + 1} von {plan.weeks.length} · {PHASE_LABEL[week.phase]}
            {week.isRecovery ? ' · Ruhewoche' : ''}
            <span className="text-neutral-500"> · noch {weeksLeft} {weeksLeft === 1 ? 'Woche' : 'Wochen'}</span>
          </div>
        )}
      </section>

      <AdaptCards plan={plan} goal={goal} sessions={sessions} done={done} today={today} sets={workouts ?? []} />

      <section className="rounded-xl border border-border bg-surface p-4 md:col-span-2">
        <div className="text-sm text-neutral-400">Diese Woche</div>
        {adherence && adherence.planned > 0 ? (
          <>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {adherence.done} von {adherence.planned} Einheiten erledigt
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-label="Einheiten dieser Woche"
              aria-valuemin={0}
              aria-valuemax={adherence.planned}
              aria-valuenow={adherence.done}
            >
              <div className="h-full bg-accent" style={{ width: `${(adherence.done / adherence.planned) * 100}%` }} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">In dieser Woche ist nichts geplant.</p>
        )}
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg bg-bg p-3">
            <dt className="text-neutral-400">Gelaufen</dt>
            <dd className="text-lg font-semibold tabular-nums">{volume ? `${formatNumber(Math.round(volume.distanceM / 100) / 10)} km` : '–'}</dd>
          </div>
          <div className="rounded-lg bg-bg p-3">
            <dt className="text-neutral-400">Zeit</dt>
            <dd className="text-lg font-semibold tabular-nums">{volume ? minutes(volume.durationSec) : '–'}</dd>
          </div>
          <div className="rounded-lg bg-bg p-3">
            <dt className="text-neutral-400">Geplant</dt>
            <dd className="text-lg font-semibold tabular-nums">{adherence?.plannedSec ? minutes(adherence.plannedSec) : '–'}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

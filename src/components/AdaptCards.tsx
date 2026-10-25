import { useMemo, useState } from 'react';
import { applyReschedule, setSessionSkipped, startBreak } from '../db/plans';
import { saveProfile, useProfile } from '../db/profile';
import type { Goal, Plan, PlannedSession, Weekday } from '../db/types';
import { paceSamples, paceSuggestion, planSettings, rescheduleSuggestions } from '../lib/adapt';
import { addDays, formatDay } from '../lib/dates';
import type { RunSet } from '../lib/endurance';
import { formatClock } from '../lib/format';
import { RACE_DISTANCES } from '../lib/zones';

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const BREAK_DAYS = [3, 5, 7, 10, 14, 21];
const DISMISS_KEY = 'paceSuggestionDismissed';

const card = 'rounded-xl border border-accent/40 bg-accent/10 p-4 md:col-span-2';
const btn = 'min-h-11 rounded-lg px-4 text-sm font-medium';

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Suggestions to adapt the plan: catch up missed key sessions, new reference time, a break. */
export default function AdaptCards({
  plan,
  goal,
  sessions,
  done,
  today,
  sets,
}: {
  plan: Plan;
  goal: Goal;
  sessions: PlannedSession[];
  done: Map<string, string>;
  today: string;
  sets: RunSet[];
}) {
  const profile = useProfile();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [message, setMessage] = useState<string[]>([]);
  const [breakOpen, setBreakOpen] = useState(false);
  const [breakDays, setBreakDays] = useState(7);

  const runDays = planSettings(plan)?.runDays ?? ALL_DAYS;
  const moves = useMemo(() => rescheduleSuggestions(sessions, done, runDays, today, goal.targetDate), [sessions, done, runDays, today, goal.targetDate]);
  const byId = new Map(sessions.map((s) => [s.id, s]));

  const ref = profile?.referenceRun;
  const pace = useMemo(() => (ref ? paceSuggestion(paceSamples(sets, ref, Date.now()), ref) : undefined), [sets, ref]);
  const paceKey = pace && ref ? `${ref.distanceM}-${ref.timeSec}-${pace.timeSec}` : '';
  const refLabel = ref ? (RACE_DISTANCES.find((r) => r.distanceM === ref.distanceM)?.label ?? `${ref.distanceM / 1000} km`) : '';

  return (
    <>
      {moves.length > 0 && (
        <section className={card}>
          <h2 className="font-semibold">Verpasste Einheiten nachholen</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {moves.map((m) => {
              const s = byId.get(m.sessionId)!;
              const replaced = m.replacesId ? byId.get(m.replacesId) : undefined;
              return (
                <li key={m.sessionId} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{s.title ?? 'Einheit'}</span>
                    <span className="block text-neutral-400">
                      {formatDay(s.date)} → {formatDay(m.toDate)}
                      {replaced ? ` (statt ${replaced.title ?? 'lockerer Lauf'})` : ''}
                    </span>
                  </span>
                  <button className={`${btn} bg-border`} onClick={() => void setSessionSkipped(s.id, true)}>
                    Auslassen
                  </button>
                </li>
              );
            })}
          </ul>
          <button className={`${btn} mt-3 w-full bg-accent font-semibold text-white md:w-auto`} onClick={() => void applyReschedule(moves)}>
            {moves.length === 1 ? 'Nachholen' : 'Alle nachholen'}
          </button>
        </section>
      )}

      {pace && ref && dismissed !== paceKey && (
        <section className={card}>
          <h2 className="font-semibold">Tempovorgaben anpassen?</h2>
          <p className="mt-1 text-sm text-neutral-300">
            {pace.matches} deiner letzten {pace.of} Läufe waren {pace.direction === 'faster' ? 'schneller' : 'langsamer'} als ihre Zone. Neue Referenz{' '}
            {refLabel}: <strong className="tabular-nums">{formatClock(pace.timeSec)}</strong> statt {formatClock(ref.timeSec)}. Die Paces werden damit{' '}
            {pace.direction === 'faster' ? 'schneller' : 'langsamer'}.
          </p>
          <div className="mt-3 flex gap-2">
            <button className={`${btn} bg-accent font-semibold text-white`} onClick={() => void saveProfile({ referenceRun: { distanceM: ref.distanceM, timeSec: pace.timeSec, setAt: Date.now() } })}>
              Übernehmen
            </button>
            <button
              className={`${btn} bg-border`}
              onClick={() => {
                setDismissed(paceKey);
                try {
                  localStorage.setItem(DISMISS_KEY, paceKey);
                } catch {
                  // Without storage the hint just comes back next time.
                }
              }}
            >
              Nicht jetzt
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-4 md:col-span-2">
        <button className="flex min-h-11 w-full items-center justify-between text-left" aria-expanded={breakOpen} onClick={() => setBreakOpen((o) => !o)}>
          <span className="font-semibold">Nicht 100 % fit?</span>
          <span className="text-neutral-400">{breakOpen ? '▲' : '▼'}</span>
        </button>
        {breakOpen && (
          <div className="mt-2 space-y-3 text-sm">
            <p className="text-neutral-400">
              Krank, verletzt oder im Urlaub: Die Einheiten der Pause werden übersprungen, danach startet der Plan etwas leichter (10 % weniger pro
              Woche Pause, höchstens 40 %). Bei Beschwerden erst ärztlich abklären.
            </p>
            <label className="block text-neutral-400">
              Pause ab heute
              <select className="mt-1 min-h-11 w-full rounded-lg bg-border px-3 text-base text-neutral-100" value={breakDays} onChange={(e) => setBreakDays(Number(e.target.value))}>
                {BREAK_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d} Tage (zurück am {formatDay(addDays(today, d))})
                  </option>
                ))}
              </select>
            </label>
            <button
              className={`${btn} w-full bg-accent font-semibold text-white md:w-auto`}
              onClick={async () => {
                if (!confirm(`Einheiten bis ${formatDay(addDays(today, breakDays - 1))} überspringen und den Plan danach neu verteilen?`)) return;
                const warnings = await startBreak(plan.id, today, breakDays);
                setMessage([`Pause eingetragen. Weiter geht es am ${formatDay(addDays(today, breakDays))}`, ...warnings]);
                setBreakOpen(false);
              }}
            >
              Pause eintragen
            </button>
          </div>
        )}
        {message.length > 0 && (
          <ul role="status" className="mt-2 space-y-1 text-sm text-accent">
            {message.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

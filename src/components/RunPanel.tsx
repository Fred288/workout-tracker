import { useState } from 'react';
import { useProfile } from '../db/profile';
import type { Sport, Workout } from '../db/types';
import { formatClock } from '../lib/format';
import { formatPace } from '../lib/pace';
import {
  currentStep,
  doneDistanceM,
  elapsedMs,
  isPaused,
  pauseWorkout,
  resumeWorkout,
  stepElapsedSec,
} from '../lib/runClock';
import { formatNumber, parseNumber } from '../lib/units';
import { profilePaceZones } from '../lib/zones';
import { paceRangeText } from './ZonesSection';

const pad = (n: number) => String(n).padStart(2, '0');

/** 2595 s -> "0:43:15", like a sports watch. */
function formatHms(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const SIZE = 240;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

const SPORT_LABEL = { run: 'Lauf', bike: 'Fahrt', swim: 'Schwimmen', brick: 'Einheit', strength: 'Einheit' } as const;

/**
 * Timer screen for endurance workouts: big clock, current step with countdown, pause and
 * "next step". Distance is entered by hand (no GPS). The sets stay editable below.
 */
export default function RunPanel({
  workout,
  now,
  onMutate,
  onNext,
  onFinish,
  sports,
}: {
  workout: Workout;
  /** Sport of every exercise of the workout, by WorkoutExercise id. */
  sports: ReadonlyMap<string, Sport>;
  now: number;
  onMutate: (fn: (w: Workout) => Workout) => void;
  /** Finishes the current step; distance in metres if the user entered one. */
  onNext: (distanceM?: number) => void;
  onFinish: (distanceM?: number) => void;
}) {
  const step = currentStep(workout);
  // The step decides the units; when all steps are done the last exercise with a done set does.
  const lastDone = [...workout.exercises].reverse().find((e) => e.sets.some((s) => s.completed));
  const stepSport: Sport = sports.get(step?.exerciseId ?? lastDone?.id ?? '') ?? 'run';
  const meters = stepSport === 'swim';
  const profile = useProfile();
  const paceZones = profile ? profilePaceZones(profile) : undefined;
  const targetPace = stepSport === 'run' && step?.set.zone && paceZones ? paceRangeText(paceZones.zones[step.set.zone]) : '';
  const paused = isPaused(workout);
  const total = elapsedMs(workout, now) / 1000;
  const inStep = stepElapsedSec(workout, now);
  const target = step?.set.durationSec;
  const planned = step?.set.distanceM;

  const [distText, setDistText] = useState('');
  // The input belongs to one step: it resets when the step changes.
  const [forStep, setForStep] = useState(step?.set.id);
  if (forStep !== step?.set.id) {
    setForStep(step?.set.id);
    setDistText('');
  }
  const typed = parseNumber(distText);
  const distanceM = typed !== undefined && typed >= 0 ? Math.round(meters ? typed : typed * 1000) : undefined;

  const progress = target ? Math.min(1, inStep / target) : (total % 60) / 60;
  const over = target ? inStep - target : 0;

  // Totals of the sport that is on right now (a brick workout shows bike, then run).
  const ofSport = { ...workout, exercises: workout.exercises.filter((e) => (sports.get(e.id) ?? 'run') === stepSport) };
  const doneM = doneDistanceM(ofSport);
  const doneSets = ofSport.exercises.flatMap((e) => e.sets).filter((s) => s.completed && s.distanceM && s.durationSec);
  const pace = formatPace(
    stepSport,
    doneSets.reduce((n, s) => n + s.distanceM!, 0),
    doneSets.reduce((n, s) => n + s.durationSec!, 0),
  );
  const paceStat = { run: ['/km', 'Ø Pace /km'], swim: ['/100 m', 'Ø Pace /100 m'], bike: ['km/h', 'Ø km/h'], strength: ['', 'Ø Pace'] }[stepSport];

  const kind = step ? (step.set.type === 'warmup' ? 'Locker' : 'Belastung') : 'Fertig';
  const sport = SPORT_LABEL[workout.sport ?? 'run'];
  const exerciseLabel = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', strength: 'Stabi' }[stepSport];

  const round = 'flex h-16 w-16 items-center justify-center rounded-full text-2xl';

  return (
    <section aria-label={`${sport}-Timer`} className="rounded-2xl border border-border bg-surface px-4 py-6">
      <div className="relative mx-auto aspect-square w-full max-w-[17rem]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full -rotate-90" aria-hidden>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-border" />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            className={over > 0 ? 'stroke-amber-400' : 'stroke-accent'}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-4xl font-semibold tabular-nums" aria-label="Gesamtzeit">
            {formatHms(total)}
          </div>
          <div className="mt-1 flex w-40 justify-between text-xs text-neutral-500">
            <span>h</span>
            <span>min</span>
            <span>sek</span>
          </div>
          {paused && <div className="mt-2 text-sm font-semibold text-amber-400">Pausiert</div>}
        </div>
      </div>

      <div className="mt-4 text-center" aria-live="off">
        {step ? (
          <>
            <div className="text-sm text-neutral-400">
              {exerciseLabel} · Schritt {step.number} von {step.total} · {kind}
              {step.set.zone ? ` · Zone ${step.set.zone}` : ''}
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {target
                ? over > 0
                  ? `+${formatClock(over)} über Ziel`
                  : `noch ${formatClock(target - inStep)}`
                : planned
                  ? `Ziel ${meters ? `${Math.round(planned)} m` : `${formatNumber(planned / 1000)} km`} · ${formatClock(inStep)}`
                  : formatClock(inStep)}
            </div>
            {targetPace && <div className="text-sm text-neutral-400">Zielpace {targetPace}</div>}
          </>
        ) : (
          <div className="text-sm text-neutral-400">Alle Schritte erledigt. Du kannst beenden.</div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 divide-x divide-border border-y border-border py-3 text-center">
        <div>
          <div className="text-2xl font-semibold tabular-nums">{pace ? pace.replace(` ${paceStat[0]}`, '') : '–'}</div>
          <div className="text-sm text-accent">{paceStat[1]}</div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{meters ? Math.round(doneM) : formatNumber(Math.round(doneM / 10) / 100)}</div>
          <div className="text-sm text-accent">Distanz {meters ? 'm' : 'km'}</div>
        </div>
      </div>

      {step && (
        <label className="mt-4 flex items-center justify-between gap-3 text-sm text-neutral-300">
          <span>Distanz dieses Schritts ({meters ? 'm' : 'km'})</span>
          <input
            inputMode="decimal"
            aria-label={`Distanz dieses Schritts in ${meters ? 'm' : 'km'}`}
            value={distText}
            placeholder={planned ? (meters ? String(Math.round(planned)) : formatNumber(planned / 1000)) : '0'}
            onChange={(e) => setDistText(e.target.value)}
            className="h-11 w-24 rounded-md bg-border text-center text-base tabular-nums placeholder:text-neutral-600"
          />
        </label>
      )}

      <div className="mt-6 flex items-start justify-around">
        <div className="flex flex-col items-center gap-1">
          <button aria-label="Beenden" className={`${round} bg-border text-neutral-100`} onClick={() => onFinish(distanceM)}>
            ✕
          </button>
          <span className="text-sm text-neutral-400">Beenden</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            aria-label={paused ? 'Fortsetzen' : 'Pause'}
            aria-pressed={paused}
            className={`${round} h-20 w-20 bg-accent text-3xl text-white shadow-lg shadow-accent/30`}
            onClick={() => onMutate((w) => (paused ? resumeWorkout(w, Date.now()) : pauseWorkout(w, Date.now())))}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          <span className="text-sm text-neutral-400">{paused ? 'Fortsetzen' : 'Pause'}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            aria-label="Schritt abschließen"
            disabled={!step}
            className={`${round} bg-border text-neutral-100 disabled:opacity-30`}
            onClick={() => onNext(distanceM)}
          >
            ✓
          </button>
          <span className="text-sm text-neutral-400">Weiter</span>
        </div>
      </div>
    </section>
  );
}

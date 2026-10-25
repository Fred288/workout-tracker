import { useState } from 'react';
import type { Workout } from '../db/types';
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
}: {
  workout: Workout;
  now: number;
  onMutate: (fn: (w: Workout) => Workout) => void;
  /** Finishes the current step; distance in metres if the user entered one. */
  onNext: (distanceM?: number) => void;
  onFinish: (distanceM?: number) => void;
}) {
  const step = currentStep(workout);
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
  const distanceM = typed !== undefined && typed >= 0 ? Math.round(typed * 1000) : undefined;

  const progress = target ? Math.min(1, inStep / target) : (total % 60) / 60;
  const over = target ? inStep - target : 0;

  const doneM = doneDistanceM(workout);
  const doneSets = workout.exercises.flatMap((e) => e.sets).filter((s) => s.completed && s.distanceM && s.durationSec);
  const pace = formatPace(
    'run',
    doneSets.reduce((n, s) => n + s.distanceM!, 0),
    doneSets.reduce((n, s) => n + s.durationSec!, 0),
  );

  const kind = step ? (step.set.type === 'warmup' ? 'Locker' : 'Belastung') : 'Fertig';
  const sport = SPORT_LABEL[workout.sport ?? 'run'];

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
              Schritt {step.number} von {step.total} · {kind}
              {step.set.zone ? ` · Zone ${step.set.zone}` : ''}
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {target
                ? over > 0
                  ? `+${formatClock(over)} über Ziel`
                  : `noch ${formatClock(target - inStep)}`
                : planned
                  ? `Ziel ${formatNumber(planned / 1000)} km · ${formatClock(inStep)}`
                  : formatClock(inStep)}
            </div>
          </>
        ) : (
          <div className="text-sm text-neutral-400">Alle Schritte erledigt. Du kannst beenden.</div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 divide-x divide-border border-y border-border py-3 text-center">
        <div>
          <div className="text-2xl font-semibold tabular-nums">{pace ? pace.replace(' /km', '') : '–'}</div>
          <div className="text-sm text-accent">Ø Pace /km</div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{formatNumber(Math.round(doneM / 10) / 100)}</div>
          <div className="text-sm text-accent">Distanz km</div>
        </div>
      </div>

      {step && (
        <label className="mt-4 flex items-center justify-between gap-3 text-sm text-neutral-300">
          <span>Distanz dieses Schritts (km)</span>
          <input
            inputMode="decimal"
            aria-label="Distanz dieses Schritts in km"
            value={distText}
            placeholder={planned ? formatNumber(planned / 1000) : '0'}
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

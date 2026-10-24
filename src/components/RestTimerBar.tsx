import { useEffect, useRef } from 'react';
import { adjustRest, clearRest, useRestTimer } from '../db/activeWorkout';
import { formatClock } from '../lib/format';
import { useNow } from '../lib/hooks';
import { restDoneSignal } from '../lib/sound';

/** Rest countdown, derived from the stored end time, so it survives reloads and app kills. */
export default function RestTimerBar() {
  const timer = useRestTimer();
  const now = useNow(250, !!timer);
  const signalled = useRef<number | null>(null);

  const remainingMs = timer ? Math.max(0, timer.endsAt - now) : 0;
  const done = !!timer && remainingMs === 0;

  useEffect(() => {
    // Signal once per timer, and only if it ran out while the app was open.
    if (done && timer && signalled.current !== timer.endsAt && now - timer.endsAt < 3000) {
      signalled.current = timer.endsAt;
      restDoneSignal();
    }
  }, [done, timer, now]);

  if (!timer) return null;
  const progress = timer.durationSec ? remainingMs / (timer.durationSec * 1000) : 0;
  const btn = 'min-h-11 min-w-11 rounded-lg bg-border px-3 text-sm font-medium';

  return (
    <div className={`relative border-t border-border ${done ? 'bg-accent/25' : 'bg-surface'}`} role="timer">
      <div
        className="absolute inset-x-0 top-0 h-1 origin-left bg-accent transition-transform duration-200"
        style={{ transform: `scaleX(${progress})` }}
      />
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
        <div className="mr-auto">
          <div className="text-xs text-neutral-400">{done ? 'Pause vorbei' : 'Pause'}</div>
          <div className="text-2xl font-semibold tabular-nums">{formatClock(Math.ceil(remainingMs / 1000))}</div>
        </div>
        {!done && (
          <>
            <button className={btn} onClick={() => void adjustRest(-15)}>
              −15
            </button>
            <button className={btn} onClick={() => void adjustRest(15)}>
              +15
            </button>
          </>
        )}
        <button className={`${btn} ${done ? 'bg-accent text-white' : ''}`} onClick={() => void clearRest()}>
          {done ? 'OK' : 'Überspringen'}
        </button>
      </div>
    </div>
  );
}

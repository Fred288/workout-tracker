import { useEffect, useState } from 'react';

/**
 * Current time, refreshed every `intervalMs`. Only used to re-render clocks: all durations
 * are computed from stored timestamps, never by counting ticks.
 */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

/** Keeps the screen on while `enabled`; re-acquired when the app returns to the foreground. */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let disposed = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (disposed) void l.release();
        else lock = l;
      } catch {
        // Denied (e.g. low battery mode); the workout still works without it.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [enabled]);
}

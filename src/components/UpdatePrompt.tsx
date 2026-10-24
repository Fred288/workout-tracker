import { useActiveWorkout } from '../db/activeWorkout';
import { useUpdate } from '../lib/update';

/** Banner shown when a new app version is ready; the user decides when to reload. */
export default function UpdatePrompt() {
  const { ready, apply } = useUpdate();
  const workout = useActiveWorkout();
  if (!ready || workout === undefined) return null;
  return (
    <div role="status" className="flex items-center gap-3 border-t border-border bg-accent/15 px-4 py-2 text-sm">
      <span className="flex-1">
        {workout
          ? 'Neue Version bereit. Aktualisiere nach dem Workout, dein Stand bleibt gespeichert.'
          : 'Neue Version verfügbar.'}
      </span>
      <button className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-white" onClick={apply}>
        Aktualisieren
      </button>
    </div>
  );
}

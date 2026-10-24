import { Link, useLocation } from 'react-router-dom';
import { useActiveWorkout } from '../db/activeWorkout';
import { formatClock } from '../lib/format';
import { useNow } from '../lib/hooks';

/** Shown on every other screen while a workout is running. */
export default function ActiveWorkoutBanner() {
  const workout = useActiveWorkout();
  const { pathname } = useLocation();
  const visible = !!workout && pathname !== '/workout/active';
  const now = useNow(1000, visible);
  if (!visible || !workout) return null;
  return (
    <Link
      to="/workout/active"
      className="flex min-h-12 items-center gap-3 border-t border-border bg-accent/15 px-4 text-sm"
    >
      <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
      <span className="truncate font-medium">{workout.name}</span>
      <span className="tabular-nums text-neutral-400">{formatClock((now - workout.startedAt) / 1000)}</span>
      <span className="ml-auto font-medium text-accent">Fortsetzen</span>
    </Link>
  );
}

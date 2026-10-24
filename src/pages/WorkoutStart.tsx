import { useNavigate } from 'react-router-dom';
import PageTitle from '../components/PageTitle';
import { startWorkout, useActiveWorkout } from '../db/activeWorkout';
import { formatClock } from '../lib/format';
import { useNow } from '../lib/hooks';
import { createWorkout } from '../lib/workout';

export default function WorkoutStart() {
  const active = useActiveWorkout();
  const navigate = useNavigate();
  const now = useNow(1000, !!active);

  async function startEmpty() {
    await startWorkout(createWorkout(Date.now()));
    navigate('/workout/active');
  }

  return (
    <>
      <PageTitle>Workout</PageTitle>
      {active === undefined ? null : active ? (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
          <div className="text-sm text-neutral-400">Läuft seit {formatClock((now - active.startedAt) / 1000)}</div>
          <div className="mb-3 text-lg font-semibold">{active.name}</div>
          <button
            className="min-h-12 w-full rounded-lg bg-accent font-semibold text-white md:w-auto md:px-8"
            onClick={() => navigate('/workout/active')}
          >
            Workout fortsetzen
          </button>
        </div>
      ) : (
        <button
          className="min-h-12 w-full rounded-lg bg-accent font-semibold text-white md:w-auto md:px-8"
          onClick={() => void startEmpty()}
        >
          Leeres Workout starten
        </button>
      )}
    </>
  );
}

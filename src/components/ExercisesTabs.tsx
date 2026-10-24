import { NavLink } from 'react-router-dom';

/** Switch between the exercise library and the global records table. */
export default function ExercisesTabs() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-10 flex-1 items-center justify-center rounded-md ${isActive ? 'bg-border font-semibold' : 'text-neutral-400'}`;
  return (
    <nav aria-label="Übungen oder Rekorde" className="flex gap-1 rounded-lg bg-surface p-1 text-sm">
      <NavLink to="/exercises" end className={cls}>
        Übungen
      </NavLink>
      <NavLink to="/records" className={cls}>
        Rekorde
      </NavLink>
    </nav>
  );
}

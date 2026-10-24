import { Link } from 'react-router-dom';
import ExerciseBrowser from '../components/ExerciseBrowser';
import { useExerciseFilters } from '../store/exerciseFilters';

export default function Exercises() {
  const { filters, set, reset } = useExerciseFilters();
  return (
    <ExerciseBrowser
      filters={filters}
      onChange={set}
      onReset={reset}
      header={
        <div className="flex items-center justify-between pt-4">
          <h1 className="text-2xl font-bold">Übungen</h1>
          <Link to="/exercises/new" className="flex min-h-11 items-center rounded-lg px-3 font-medium text-accent">
            + Neu
          </Link>
        </div>
      }
    />
  );
}

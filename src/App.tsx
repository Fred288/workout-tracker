import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import SideNav from './components/SideNav';
import RestTimerBar from './components/RestTimerBar';
import ActiveWorkoutBanner from './components/ActiveWorkoutBanner';
import Profile from './pages/Profile';
import History from './pages/History';
import HistoryDetail from './pages/HistoryDetail';
import WorkoutStart from './pages/WorkoutStart';
import ActiveWorkout from './pages/ActiveWorkout';
import WorkoutSummary from './pages/WorkoutSummary';
import Exercises from './pages/Exercises';
import ExerciseDetail from './pages/ExerciseDetail';
import ExerciseEdit from './pages/ExerciseEdit';
import Settings from './pages/Settings';

export default function App() {
  return (
    <HashRouter>
      <div className="flex h-full">
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="h-[env(safe-area-inset-top)] shrink-0 md:hidden" />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-md px-4 md:max-w-3xl md:px-8 lg:max-w-5xl">
              <Routes>
                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/history" element={<History />} />
                <Route path="/history/:id" element={<HistoryDetail />} />
                <Route path="/workout" element={<WorkoutStart />} />
                <Route path="/workout/active" element={<ActiveWorkout />} />
                <Route path="/workout/summary/:id" element={<WorkoutSummary />} />
                <Route path="/exercises" element={<Exercises />} />
                <Route path="/exercises/new" element={<ExerciseEdit />} />
                <Route path="/exercises/:id" element={<ExerciseDetail />} />
                <Route path="/exercises/:id/edit" element={<ExerciseEdit />} />
                <Route path="*" element={<Navigate to="/workout" replace />} />
              </Routes>
            </div>
          </main>
          <RestTimerBar />
          <ActiveWorkoutBanner />
          <BottomNav />
        </div>
      </div>
    </HashRouter>
  );
}

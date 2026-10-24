import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import Profile from './pages/Profile';
import History from './pages/History';
import WorkoutStart from './pages/WorkoutStart';
import Exercises from './pages/Exercises';

export default function App() {
  return (
    <HashRouter>
      <div className="mx-auto flex h-full max-w-md flex-col">
        <main className="flex-1 overflow-y-auto px-4 pt-[env(safe-area-inset-top)]">
          <Routes>
            <Route path="/profile" element={<Profile />} />
            <Route path="/history" element={<History />} />
            <Route path="/workout" element={<WorkoutStart />} />
            <Route path="/exercises" element={<Exercises />} />
            <Route path="*" element={<Navigate to="/workout" replace />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  );
}

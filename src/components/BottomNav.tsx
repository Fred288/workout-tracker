import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/profile', label: 'Profil', icon: '👤' },
  { to: '/history', label: 'Verlauf', icon: '🕒' },
  { to: '/workout', label: 'Workout', icon: '🏋️' },
  { to: '/exercises', label: 'Übungen', icon: '📖' },
];

export default function BottomNav() {
  return (
    <nav className="grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
              isActive ? 'text-accent' : 'text-neutral-400'
            }`
          }
        >
          <span className="text-xl" aria-hidden>
            {t.icon}
          </span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';

/** Tablet, desktop and TV navigation. */
export default function SideNav() {
  return (
    <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface p-4 pt-[max(1rem,env(safe-area-inset-top))] md:flex">
      <div className="mb-4 px-3 text-lg font-bold">Workout Tracker</div>
      {NAV_ITEMS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          data-tour={`nav-${t.to.slice(1)}`}
          className={({ isActive }) =>
            `flex min-h-12 items-center gap-3 rounded-lg px-3 ${
              isActive ? 'bg-border text-accent' : 'text-neutral-300 hover:bg-border/60'
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

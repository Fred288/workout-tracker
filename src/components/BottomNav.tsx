import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';

/** Phone navigation; replaced by SideNav from md upwards. */
export default function BottomNav() {
  return (
    <nav className="grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {NAV_ITEMS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          data-tour={`nav-${t.to.slice(1)}`}
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

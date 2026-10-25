import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TOUR_STEPS } from '../lib/tour';

interface TourApi {
  start: () => void;
}

const TourContext = createContext<TourApi>({ start: () => {} });

/** Start the guided tour; it never starts on its own. */
export const useTour = () => useContext(TourContext);

export function TourProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const api = useMemo<TourApi>(() => ({ start: () => setOpen(true) }), []);
  return (
    <TourContext.Provider value={api}>
      {children}
      {open && <Tour onClose={() => setOpen(false)} />}
    </TourContext.Provider>
  );
}

const PAD = 6;
const FIND_FRAMES = 45;

/** The visible element for an anchor (side and bottom navigation share names, only one is shown). */
function findTarget(name: string): HTMLElement | undefined {
  const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)];
  return all.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function Tour({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(TOUR_STEPS.length - 1, i))), []);

  // Go to the screen of the step, wait for its anchor, scroll it into view.
  useEffect(() => {
    if (pathname !== step.route) navigate(step.route);
  }, [step.route, pathname, navigate]);

  useEffect(() => {
    setRect(null);
    if (!step.target || pathname !== step.route) return;
    let frame = 0;
    let raf = 0;
    const find = () => {
      const el = findTarget(step.target!);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
        setRect(el.getBoundingClientRect());
      } else if (frame++ < FIND_FRAMES) raf = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(raf);
  }, [step.target, step.route, pathname]);

  // Keep the spotlight on its element when the window changes or the page scrolls.
  useEffect(() => {
    if (!step.target) return;
    const update = () => {
      const el = findTarget(step.target!);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  useLayoutEffect(() => {
    next.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === 'Tab') {
        // Keep the focus inside the card.
        const buttons = card.current?.querySelectorAll<HTMLElement>('button');
        if (!buttons?.length) return;
        const first = buttons[0];
        const lastBtn = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastBtn.focus();
        } else if (!e.shiftKey && document.activeElement === lastBtn) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go, onClose]);

  // The card sits on the side of the screen away from the highlighted element.
  const cardOnTop = rect ? rect.top + rect.height / 2 > window.innerHeight / 2 : false;
  const centred = !step.target || !rect;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Blocks the page behind; the dark area comes from the spotlight or, without a target, from here. */}
      <div className={`absolute inset-0 ${centred ? 'bg-black/70' : ''}`} onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-accent transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)',
          }}
        />
      )}
      <div
        className={`absolute inset-x-0 flex px-4 ${
          centred ? 'inset-y-0 items-center justify-center' : cardOnTop ? 'top-0 pt-[max(1rem,env(safe-area-inset-top))]' : 'bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))]'
        } ${centred ? '' : 'justify-center'}`}
      >
        <div ref={card} className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-2xl">
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
            <span>
              Schritt {index + 1} von {TOUR_STEPS.length}
            </span>
            <button className="min-h-11 rounded-lg px-3 text-neutral-300" onClick={onClose}>
              Tour beenden
            </button>
          </div>
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-border" aria-hidden>
            <div className="h-full bg-accent transition-all" style={{ width: `${((index + 1) / TOUR_STEPS.length) * 100}%` }} />
          </div>
          <h2 id="tour-title" className="text-lg font-semibold">
            {step.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-neutral-300">{step.text}</p>
          <div className="mt-4 flex gap-2">
            <button className="min-h-11 rounded-lg bg-border px-4 text-sm font-medium disabled:opacity-40" disabled={index === 0} onClick={() => go(index - 1)}>
              Zurück
            </button>
            <button ref={next} className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-semibold text-white" onClick={() => (last ? onClose() : go(index + 1))}>
              {last ? 'Fertig' : 'Weiter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

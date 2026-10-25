import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

export interface DragHandleProps {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
  style: CSSProperties;
}

interface Drag {
  from: number;
  to: number;
  dy: number;
}

const EDGE = 90; // px from the viewport edge where the page starts scrolling
const SCROLL_SPEED = 14;

/**
 * Vertical list with drag and drop reordering. Items are dragged by a handle (pointer events,
 * so touch and mouse work); the page scrolls when dragging near its edge. `onReorder` gets
 * the old and the new index.
 */
export default function SortableList({
  ids,
  onReorder,
  render,
}: {
  ids: string[];
  onReorder: (from: number, to: number) => void;
  render: (id: string, index: number, handle: DragHandleProps) => ReactNode;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const geo = useRef<{ top: number; height: number }[]>([]);
  const start = useRef({ y: 0, scroll: 0 });
  const pointerY = useRef(0);
  const raf = useRef(0);
  const active = useRef<Drag | null>(null);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    active.current = null;
  };
  useEffect(() => stop, []);

  /** Recomputes offset and target slot from the pointer position and the page scroll. */
  function update() {
    const d = active.current;
    if (!d) return;
    const g = geo.current;
    const dy = pointerY.current - start.current.y + (window.scrollY - start.current.scroll);
    const center = g[d.from].top + g[d.from].height / 2 + dy;
    let to = 0;
    g.forEach((r, i) => {
      if (i !== d.from && r.top + r.height / 2 < center) to++;
    });
    active.current = { from: d.from, to, dy };
    setDrag(active.current);
  }

  function loop() {
    if (!active.current) return;
    const y = pointerY.current;
    if (y < EDGE) window.scrollBy(0, -SCROLL_SPEED);
    else if (y > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_SPEED);
    update();
    raf.current = requestAnimationFrame(loop);
  }

  const handleFor = (index: number): DragHandleProps => ({
    style: { touchAction: 'none' },
    onPointerDown: (e) => {
      if (e.button !== 0 || active.current) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      geo.current = ids.map((i) => {
        const r = els.current.get(i)!.getBoundingClientRect();
        return { top: r.top + window.scrollY, height: r.height };
      });
      start.current = { y: e.clientY, scroll: window.scrollY };
      pointerY.current = e.clientY;
      active.current = { from: index, to: index, dy: 0 };
      setDrag(active.current);
      navigator.vibrate?.(10);
      raf.current = requestAnimationFrame(loop);
    },
    onPointerMove: (e) => {
      if (!active.current) return;
      pointerY.current = e.clientY;
      update();
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
  });

  function finish(commit: boolean) {
    const d = active.current;
    stop();
    setDrag(null);
    if (commit && d && d.to !== d.from) onReorder(d.from, d.to);
  }

  // Distance a neighbour moves to make room: height of the dragged item plus the gap.
  const g = geo.current;
  const shift = (() => {
    if (!drag || g.length < 2) return 0;
    const f = drag.from;
    const gap = f < g.length - 1 ? g[f + 1].top - (g[f].top + g[f].height) : g[f].top - (g[f - 1].top + g[f - 1].height);
    return g[f].height + gap;
  })();

  return (
    <>
      {ids.map((id, i) => {
        let style: CSSProperties | undefined;
        if (drag) {
          if (i === drag.from) {
            style = { transform: `translateY(${drag.dy}px)`, zIndex: 30, position: 'relative', boxShadow: '0 8px 24px rgba(0,0,0,.45)' };
          } else if (drag.from < drag.to && i > drag.from && i <= drag.to) {
            style = { transform: `translateY(${-shift}px)`, transition: 'transform 150ms' };
          } else if (drag.from > drag.to && i >= drag.to && i < drag.from) {
            style = { transform: `translateY(${shift}px)`, transition: 'transform 150ms' };
          } else {
            style = { transition: 'transform 150ms' };
          }
        }
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) els.current.set(id, el);
              else els.current.delete(id);
            }}
            style={style}
            className="rounded-xl"
          >
            {render(id, i, handleFor(i))}
          </div>
        );
      })}
    </>
  );
}

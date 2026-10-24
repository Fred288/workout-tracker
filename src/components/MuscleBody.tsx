import type { MuscleId } from '../lib/muscleMap';
import { BACK, BODY_HALF, FRONT, HEAD } from './muscleShapes';

const MIRROR = 'matrix(-1 0 0 1 200 0)';

function View({
  label,
  shapes,
  primary,
  secondary,
}: {
  label: string;
  shapes: Partial<Record<MuscleId, string[]>>;
  primary: Set<string>;
  secondary: Set<string>;
}) {
  const fill = (m: string) =>
    primary.has(m)
      ? 'var(--color-accent)'
      : secondary.has(m)
        ? 'color-mix(in srgb, var(--color-accent) 50%, #6b7280)'
        : 'var(--color-muscle)';

  const paths = Object.entries(shapes).flatMap(([muscle, ds]) =>
    ds!.flatMap((d, i) => [
      <path key={`${muscle}-${i}`} d={d} fill={fill(muscle)} />,
      <path key={`${muscle}-${i}-m`} d={d} fill={fill(muscle)} transform={MIRROR} />,
    ]),
  );

  return (
    <figure className="flex flex-1 flex-col items-center">
      <svg viewBox="0 0 200 400" className="h-72 w-auto" role="img" aria-label={label}>
        <circle {...HEAD} fill="var(--color-body)" />
        <path d={BODY_HALF} fill="var(--color-body)" />
        <path d={BODY_HALF} fill="var(--color-body)" transform={MIRROR} />
        <g stroke="var(--color-bg)" strokeWidth="1.2" strokeLinejoin="round">
          {paths}
        </g>
      </svg>
      <figcaption className="text-xs text-neutral-500">{label}</figcaption>
    </figure>
  );
}

export default function MuscleBody({
  primary,
  secondary,
}: {
  primary: string[];
  secondary: string[];
}) {
  const p = new Set(primary);
  const s = new Set(secondary.filter((m) => !p.has(m)));
  return (
    <div className="flex gap-2">
      <View label="Vorne" shapes={FRONT} primary={p} secondary={s} />
      <View label="Hinten" shapes={BACK} primary={p} secondary={s} />
    </div>
  );
}

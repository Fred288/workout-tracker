import type { Exercise } from '../db/types';
import { exerciseVisual } from '../lib/images';

/** Shows the start frame with the end frame cross-fading on top, which reads as a simple animation. */
export default function ExerciseAnimation({
  exercise,
  alt,
}: {
  exercise: Pick<Exercise, 'images' | 'illustrations'>;
  alt: string;
}) {
  const { frames, kind } = exerciseVisual(exercise);
  if (!frames.length) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-surface text-sm text-neutral-500">
        Kein Bild
      </div>
    );
  }
  const img = `absolute inset-0 h-full w-full object-contain ${kind === 'illustration' ? 'p-3' : ''}`;
  return (
    <div
      className={`relative aspect-[4/3] overflow-hidden rounded-xl ${
        kind === 'illustration' ? 'border border-border bg-surface' : 'bg-white'
      }`}
    >
      <img
        src={frames[0]}
        alt={alt}
        className={`${img} ${kind === 'illustration' && frames[1] ? 'frame-fade-out' : ''}`}
      />
      {frames[1] && <img src={frames[1]} alt="" aria-hidden className={`frame-fade ${img}`} />}
    </div>
  );
}

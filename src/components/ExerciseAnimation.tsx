import { exerciseImageUrl } from '../lib/images';

/** Shows the start frame with the end frame cross-fading on top, which reads as a simple animation. */
export default function ExerciseAnimation({ images, alt }: { images: string[]; alt: string }) {
  if (!images.length) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-surface text-sm text-neutral-500">
        Kein Bild
      </div>
    );
  }
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-white">
      <img src={exerciseImageUrl(images[0])} alt={alt} className="absolute inset-0 h-full w-full object-contain" />
      {images[1] && (
        <img
          src={exerciseImageUrl(images[1])}
          alt=""
          aria-hidden
          className="frame-fade absolute inset-0 h-full w-full object-contain"
        />
      )}
    </div>
  );
}

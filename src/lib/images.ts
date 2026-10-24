/** Resolves an exercise image: seed images are paths below BASE_URL/exercises/, custom images are data URLs. */
export function exerciseImageUrl(path: string): string {
  if (path.startsWith('data:')) return path;
  return `${import.meta.env.BASE_URL}exercises/${path}`;
}

export interface ExerciseVisual {
  frames: string[]; // resolved URLs, start then end
  kind: 'illustration' | 'photo';
}

/** Line drawings win over photos; custom and unmapped exercises fall back to their photos. */
export function exerciseVisual(e: { images: string[]; illustrations?: string[] }): ExerciseVisual {
  if (e.illustrations?.length) {
    return {
      kind: 'illustration',
      frames: e.illustrations.map((p) => `${import.meta.env.BASE_URL}${p}`),
    };
  }
  return { kind: 'photo', frames: e.images.map(exerciseImageUrl) };
}

/** Downscales a picked image to a JPEG data URL so it can live in IndexedDB and in backups. */
export async function fileToDataUrl(file: File, maxSize = 600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

import { db } from '../db/dexie';

// The service worker caches exercise images when they are first viewed (CacheFirst, cache
// "exercise-images", see vite.config.ts). This lets the user fetch all of them up front, so
// the whole library also works offline at the gym.

export const IMAGE_CACHE = 'exercise-images';

/** Absolute URLs of every photo and drawing of the exercise library. */
export async function allImageUrls(): Promise<string[]> {
  const base = import.meta.env.BASE_URL;
  const urls = new Set<string>();
  await db.exercises.each((e) => {
    for (const p of e.images) if (!p.startsWith('data:')) urls.add(`${base}exercises/${p}`);
    for (const p of e.illustrations ?? []) urls.add(`${base}${p}`);
  });
  return [...urls].map((u) => new URL(u, location.origin).href);
}

export const cacheSupported = () => typeof caches !== 'undefined';

export async function countCached(urls: string[]): Promise<number> {
  if (!cacheSupported()) return 0;
  const cache = await caches.open(IMAGE_CACHE);
  const hits = await Promise.all(urls.map((u) => cache.match(u).then((r) => !!r)));
  return hits.filter(Boolean).length;
}

/** Downloads what is missing. Returns how many images are cached afterwards; stops quietly when offline. */
export async function cacheAllImages(urls: string[], onProgress: (done: number) => void): Promise<number> {
  const cache = await caches.open(IMAGE_CACHE);
  let done = 0;
  let cached = 0;
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        if (await cache.match(url)) cached++;
        else {
          const res = await fetch(url);
          if (res.ok) {
            await cache.put(url, res);
            cached++;
          }
        }
      } catch {
        // offline or failed: counted as missing, the user can retry
      }
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return cached;
}

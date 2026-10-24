import { useEffect, useState } from 'react';
import { allImageUrls, cacheAllImages, cacheSupported, countCached } from '../lib/offline';

type Status = { total: number; cached: number } | null;

/** Settings block: shows how many exercise images work offline and fetches the rest. */
export default function OfflineSection() {
  const [status, setStatus] = useState<Status>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    const urls = await allImageUrls();
    setStatus({ total: urls.length, cached: await countCached(urls) });
  };
  useEffect(() => {
    if (cacheSupported()) void refresh();
  }, []);

  if (!cacheSupported()) return null;

  async function download() {
    setMessage(null);
    const urls = await allImageUrls();
    setProgress(0);
    const cached = await cacheAllImages(urls, setProgress);
    setProgress(null);
    setStatus({ total: urls.length, cached });
    setMessage(
      cached === urls.length
        ? 'Fertig: Alle Übungsbilder sind offline verfügbar.'
        : `${urls.length - cached} Bilder konnten nicht geladen werden (Verbindung?). Du kannst es erneut versuchen.`,
    );
  }

  const complete = status && status.cached >= status.total;
  return (
    <section className="mt-8 max-w-xl space-y-2" aria-labelledby="offline-h">
      <h2 id="offline-h" className="text-sm font-semibold uppercase text-neutral-400">
        Offline-Nutzung
      </h2>
      <p className="text-sm text-neutral-400">
        Die App selbst läuft nach dem ersten Laden ohne Netz. Übungsbilder werden gespeichert, sobald du sie ansiehst. Mit
        dem Knopf lädst du alle auf einmal (ca. 28 MB), sinnvoll vor dem Training im Studio mit schlechtem Empfang.
      </p>
      {status && (
        <p className="text-sm text-neutral-300">
          {status.cached} von {status.total} Bildern offline gespeichert.
        </p>
      )}
      <button
        className="min-h-11 rounded-lg border border-border bg-surface px-4 text-left disabled:opacity-60"
        disabled={progress !== null || !!complete}
        onClick={() => void download()}
      >
        {progress !== null
          ? `Lade … ${progress} von ${status?.total ?? ''}`
          : complete
            ? 'Alle Bilder gespeichert ✓'
            : 'Alle Übungsbilder offline speichern'}
      </button>
      {message && (
        <p role="status" className="text-sm text-accent">
          {message}
        </p>
      )}
    </section>
  );
}

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import PageTitle from '../components/PageTitle';
import OfflineSection from '../components/OfflineSection';
import { db } from '../db/dexie';
import { LAST_BACKUP_KEY, exportBackup, readBackupFile, restoreBackup, type RestoreMode } from '../db/backup';

export default function Settings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [message, setMessage] = useState<string | null>(null);
  const lastBackup = useLiveQuery(() => db.meta.get(LAST_BACKUP_KEY));

  async function onExport() {
    setMessage(null);
    if (await exportBackup()) setMessage('Export erstellt.');
  }

  async function onRestore(file: File) {
    try {
      const b = await readBackupFile(file);
      const from = new Date(b.exportedAt).toLocaleString('de-DE');
      const text =
        mode === 'replace'
          ? `Alle Daten auf diesem Gerät werden durch den Export vom ${from} ersetzt (${b.data.workouts.length} Workouts). Fortfahren?`
          : `Fehlende Daten aus dem Export vom ${from} werden ergänzt. Vorhandenes bleibt unverändert. Fortfahren?`;
      if (!confirm(text)) return;
      const r = await restoreBackup(file, mode);
      setMessage(
        `Import fertig: ${r.workouts} Workouts, ${r.templates} Vorlagen, ${r.measurements} Gewichtseinträge, ${r.customExercises} eigene Übungen ${mode === 'merge' ? 'ergänzt' : 'übernommen'}.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import fehlgeschlagen.');
    }
  }

  const btn = 'min-h-11 rounded-lg border border-border bg-surface px-4 text-left';
  const modeBtn = (m: RestoreMode) =>
    `min-h-10 flex-1 rounded-md text-sm ${mode === m ? 'bg-border font-semibold' : 'text-neutral-400'}`;

  return (
    <>
      <Link to="/profile" className="mt-4 inline-block text-sm text-accent">
        ← Profil
      </Link>
      <PageTitle>Einstellungen</PageTitle>

      <section className="max-w-xl space-y-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-400">Daten exportieren und importieren</h2>
        <p className="text-sm text-neutral-400">
          Deine Daten liegen nur auf diesem Gerät. Der Export enthält alles Persönliche: Workouts, Vorlagen, eigene Übungen,
          Gewicht und Profil. So hast du ein Backup und kannst den Stand auf ein anderes Gerät übertragen.
        </p>
        <p className="text-sm text-neutral-400">
          Letzter Export: {lastBackup ? new Date(Number(lastBackup.value)).toLocaleString('de-DE') : 'noch nie'}
        </p>
        <button className={btn} onClick={() => void onExport()}>
          Alle Daten exportieren
        </button>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <div role="radiogroup" aria-label="Import-Art" className="flex gap-1 rounded-lg bg-surface p-1">
            <button role="radio" aria-checked={mode === 'merge'} className={modeBtn('merge')} onClick={() => setMode('merge')}>
              Zusammenführen
            </button>
            <button role="radio" aria-checked={mode === 'replace'} className={modeBtn('replace')} onClick={() => setMode('replace')}>
              Ersetzen
            </button>
          </div>
          <p className="text-xs text-neutral-500">
            {mode === 'merge'
              ? 'Ergänzt, was hier fehlt, z. B. Workouts vom anderen Gerät. Einträge, die es auf beiden Geräten gibt, bleiben wie hier.'
              : 'Dieses Gerät übernimmt genau den Stand des Exports. Was nur hier gespeichert ist, geht verloren.'}{' '}
            Ein laufendes Workout bleibt immer erhalten.
          </p>
          <button className={`${btn} w-full`} onClick={() => fileRef.current?.click()}>
            Datei importieren …
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onRestore(f);
            }}
          />
        </div>
        {message && (
          <p role="status" className="text-sm text-accent">
            {message}
          </p>
        )}
        <details className="text-sm text-neutral-400">
          <summary className="min-h-11 cursor-pointer py-2 text-neutral-300">Stand zwischen zwei Geräten abgleichen</summary>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Auf Gerät A „Alle Daten exportieren“, z. B. per AirDrop oder „In Dateien sichern“.</li>
            <li>Auf Gerät B mit „Zusammenführen“ importieren.</li>
            <li>Hast du auf beiden Geräten trainiert: danach auf B exportieren und auf A ebenfalls zusammenführen.</li>
          </ol>
          <p className="mt-1">
            Änderungen an einem Workout, das es schon auf beiden Geräten gibt, überträgt nur „Ersetzen“.
          </p>
        </details>
      </section>

      <OfflineSection />

      <section className="mt-8 space-y-2 text-sm text-neutral-400">
        <h2 className="text-sm font-semibold uppercase">Quellen</h2>
        <p>
          Übungsdaten und Fotos:{' '}
          <a className="text-accent" href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noreferrer">
            free-exercise-db
          </a>{' '}
          (Unlicense)
        </p>
        <p>
          Zeichnungen:{' '}
          <a className="text-accent" href="https://github.com/everkinetic/data" target="_blank" rel="noreferrer">
            Everkinetic
          </a>
          ,{' '}
          <a
            className="text-accent"
            href="https://creativecommons.org/licenses/by-sa/4.0/deed.de"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-SA 4.0
          </a>
          , für den Dark Mode umgefärbt
        </p>
        <p>
          App-Icon: 💪 von{' '}
          <a className="text-accent" href="https://github.com/jdecked/twemoji" target="_blank" rel="noreferrer">
            Twemoji
          </a>
          ,{' '}
          <a
            className="text-accent"
            href="https://creativecommons.org/licenses/by/4.0/deed.de"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
        </p>
      </section>

      <p className="mt-8 text-sm text-neutral-500">
        Version {__APP_VERSION__} ({__APP_BUILD__})
      </p>
    </>
  );
}

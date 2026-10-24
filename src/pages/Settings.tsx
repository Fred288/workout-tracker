import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import PageTitle from '../components/PageTitle';
import { db } from '../db/dexie';
import { LAST_BACKUP_KEY, downloadBackup, restoreBackup } from '../db/backup';

export default function Settings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const lastBackup = useLiveQuery(() => db.meta.get(LAST_BACKUP_KEY));

  async function onRestore(file: File) {
    if (!confirm('Alle aktuellen Daten werden durch das Backup ersetzt. Fortfahren?')) return;
    try {
      await restoreBackup(file);
      setMessage('Backup wiederhergestellt.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Wiederherstellung fehlgeschlagen.');
    }
  }

  const btn = 'min-h-11 rounded-lg border border-border bg-surface px-4 text-left';

  return (
    <>
      <Link to="/profile" className="mt-4 inline-block text-sm text-accent">
        ← Profil
      </Link>
      <PageTitle>Einstellungen</PageTitle>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-400">Backup</h2>
        <p className="text-sm text-neutral-400">
          Letztes Backup:{' '}
          {lastBackup ? new Date(Number(lastBackup.value)).toLocaleString('de-DE') : 'noch nie'}
        </p>
        <div className="flex flex-col gap-2">
          <button className={btn} onClick={() => void downloadBackup()}>
            Backup exportieren (JSON)
          </button>
          <button className={btn} onClick={() => fileRef.current?.click()}>
            Backup importieren
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
        {message && <p className="text-sm text-accent">{message}</p>}
      </section>

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

      <p className="mt-8 text-sm text-neutral-500">Version {__APP_VERSION__}</p>
    </>
  );
}

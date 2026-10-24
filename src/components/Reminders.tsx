import { useLiveQuery } from 'dexie-react-hooks';
import { exportBackup, LAST_BACKUP_KEY } from '../db/backup';
import { db } from '../db/dexie';
import { backupReminder, shouldShowInstallHint, snoozeUntil } from '../lib/reminders';

const INSTALL_DISMISSED_KEY = 'installHintDismissed';
const SNOOZED_KEY = 'backupSnoozedUntil';

const box = 'mb-4 rounded-xl border p-4 text-sm';
const btn = 'min-h-11 rounded-lg px-4 font-medium';

/** Hint cards above the workout start screen: install the app (iOS Safari) and back up the data. */
export default function Reminders() {
  const data = useLiveQuery(async () => {
    const [workouts, last, snoozed, dismissed] = await Promise.all([
      db.workouts.filter((w) => !!w.finishedAt).toArray(),
      db.meta.get(LAST_BACKUP_KEY),
      db.meta.get(SNOOZED_KEY),
      db.meta.get(INSTALL_DISMISSED_KEY),
    ]);
    return {
      backup: backupReminder(
        workouts,
        last ? Number(last.value) : undefined,
        snoozed ? Number(snoozed.value) : undefined,
        Date.now(),
      ),
      installDismissed: !!dismissed,
    };
  }, []);
  if (!data) return null;

  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const showInstall =
    !data.installDismissed &&
    shouldShowInstallHint({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, standalone });

  return (
    <>
      {showInstall && (
        <section className={`${box} border-accent/40 bg-accent/10`} aria-label="App installieren">
          <h2 className="mb-1 font-semibold">App auf dem Home-Bildschirm installieren</h2>
          <p className="text-neutral-300">
            Tippe unten in Safari auf <strong>Teilen</strong> (Quadrat mit Pfeil) und dann auf{' '}
            <strong>„Zum Home-Bildschirm“</strong>. Danach startet die App im Vollbild und funktioniert auch ohne Netz.
          </p>
          <p className="mt-2 text-neutral-400">
            Die installierte App hat einen eigenen Speicher. Hast du hier in Safari schon Daten, exportiere sie vorher
            (Profil → Einstellungen) und importiere sie in der installierten App.
          </p>
          <button
            className={`${btn} mt-2 bg-border`}
            onClick={() => void db.meta.put({ key: INSTALL_DISMISSED_KEY, value: '1' })}
          >
            Verstanden
          </button>
        </section>
      )}
      {data.backup && (
        <section className={`${box} border-amber-400/30 bg-amber-400/10`} aria-label="Backup-Erinnerung">
          <h2 className="mb-1 font-semibold">Zeit für ein Backup</h2>
          <p className="text-neutral-300">
            {data.backup.newWorkouts} {data.backup.newWorkouts === 1 ? 'Workout ist' : 'Workouts sind'} noch in keinem
            Export.{' '}
            {data.backup.daysSinceExport === undefined
              ? 'Du hast noch nie exportiert.'
              : `Der letzte Export ist ${data.backup.daysSinceExport} Tage her.`}{' '}
            Deine Daten liegen nur auf diesem Gerät.
          </p>
          <div className="mt-2 flex gap-2">
            <button className={`${btn} bg-accent text-white`} onClick={() => void exportBackup()}>
              Jetzt exportieren
            </button>
            <button
              className={`${btn} bg-border`}
              onClick={() => void db.meta.put({ key: SNOOZED_KEY, value: String(snoozeUntil(Date.now())) })}
            >
              Später
            </button>
          </div>
        </section>
      )}
    </>
  );
}

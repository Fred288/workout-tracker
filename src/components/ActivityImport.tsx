import { useRef, useState } from 'react';
import { importActivityWorkouts } from '../db/activityImport';
import { useProfile } from '../db/profile';
import type { PlannedSession } from '../db/types';
import { ActivityFileError, parseActivityFile, type ParsedActivity } from '../lib/activityFiles';
import { SPORT_NAME, activityToWorkout, isImportable, matchingSessions, suggestUseLaps } from '../lib/activityImport';
import { formatClock } from '../lib/format';
import { formatNumber } from '../lib/units';
import { hrZones } from '../lib/zones';

interface Entry {
  key: string;
  fileName: string;
  activity?: ParsedActivity;
  error?: string;
  include: boolean;
  useLaps: boolean;
  sessionId: string;
}

const SPORT_LABEL = { run: 'Lauf', bike: 'Radfahren', swim: 'Schwimmen', other: 'Andere Sportart' } as const;

/** Imports activities from GPX, TCX and FIT files (watch or app export). Nothing leaves the device. */
export default function ActivityImport({ sessions, done }: { sessions: PlannedSession[]; done: Map<string, string> }) {
  const profile = useProfile();
  const input = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function pick(files: File[]) {
    setMessage('');
    const next: Entry[] = [];
    for (const file of files) {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      try {
        const activity = await parseActivityFile(file);
        const options = matchingSessions(activity, sessions, done);
        next.push({
          key,
          fileName: file.name,
          activity,
          include: isImportable(activity),
          useLaps: suggestUseLaps(activity),
          sessionId: options.length === 1 ? options[0].id : '',
        });
      } catch (e) {
        next.push({ key, fileName: file.name, error: e instanceof ActivityFileError ? e.message : 'Die Datei konnte nicht gelesen werden.', include: false, useLaps: false, sessionId: '' });
      }
    }
    setEntries(next);
  }

  const update = (key: string, patch: Partial<Entry>) => setEntries((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const chosen = entries.filter((e) => e.include && e.activity && isImportable(e.activity));

  async function run() {
    if (!profile) return;
    setBusy(true);
    try {
      const zones = hrZones(profile);
      const workouts = chosen.map((e) => {
        const a = e.activity as ParsedActivity & { sport: 'run' | 'bike' | 'swim' };
        const linked = sessions.find((s) => s.id === e.sessionId);
        return activityToWorkout(a, { useLaps: e.useLaps, hrZones: zones, plannedSessionId: e.sessionId || undefined, name: linked?.title });
      });
      const r = await importActivityWorkouts(workouts);
      setMessage(`${r.added} importiert${r.duplicates ? `, ${r.duplicates} schon vorhanden` : ''}.`);
      setEntries([]);
      if (input.current) input.current.value = '';
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Aktivität aus Datei importieren</h2>
      <p className="mt-1 text-xs text-neutral-500">
        GPX, TCX oder FIT aus Garmin Connect, Strava oder der Uhr. Die Datei wird nur auf dem Gerät gelesen. Läufe und Radfahrten werden
        mit Zeit, Distanz und Puls als Workout angelegt, ein erneuter Import erzeugt keine Doppelten.
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept=".gpx,.tcx,.fit"
        className="sr-only"
        id="activity-files"
        onChange={(e) => void pick([...(e.target.files ?? [])])}
      />
      <label htmlFor="activity-files" className="mt-3 flex min-h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-border font-medium md:w-auto md:px-6">
        Dateien wählen
      </label>
      {message && (
        <p role="status" className="mt-3 text-sm text-accent">
          {message}
        </p>
      )}

      {entries.length > 0 && (
        <div className="mt-4 space-y-3">
          {entries.map((e) => (
            <EntryCard key={e.key} entry={e} sessions={sessions} done={done} onChange={(p) => update(e.key, p)} />
          ))}
          <button
            className="min-h-12 w-full rounded-lg bg-accent font-semibold text-white disabled:opacity-50"
            disabled={busy || chosen.length === 0}
            onClick={() => void run()}
          >
            {chosen.length === 1 ? '1 Aktivität importieren' : `${chosen.length} Aktivitäten importieren`}
          </button>
        </div>
      )}
    </section>
  );
}

function EntryCard({ entry: e, sessions, done, onChange }: { entry: Entry; sessions: PlannedSession[]; done: Map<string, string>; onChange: (p: Partial<Entry>) => void }) {
  const a = e.activity;
  if (!a) {
    return (
      <div className="rounded-lg bg-bg p-3 text-sm">
        <div className="truncate font-medium">{e.fileName}</div>
        <p className="mt-1 text-red-400">{e.error}</p>
      </div>
    );
  }
  const ok = isImportable(a);
  const options = matchingSessions(a, sessions, done);
  const when = new Date(a.startedAt).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rounded-lg bg-bg p-3 text-sm">
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={e.include} disabled={!ok} onChange={(ev) => onChange({ include: ev.target.checked })} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{a.name ?? e.fileName}</span>
          <span className="block text-neutral-400">
            {SPORT_LABEL[a.sport]}
            {a.sportGuessed ? ' (geschätzt)' : ''} · {when}
          </span>
          <span className="block tabular-nums text-neutral-300">
            {a.distanceM > 0 ? (a.sport === 'swim' ? `${Math.round(a.distanceM)} m · ` : `${formatNumber(Math.round(a.distanceM / 10) / 100)} km · `) : ''}
            {formatClock(a.durationSec)}
            {a.avgHr ? ` · Ø ${a.avgHr} bpm` : ''}
            {a.avgPowerW ? ` · Ø ${a.avgPowerW} W` : ''}
          </span>
        </span>
      </label>
      {!ok && <p className="mt-1 text-amber-300">Nur Laufen, Radfahren und Schwimmen werden importiert.</p>}
      {ok && a.laps.length > 1 && (
        <label className="mt-1 flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={e.useLaps} onChange={(ev) => onChange({ useLaps: ev.target.checked })} />
          <span>{a.laps.length} Runden als einzelne Sätze</span>
        </label>
      )}
      {ok && options.length > 0 && (
        <label className="mt-1 block text-neutral-400">
          Mit Plan verknüpfen
          <select className="mt-1 min-h-11 w-full rounded-lg bg-border px-3 text-base text-neutral-100" value={e.sessionId} onChange={(ev) => onChange({ sessionId: ev.target.value })}>
            <option value="">Nicht verknüpfen</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title ?? SPORT_NAME[a.sport as 'run' | 'bike' | 'swim']}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

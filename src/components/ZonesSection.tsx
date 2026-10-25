import { useEffect, useState } from 'react';
import { saveProfile, useProfile } from '../db/profile';
import type { Profile, Zone } from '../db/types';
import { formatClock, parseClock } from '../lib/format';
import { parseNumber } from '../lib/units';
import { RACE_DISTANCES, hrZones, powerZones, predictRaces, profilePaceZones, type PaceRange } from '../lib/zones';

const ZONE_NAME: Record<Zone, string> = { 1: 'Erholung', 2: 'Locker', 3: 'Stetig', 4: 'Schwelle', 5: 'Intervall' };
const input = 'min-h-11 w-full rounded-lg bg-border px-3 text-base text-neutral-100 placeholder:text-neutral-600';

export const paceRangeText = (r: PaceRange) => `${formatClock(r.fast)}–${formatClock(r.slow)} /km`;

/** Commits on blur; keeps what is typed and re-syncs when the stored value changes. */
function NumberField({ label, value, unit, onCommit }: { label: string; value?: number; unit: string; onCommit: (n: number | undefined) => void }) {
  const [text, setText] = useState(value?.toString() ?? '');
  useEffect(() => setText(value?.toString() ?? ''), [value]);
  return (
    <label className="block text-sm text-neutral-400">
      {label}
      <div className="mt-1 flex items-center gap-2">
        <input
          inputMode="numeric"
          className={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = parseNumber(text);
            onCommit(text.trim() === '' || n === undefined || n <= 0 ? undefined : Math.round(n));
          }}
        />
        <span className="w-10 shrink-0 text-neutral-500">{unit}</span>
      </div>
    </label>
  );
}

export default function ZonesSection() {
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  if (!profile) return null;
  const save = (patch: Partial<Omit<Profile, 'id'>>) => void saveProfile(patch);

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-4">
      <button className="flex min-h-11 w-full items-center justify-between text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="text-lg font-semibold">Zonen und Tempo</span>
        <span className="text-neutral-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && <Content profile={profile} save={save} />}
    </section>
  );
}

function Content({ profile, save }: { profile: Profile; save: (patch: Partial<Omit<Profile, 'id'>>) => void }) {
  const ref = profile.referenceRun;
  const [dist, setDist] = useState(ref?.distanceM ?? 5000);
  const [time, setTime] = useState(ref ? formatClock(ref.timeSec) : '');
  useEffect(() => {
    if (ref) {
      setDist(ref.distanceM);
      setTime(formatClock(ref.timeSec));
    }
  }, [ref?.distanceM, ref?.timeSec]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitRef = (d: number, t: string) => {
    const sec = parseClock(t);
    if (!t.trim()) save({ referenceRun: undefined });
    else if (sec && (sec !== ref?.timeSec || d !== ref?.distanceM)) save({ referenceRun: { distanceM: d, timeSec: sec, setAt: Date.now() } });
  };

  const pace = profilePaceZones(profile);
  const hr = hrZones(profile);
  const power = powerZones(profile.ftpW);
  const predictions = ref && pace ? predictRaces(ref) : undefined;

  return (
    <div className="mt-3 space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="font-semibold">Referenzzeit</h3>
          <p className="text-xs text-neutral-500">Ein aktuelles Rennen oder ein Test über mindestens 3 km. Alle Tempovorgaben werden daraus berechnet.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm text-neutral-400">
              Distanz
              <select
                className={`${input} mt-1`}
                value={dist}
                onChange={(e) => {
                  const d = Number(e.target.value);
                  setDist(d);
                  commitRef(d, time);
                }}
              >
                {RACE_DISTANCES.map((r) => (
                  <option key={r.id} value={r.distanceM}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-neutral-400">
              Zeit (h:mm:ss)
              <input
                inputMode="text"
                className={`${input} mt-1`}
                placeholder="z. B. 25:00"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                onBlur={() => commitRef(dist, time)}
              />
            </label>
          </div>
          {time.trim() && parseClock(time) === undefined && <p className="text-sm text-amber-300">Bitte als m:ss oder h:mm:ss eingeben.</p>}
          {time.trim() && parseClock(time) !== undefined && !pace && <p className="text-sm text-amber-300">Diese Zeit ist für die Berechnung nicht plausibel.</p>}
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Puls und Leistung</h3>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Maximalpuls" unit="bpm" value={profile.maxHr} onCommit={(n) => save({ maxHr: n })} />
            <NumberField label="Ruhepuls" unit="bpm" value={profile.restingHr} onCommit={(n) => save({ restingHr: n })} />
            <NumberField label="Schwellenpuls" unit="bpm" value={profile.thresholdHr} onCommit={(n) => save({ thresholdHr: n })} />
            <NumberField label="FTP (Rad)" unit="W" value={profile.ftpW} onCommit={(n) => save({ ftpW: n })} />
          </div>
        </div>
      </div>

      {pace && (
        <div>
          <h3 className="mb-1 font-semibold">
            Lauftempo <span className="text-sm font-normal text-neutral-400">· VDOT {pace.vdot.toFixed(1).replace('.', ',')}</span>
          </h3>
          <ZoneTable
            rows={([1, 2, 3, 4, 5] as Zone[]).map((z) => ({ zone: z, text: paceRangeText(pace.zones[z]) }))}
          />
        </div>
      )}

      {hr && (
        <div>
          <h3 className="mb-1 font-semibold">
            Pulszonen{' '}
            <span className="text-sm font-normal text-neutral-400">
              · {hr.source === 'threshold' ? 'nach Schwellenpuls' : hr.source === 'reserve' ? 'nach Herzfrequenzreserve' : 'nach Maximalpuls'}
            </span>
          </h3>
          <ZoneTable rows={hr.zones.map((z) => ({ zone: z.zone, text: `${z.min}–${z.max} bpm` }))} />
        </div>
      )}

      {power && (
        <div>
          <h3 className="mb-1 font-semibold">Leistungszonen Rad</h3>
          <ZoneTable rows={power.map((z) => ({ zone: z.zone, text: z.max === undefined ? `über ${z.min} W` : `${z.min}–${z.max} W` }))} />
        </div>
      )}

      {predictions && (
        <div>
          <h3 className="mb-1 font-semibold">Zeitprognose (Schätzung)</h3>
          <ul className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            {predictions.map((p) => (
              <li key={p.id} className="rounded-lg bg-bg p-3">
                <div className="text-neutral-400">{p.label}</div>
                <div className="text-lg font-semibold tabular-nums">{formatClock(Math.round(p.timeSec))}</div>
                {p.uncertain && <div className="text-xs text-amber-300">weit von der Referenz, unsicher</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Alle Werte sind Schätzungen (Daniels/VDOT, Riegel, Friel, Coggan) und ersetzen keinen Leistungstest. Maximalpuls am besten
        aus einem harten Lauf messen, Faustformeln streuen stark.
      </p>
    </div>
  );
}

function ZoneTable({ rows }: { rows: { zone: Zone; text: string }[] }) {
  return (
    <table className="w-full max-w-xl text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.zone} className="border-b border-border last:border-0">
            <th scope="row" className="w-1/2 py-2 pr-2 text-left font-normal">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded bg-border text-xs font-semibold">{r.zone}</span>
              {ZONE_NAME[r.zone]}
            </th>
            <td className="py-2 text-right tabular-nums">{r.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

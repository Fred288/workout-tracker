import { useMemo, useState, type ReactNode } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { saveProfile, useProfile } from '../db/profile';
import type { Goal, Plan, PlannedSession, Zone } from '../db/types';
import {
  bestEffort,
  easyPaceTrend,
  goalCheck,
  longestRun,
  runSets,
  weeklyAdherence,
  weeklyRunVolume,
  zoneDistribution,
} from '../lib/endurance';
import { formatClock } from '../lib/format';
import { formatNumber } from '../lib/units';
import { GOAL_LABEL } from '../lib/plan';
import { predictRaces, vdot } from '../lib/zones';

const AXIS = { fill: '#8a8a95', fontSize: 11 };
const TOOLTIP = {
  contentStyle: { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, color: '#f2f2f5' },
  labelStyle: { color: '#8a8a95' },
};
const ACCENT = '#5b8fff';
const PLAN_LINE = '#8a8a95';
// One hue, dim to bright with the intensity; each zone is also named in the legend.
const ZONE_COLORS: Record<Zone, string> = { 1: '#2f4472', 2: '#3f62a8', 3: '#4f7fe0', 4: '#6f9bff', 5: '#a9c4ff' };
const ZONE_NAME: Record<Zone, string> = { 1: 'Erholung', 2: 'Locker', 3: 'Stetig', 4: 'Schwelle', 5: 'Intervall' };

const shortDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const hm = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
};

function Card({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-2 text-xs text-neutral-500">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({ value, options, label, onChange }: { value: T; options: { value: T; label: string }[]; label: string; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="mb-2 flex gap-1 rounded-lg bg-bg p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 flex-1 rounded-md ${value === o.value ? 'bg-border font-semibold' : 'text-neutral-400'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function EnduranceStats({
  goal,
  plan,
  sessions,
  done,
  today,
}: {
  goal?: Goal;
  plan?: Plan;
  sessions: PlannedSession[];
  done: Map<string, string>;
  today: string;
}) {
  const profile = useProfile();
  const data = useLiveQuery(async () => {
    const workouts = await db.workouts.filter((w) => !!w.finishedAt).toArray();
    const ids = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
    const list = await db.exercises.bulkGet(ids);
    return { workouts, exercises: new Map(list.filter((e) => !!e).map((e) => [e!.id, e!])) };
  }, []);
  const sets = useMemo(() => (data ? runSets(data.workouts, data.exercises) : []), [data]);

  if (!data || !profile) return null;
  if (sets.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-neutral-500">
        Noch keine Läufe im Verlauf. Sobald du Einheiten mit „Laufen“ beendest, erscheinen hier die Auswertungen.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <VolumeCard sets={sets} plan={plan} sessions={sessions} done={done} today={today} />
      {plan && <AdherenceCard plan={plan} sessions={sessions} done={done} today={today} />}
      <ZonesCard sets={sets} />
      <ProgressCard sets={sets} />
      <ForecastCard
        sets={sets}
        goal={goal}
        reference={profile.referenceRun}
        onAdopt={(r) => void saveProfile({ referenceRun: r })}
      />
    </div>
  );
}

function VolumeCard({ sets, plan, sessions, done, today }: { sets: ReturnType<typeof runSets>; plan?: Plan; sessions: PlannedSession[]; done: Map<string, string>; today: string }) {
  const [metric, setMetric] = useState<'time' | 'distance'>('time');
  const rows = useMemo(() => {
    const volume = weeklyRunVolume(sets, Date.now(), 12);
    const adherence = plan ? weeklyAdherence(plan.weeks, sessions, done, today) : [];
    return volume.map((v) => {
      const planned = adherence.find((a) => new Date(a.weekStart + 'T00:00').getTime() === v.weekStart)?.plannedSec;
      return {
        weekStart: v.weekStart,
        label: shortDate(v.weekStart),
        value: metric === 'time' ? Math.round(v.durationSec / 60) : Math.round(v.distanceM / 100) / 10,
        plan: metric === 'time' && planned ? Math.round(planned / 60) : undefined,
        runs: v.runs,
      };
    });
  }, [sets, plan, sessions, done, today, metric]);
  const unit = metric === 'time' ? 'min' : 'km';
  const hasPlan = rows.some((r) => r.plan !== undefined);

  return (
    <Card title="Wochenumfang" hint="Letzte 12 Wochen, Ist aus deinen Läufen.">
      <Segmented
        label="Größe"
        value={metric}
        onChange={setMetric}
        options={[
          { value: 'time', label: 'Zeit' },
          { value: 'distance', label: 'Distanz' },
        ]}
      />
      <div className="h-52" role="img" aria-label={`Wochenumfang in ${unit}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} />
            <Tooltip
              {...TOOLTIP}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              formatter={(v, name) => [`${formatNumber(Number(v))} ${unit}`, String(name)]}
              labelFormatter={(l) => `Woche ab ${l}`}
            />
            <Bar dataKey="value" name="Ist" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} />
            {hasPlan && <Line dataKey="plan" name="Plan" stroke={PLAN_LINE} strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[{ color: ACCENT, label: 'Ist' }, ...(hasPlan ? [{ color: PLAN_LINE, label: 'Plan', dashed: true }] : [])]} />
      <details className="mt-2 text-sm text-neutral-400">
        <summary className="min-h-11 cursor-pointer py-2">Zahlen als Tabelle</summary>
        <table className="w-full">
          <tbody>
            {rows.map((r) => (
              <tr key={r.weekStart} className="border-b border-border last:border-0">
                <td className="py-1">ab {r.label}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatNumber(r.value)} {unit}
                </td>
                <td className="py-1 text-right tabular-nums text-neutral-500">{r.runs} Läufe</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}

function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-300">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: i.dashed ? 'transparent' : i.color, borderTop: i.dashed ? `2px dashed ${i.color}` : undefined, height: i.dashed ? 0 : 8, borderRadius: 2, width: i.dashed ? 16 : 8 }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function AdherenceCard({ plan, sessions, done, today }: { plan: Plan; sessions: PlannedSession[]; done: Map<string, string>; today: string }) {
  const rows = useMemo(
    () =>
      weeklyAdherence(plan.weeks, sessions, done, today)
        .slice(-12)
        .map((w) => ({ label: shortDate(new Date(w.weekStart + 'T00:00').getTime()), pct: w.share === undefined ? undefined : Math.round(w.share * 100), done: w.done, planned: w.planned })),
    [plan, sessions, done, today],
  );
  const counted = rows.filter((r) => r.pct !== undefined);
  const total = counted.reduce((n, r) => n + r.planned, 0);
  const doneTotal = counted.reduce((n, r) => n + r.done, 0);

  return (
    <Card title="Plan-Erfüllung" hint="Erledigte Einheiten in Prozent der geplanten (ohne übersprungene).">
      {counted.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">Noch keine geplanten Einheiten in vergangenen Wochen.</p>
      ) : (
        <>
          <div className="mb-1 text-2xl font-bold tabular-nums">
            {total ? Math.round((doneTotal / total) * 100) : 0} %
            <span className="ml-2 text-sm font-normal text-neutral-400">
              {doneTotal} von {total} Einheiten
            </span>
          </div>
          <div className="h-44" role="img" aria-label="Plan-Erfüllung pro Woche in Prozent">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} domain={[0, 100]} ticks={[0, 50, 100]} unit=" %" />
                <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.05)' }} formatter={(v) => [`${v} %`, 'Erfüllt']} labelFormatter={(l) => `Woche ab ${l}`} />
                <Bar dataKey="pct" name="Erfüllt" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

function ZonesCard({ sets }: { sets: ReturnType<typeof runSets> }) {
  const [range, setRange] = useState<'4' | '12' | 'all'>('4');
  const dist = useMemo(() => {
    const weeks = range === 'all' ? 0 : Number(range);
    return zoneDistribution(sets, weeks ? Date.now() - weeks * 7 * 86_400_000 : 0);
  }, [sets, range]);
  const zones = [1, 2, 3, 4, 5] as Zone[];

  return (
    <Card title="Intensitätsverteilung" hint="Richtwert: etwa 80 % der Zeit locker (Zone 1–2), der Rest hart.">
      <Segmented
        label="Zeitraum"
        value={range}
        onChange={setRange}
        options={[
          { value: '4', label: '4 Wochen' },
          { value: '12', label: '12 Wochen' },
          { value: 'all', label: 'Alles' },
        ]}
      />
      {dist.knownSec === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">Keine Läufe mit Zone in diesem Zeitraum. Trage bei den Sätzen die Zone ein oder den Puls.</p>
      ) : (
        <>
          <div className="mb-1 text-2xl font-bold tabular-nums">
            {Math.round((dist.easyShare ?? 0) * 100)} %<span className="ml-2 text-sm font-normal text-neutral-400">locker (Zone 1–2)</span>
          </div>
          <div className="flex h-5 gap-0.5 overflow-hidden rounded" role="img" aria-label="Anteil der Zeit pro Zone">
            {zones.map((z) =>
              dist.seconds[z] ? <div key={z} title={`Zone ${z}`} style={{ width: `${(dist.seconds[z] / dist.knownSec) * 100}%`, background: ZONE_COLORS[z] }} /> : null,
            )}
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-1 text-sm">
            {zones.map((z) => (
              <li key={z} className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ZONE_COLORS[z] }} />
                <span className="flex-1">
                  Zone {z} · {ZONE_NAME[z]}
                </span>
                <span className="tabular-nums text-neutral-300">{hm(dist.seconds[z])}</span>
                <span className="w-12 text-right tabular-nums text-neutral-500">{Math.round((dist.seconds[z] / dist.knownSec) * 100)} %</span>
              </li>
            ))}
          </ul>
          {dist.unknownSec > 0 && <p className="mt-2 text-xs text-neutral-500">Ohne Zone und nicht eingerechnet: {hm(dist.unknownSec)}.</p>}
        </>
      )}
    </Card>
  );
}

function ProgressCard({ sets }: { sets: ReturnType<typeof runSets> }) {
  const trend = useMemo(() => easyPaceTrend(sets), [sets]);
  const longest = useMemo(() => longestRun(sets), [sets]);
  const best = useMemo(() => bestEffort(sets), [sets]);
  const data = trend.map((p) => ({ at: p.at, pace: Math.round(p.paceSecPerKm) }));

  return (
    <Card title="Fortschritt" hint="Lockere Pace (Zone 2) über die Zeit. Schneller bei gleicher Anstrengung heißt fitter.">
      {data.length < 2 ? (
        <p className="py-6 text-center text-sm text-neutral-500">Für den Verlauf werden mindestens zwei lockere Läufe (Zone 2, ab 2 km) gebraucht.</p>
      ) : (
        <div className="h-44" role="img" aria-label="Lockere Pace pro Lauf in Minuten pro Kilometer">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="at" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis reversed domain={['dataMin - 10', 'dataMax + 10']} tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatClock(v)} />
              <Tooltip {...TOOLTIP} formatter={(v) => [`${formatClock(Number(v))} /km`, 'Pace']} labelFormatter={(l) => shortDate(Number(l))} />
              <Line dataKey="pace" stroke={ACCENT} strokeWidth={2} dot={{ r: 4, fill: ACCENT, stroke: '#16161d', strokeWidth: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-bg p-3">
          <dt className="text-neutral-400">Längster Lauf</dt>
          <dd className="text-lg font-semibold tabular-nums">{longest ? `${formatNumber(Math.round(longest.distanceM / 10) / 100)} km` : '–'}</dd>
          {longest && <dd className="text-xs text-neutral-500">{shortDate(longest.startedAt)} · {hm(longest.durationSec)}</dd>}
        </div>
        <div className="rounded-lg bg-bg p-3">
          <dt className="text-neutral-400">Beste Leistung</dt>
          <dd className="text-lg font-semibold tabular-nums">{best ? `${formatNumber(best.distanceM / 1000)} km in ${formatClock(best.timeSec)}` : '–'}</dd>
          {best && <dd className="text-xs text-neutral-500">{shortDate(best.startedAt)} · VDOT {best.vdot.toFixed(1).replace('.', ',')}</dd>}
        </div>
      </dl>
    </Card>
  );
}

function ForecastCard({
  sets,
  goal,
  reference,
  onAdopt,
}: {
  sets: ReturnType<typeof runSets>;
  goal?: Goal;
  reference?: { distanceM: number; timeSec: number };
  onAdopt: (r: { distanceM: number; timeSec: number }) => void;
}) {
  const best = useMemo(() => bestEffort(sets), [sets]);
  const effective = reference ?? (best ? { distanceM: best.distanceM, timeSec: best.timeSec } : undefined);
  const check = goal && effective ? goalCheck(goal, effective) : undefined;
  const preds = effective ? predictRaces(effective) : [];
  // A better effort in the log than the saved reference is worth suggesting.
  const better = best && reference && best.vdot > (bestVdot(reference) ?? 0) + 0.5;

  return (
    <Card title={goal ? 'Rennprognose und Ziel-Check' : 'Rennprognose'} hint="Schätzung nach Riegel aus deiner Referenzzeit, weit entfernte Distanzen sind unsicher.">
      {!effective ? (
        <p className="py-4 text-sm text-neutral-500">Trage unter „Zonen und Tempo“ eine Referenzzeit ein oder laufe mindestens 3 km am Stück.</p>
      ) : (
        <>
          {!reference && best && (
            <p className="mb-2 text-xs text-neutral-500">
              Noch keine Referenzzeit gesetzt, genutzt wird deine beste Leistung ({formatNumber(best.distanceM / 1000)} km in {formatClock(best.timeSec)}).
            </p>
          )}
          {goal && check && (
            <div className="mb-3 rounded-lg bg-bg p-3 text-sm">
              <div className="text-neutral-400">{GOAL_LABEL[goal.type]}</div>
              <div className="text-2xl font-bold tabular-nums">{formatClock(Math.round(check.predictedSec))}</div>
              {check.targetSec !== undefined && check.diffSec !== undefined ? (
                <div className={check.status === 'behind' ? 'text-amber-300' : 'text-accent'}>
                  Ziel {formatClock(check.targetSec)} ·{' '}
                  {check.status === 'ahead'
                    ? `${formatClock(Math.abs(Math.round(check.diffSec)))} schneller als nötig`
                    : check.status === 'close'
                      ? `${formatClock(Math.round(check.diffSec))} dahinter, knapp`
                      : `${formatClock(Math.round(check.diffSec))} dahinter`}
                </div>
              ) : (
                <div className="text-neutral-500">Setze beim Ziel eine Zielzeit, dann siehst du den Abstand.</div>
              )}
              {check.uncertain && <div className="mt-1 text-xs text-amber-300">Die Referenzdistanz ist weit vom Ziel entfernt, die Prognose ist unsicher.</div>}
            </div>
          )}
          <ul className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            {preds.map((p) => (
              <li key={p.id} className="rounded-lg bg-bg p-3">
                <div className="text-neutral-400">{p.label}</div>
                <div className="font-semibold tabular-nums">{formatClock(Math.round(p.timeSec))}</div>
              </li>
            ))}
          </ul>
          {better && best && (
            <button
              className="mt-3 min-h-11 w-full rounded-lg bg-border text-sm font-medium"
              onClick={() => onAdopt({ distanceM: best.distanceM, timeSec: best.timeSec })}
            >
              Bessere Leistung als Referenz übernehmen ({formatNumber(best.distanceM / 1000)} km in {formatClock(best.timeSec)})
            </button>
          )}
        </>
      )}
    </Card>
  );
}

const bestVdot = (r: { distanceM: number; timeSec: number }) => vdot(r.distanceM, r.timeSec);

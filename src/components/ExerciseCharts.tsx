import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ExerciseType } from '../db/types';
import { formatClock } from '../lib/format';
import type { SeriesPoint } from '../lib/records';
import { formatNumber, kgToUnit, type WeightUnit } from '../lib/units';

type MetricKey = 'best1RM' | 'maxWeight' | 'volume' | 'maxReps' | 'maxDuration' | 'maxDistance';

interface Metric {
  key: MetricKey;
  title: string;
  format: (v: number) => string;
  convert: (v: number) => number; // stored value -> plotted value
}

function metricsFor(type: ExerciseType, unit: WeightUnit, series: SeriesPoint[]): Metric[] {
  const kg = (v: number) => kgToUnit(v, unit);
  const w = { convert: kg, format: (v: number) => `${formatNumber(v)} ${unit}` };
  const plain = { convert: (v: number) => v };
  const anyWeight = series.some((p) => p.maxWeight > 0);
  switch (type) {
    case 'weight_reps':
      return [
        { key: 'best1RM', title: 'Geschätztes 1RM', ...w },
        { key: 'maxWeight', title: 'Höchstes Gewicht', ...w },
        { key: 'volume', title: 'Volumen pro Einheit', ...w },
      ];
    case 'bodyweight_reps':
      return [
        { key: 'maxReps', title: 'Meiste Wiederholungen', ...plain, format: (v) => `${v} Wdh.` },
        ...(anyWeight ? [{ key: 'maxWeight' as const, title: 'Höchstes Zusatzgewicht', ...w }] : []),
      ];
    case 'assisted_bodyweight':
      return [{ key: 'maxReps', title: 'Meiste Wiederholungen', ...plain, format: (v) => `${v} Wdh.` }];
    case 'duration':
      return [{ key: 'maxDuration', title: 'Längste Dauer', ...plain, format: formatClock }];
    case 'distance_duration':
      return [
        { key: 'maxDistance', title: 'Längste Distanz', convert: (v) => v / 1000, format: (v) => `${formatNumber(v)} km` },
        { key: 'maxDuration', title: 'Längste Dauer', ...plain, format: formatClock },
      ];
  }
}

const RANGES = [
  { label: '1M', days: 31 },
  { label: '3M', days: 92 },
  { label: '6M', days: 183 },
  { label: '1J', days: 366 },
  { label: 'Alles', days: 0 },
];

const shortDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

/** One single-series line chart per metric (never two scales in one chart). */
export default function ExerciseCharts({
  series,
  type,
  unit,
}: {
  series: SeriesPoint[];
  type: ExerciseType;
  unit: WeightUnit;
}) {
  const [range, setRange] = useState('Alles');
  const visible = useMemo(() => {
    const days = RANGES.find((r) => r.label === range)?.days ?? 0;
    if (!days) return series;
    const from = Date.now() - days * 86_400_000;
    return series.filter((p) => p.date >= from);
  }, [series, range]);
  const metrics = metricsFor(type, unit, series);

  if (series.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-neutral-500">
        Diagramme erscheinen ab zwei Einheiten mit dieser Übung.
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <div role="radiogroup" aria-label="Zeitraum" className="flex gap-1 rounded-lg bg-surface p-1 text-sm">
        {RANGES.map((r) => (
          <button
            key={r.label}
            role="radio"
            aria-checked={range === r.label}
            onClick={() => setRange(r.label)}
            className={`min-h-10 flex-1 rounded-md ${range === r.label ? 'bg-border font-semibold' : 'text-neutral-400'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">Keine Einheiten in diesem Zeitraum.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {metrics.map((m) => {
            const data = visible.map((p) => ({ date: p.date, value: m.convert(p[m.key]) }));
            const last = data.at(-1)!.value;
            return (
              <figure key={m.key} className="rounded-xl border border-border bg-surface p-3">
                <figcaption className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-sm text-neutral-400">{m.title}</span>
                  <span className="font-semibold tabular-nums">{m.format(last)}</span>
                </figcaption>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="var(--color-border)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={shortDate}
                        tick={{ fill: '#8a8a95', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        width={44}
                        tick={{ fill: '#8a8a95', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => (m.key === 'maxDuration' ? formatClock(v) : formatNumber(v))}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        cursor={{ stroke: '#8a8a95', strokeDasharray: '3 3' }}
                        contentStyle={{ background: '#16161d', border: '1px solid #26262f', borderRadius: 8, color: '#f2f2f5' }}
                        labelStyle={{ color: '#8a8a95' }}
                        labelFormatter={(v) => shortDate(Number(v))}
                        formatter={(v) => [m.format(Number(v)), m.title]}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-accent)"
                        strokeWidth={2}
                        dot={{ r: 4, fill: 'var(--color-accent)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                        activeDot={{ r: 6, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}

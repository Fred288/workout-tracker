import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BodyMeasurement } from '../db/types';
import { dateKeyToMs, measurementsInRange, type WeekCount } from '../lib/profile';
import { formatNumber, kgToUnit, type WeightUnit } from '../lib/units';

const AXIS = { fill: '#8a8a95', fontSize: 11 };
const TOOLTIP = {
  contentStyle: { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, color: '#f2f2f5' },
  labelStyle: { color: '#8a8a95' },
};
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

const RANGES = [
  { label: '1M', days: 31 },
  { label: '3M', days: 92 },
  { label: '6M', days: 183 },
  { label: '1J', days: 366 },
  { label: 'Alles', days: 0 },
];

/** Weight over time as one line, with the target weight as a dashed reference line. */
export function WeightChart({
  measurements,
  targetKg,
  unit,
}: {
  measurements: BodyMeasurement[];
  targetKg?: number;
  unit: WeightUnit;
}) {
  const [range, setRange] = useState('3M');
  const data = useMemo(() => {
    const days = RANGES.find((r) => r.label === range)?.days ?? 0;
    return measurementsInRange(measurements, days, Date.now()).map((m) => ({
      date: dateKeyToMs(m.date),
      value: kgToUnit(m.weightKg, unit),
    }));
  }, [measurements, range, unit]);
  const target = targetKg !== undefined ? kgToUnit(targetKg, unit) : undefined;

  return (
    <div>
      <div role="radiogroup" aria-label="Zeitraum" className="mb-2 flex gap-1 rounded-lg bg-bg p-1 text-sm">
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
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">Keine Einträge in diesem Zeitraum.</p>
      ) : (
        <div className="h-52" role="img" aria-label="Gewichtsverlauf">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={shortDate}
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis
                width={44}
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatNumber(v)}
                domain={[
                  (min: number) => Math.floor(Math.min(min, target ?? min) - 1),
                  (max: number) => Math.ceil(Math.max(max, target ?? max) + 1),
                ]}
              />
              {target !== undefined && (
                <ReferenceLine
                  y={target}
                  stroke="#8a8a95"
                  strokeDasharray="5 4"
                  label={{ value: `Ziel ${formatNumber(target)} ${unit}`, fill: '#8a8a95', fontSize: 11, position: 'insideBottomRight' }}
                />
              )}
              <Tooltip
                {...TOOLTIP}
                cursor={{ stroke: '#8a8a95', strokeDasharray: '3 3' }}
                labelFormatter={(v) => shortDate(Number(v))}
                formatter={(v) => [`${formatNumber(Number(v))} ${unit}`, 'Gewicht']}
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
      )}
    </div>
  );
}

/** Workouts per week as bars, with the weekly goal as a dashed reference line. */
export function WeeklyChart({ weeks, goal }: { weeks: WeekCount[]; goal: number }) {
  const data = weeks.map((w) => ({ ...w, reached: goal > 0 && w.count >= goal }));
  const max = Math.max(goal, ...weeks.map((w) => w.count), 1);
  return (
    <div className="h-48" role="img" aria-label="Workouts pro Woche">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tickFormatter={shortDate}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis width={28} tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, max]} />
          {goal > 0 && (
            <ReferenceLine
              y={goal}
              stroke="#8a8a95"
              strokeDasharray="5 4"
              label={{ value: `Ziel ${goal}`, fill: '#8a8a95', fontSize: 11, position: 'insideTopRight' }}
            />
          )}
          <Tooltip
            {...TOOLTIP}
            cursor={{ fill: 'rgba(138,138,149,0.12)' }}
            labelFormatter={(v) => `Woche ab ${shortDate(Number(v))}`}
            formatter={(v) => [String(v), 'Workouts']}
          />
          <Bar dataKey="count" fill="var(--color-accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

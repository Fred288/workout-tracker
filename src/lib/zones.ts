import type { Profile, Zone } from '../db/types';

// Pace, heart rate and power zones. All of it is estimated from a few profile values and
// computed on demand, never stored (see CLAUDE.md). Formulas:
// - VDOT and training intensities: Daniels' oxygen cost / %VO2max model.
// - Race predictions: Riegel, t2 = t1 * (d2 / d1)^1.06, reliable roughly from half to 2.5 times
//   the reference distance.

export const RIEGEL_EXPONENT = 1.06;

export const RACE_DISTANCES = [
  { id: '5k', label: '5 km', distanceM: 5000 },
  { id: '10k', label: '10 km', distanceM: 10_000 },
  { id: 'half', label: 'Halbmarathon', distanceM: 21_097.5 },
  { id: 'marathon', label: 'Marathon', distanceM: 42_195 },
] as const;

export function riegel(timeSec: number, fromM: number, toM: number): number {
  return timeSec * Math.pow(toM / fromM, RIEGEL_EXPONENT);
}

/** Daniels' VDOT for a race or hard effort over at least a few minutes. */
export function vdot(distanceM: number, timeSec: number): number | undefined {
  if (!(distanceM > 0) || !(timeSec > 0)) return undefined;
  const t = timeSec / 60;
  const v = distanceM / t; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  const result = vo2 / pct;
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

/** Running speed (m/min) at which the oxygen cost equals `vo2`. */
function speedAtVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Seconds per km when running at `fraction` of VDOT. */
export function paceAtFraction(vdotValue: number, fraction: number): number {
  return (1000 / speedAtVo2(vdotValue * fraction)) * 60;
}

export interface PaceRange {
  /** Seconds per km; `slow` >= `fast`. */
  slow: number;
  fast: number;
}

/**
 * The five app zones as pace ranges. Z1 recovery/easy jog, Z2 easy, Z3 steady (marathon
 * feel), Z4 threshold, Z5 intervals (about 5 km pace and faster).
 */
/** Share of VDOT at the slow and fast end of each zone. */
export const ZONE_FRACTIONS: Record<Zone, [number, number]> = {
  1: [0.5, 0.62],
  2: [0.62, 0.74],
  3: [0.74, 0.84],
  4: [0.84, 0.92],
  5: [0.92, 1.0],
};

export function paceZones(vdotValue: number): Record<Zone, PaceRange> {
  const range = (z: Zone): PaceRange => ({
    slow: paceAtFraction(vdotValue, ZONE_FRACTIONS[z][0]),
    fast: paceAtFraction(vdotValue, ZONE_FRACTIONS[z][1]),
  });
  return { 1: range(1), 2: range(2), 3: range(3), 4: range(4), 5: range(5) };
}

/** Inverse of paceAtFraction: the VDOT at which `fraction` of it gives this pace. */
export function vdotForPace(paceSecPerKm: number, fraction: number): number {
  let lo = 10;
  let hi = 100;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (paceAtFraction(mid, fraction) > paceSecPerKm) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Time over `distanceM` that has the given VDOT (inverse of vdot()). */
export function timeForVdot(distanceM: number, target: number): number {
  let lo = distanceM / 10; // 10 m/s, faster than any human
  let hi = distanceM; // 1 m/s
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if ((vdot(distanceM, mid) ?? 0) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface Prediction {
  id: (typeof RACE_DISTANCES)[number]['id'];
  label: string;
  distanceM: number;
  timeSec: number;
  /** Far from the reference distance the estimate gets unreliable. */
  uncertain: boolean;
}

export function predictRaces(reference: { distanceM: number; timeSec: number }): Prediction[] {
  return RACE_DISTANCES.map((r) => {
    const ratio = r.distanceM / reference.distanceM;
    return {
      id: r.id,
      label: r.label,
      distanceM: r.distanceM,
      timeSec: riegel(reference.timeSec, reference.distanceM, r.distanceM),
      uncertain: ratio < 0.5 || ratio > 2.5,
    };
  });
}

export interface HrZone {
  zone: Zone;
  min: number;
  max: number;
}

export type HrSource = 'threshold' | 'reserve' | 'max';

export interface HrZones {
  source: HrSource;
  zones: HrZone[];
}

const FRACTIONS_MAX: [number, number][] = [
  [0.5, 0.6],
  [0.6, 0.7],
  [0.7, 0.8],
  [0.8, 0.9],
  [0.9, 1.0],
];
// Friel: zones as share of the lactate threshold heart rate (LTHR).
const FRACTIONS_LTHR: [number, number][] = [
  [0.65, 0.85],
  [0.85, 0.89],
  [0.89, 0.94],
  [0.94, 1.0],
  [1.0, 1.06],
];

const validHr = (n: number | undefined): n is number => n !== undefined && n >= 80 && n <= 230;

/**
 * Heart rate zones. Preferred input is the threshold heart rate, then max and resting rate
 * (Karvonen), then max alone. Undefined when nothing usable is set.
 */
export function hrZones(p: Pick<Profile, 'maxHr' | 'restingHr' | 'thresholdHr'>): HrZones | undefined {
  const build = (fr: [number, number][], at: (f: number) => number): HrZone[] =>
    fr.map(([a, b], i) => ({ zone: (i + 1) as Zone, min: Math.round(at(a)), max: Math.round(at(b)) }));
  if (validHr(p.thresholdHr)) return { source: 'threshold', zones: build(FRACTIONS_LTHR, (f) => p.thresholdHr! * f) };
  if (validHr(p.maxHr)) {
    if (p.restingHr !== undefined && p.restingHr >= 30 && p.restingHr < p.maxHr - 20) {
      const rest = p.restingHr;
      return { source: 'reserve', zones: build(FRACTIONS_MAX, (f) => rest + (p.maxHr! - rest) * f) };
    }
    return { source: 'max', zones: build(FRACTIONS_MAX, (f) => p.maxHr! * f) };
  }
  return undefined;
}

/** Zone of a heart rate; below zone 1 counts as 1, above the top as 5. */
export function zoneFromHr(hr: number, z: HrZones): Zone {
  for (const x of z.zones) if (hr < x.max) return x.zone;
  return 5;
}

export interface PowerZone {
  zone: Zone;
  min: number;
  /** undefined = open ended */
  max?: number;
}

/** Coggan power zones mapped to the five app zones. */
export function powerZones(ftpW: number | undefined): PowerZone[] | undefined {
  if (ftpW === undefined || !(ftpW >= 50 && ftpW <= 700)) return undefined;
  const w = (f: number) => Math.round(ftpW * f);
  return [
    { zone: 1, min: 0, max: w(0.55) },
    { zone: 2, min: w(0.55), max: w(0.75) },
    { zone: 3, min: w(0.75), max: w(0.9) },
    { zone: 4, min: w(0.9), max: w(1.05) },
    { zone: 5, min: w(1.05) },
  ];
}

/** Pace zones from the profile's reference run, if it is set and plausible. */
export function profilePaceZones(p: Pick<Profile, 'referenceRun'>): { vdot: number; zones: Record<Zone, PaceRange> } | undefined {
  if (!p.referenceRun) return undefined;
  const v = vdot(p.referenceRun.distanceM, p.referenceRun.timeSec);
  // Daniels' tables cover roughly VDOT 30-85.
  if (v === undefined || v < 25 || v > 90) return undefined;
  return { vdot: v, zones: paceZones(v) };
}

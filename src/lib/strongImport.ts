import type {
  BodyMeasurement,
  Exercise,
  ExerciseType,
  SetType,
  Template,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../db/types';
import { csvToObjects } from './csv';
import { STRONG_EXERCISES, guessEquipment } from './strongExercises';

// Import of the CSV exports of the Strong app (workouts, templates, body weight).
// parse*: file text -> neutral structures; buildPlan: structures -> app data (pure, nothing is written).

export type StrongKind = 'workouts' | 'templates' | 'weight';

export function detectKind(header: string[]): StrongKind | undefined {
  if (header.includes('Date') && header.includes('Workout') && header.includes('Exercise')) return 'workouts';
  if (header.includes('Template') && header.includes('Exercise')) return 'templates';
  if (header.includes('Measurement Type') && header.includes('Value')) return 'weight';
  return undefined;
}

const MAX_PLAUSIBLE_WORKOUT_SEC = 6 * 3600;
const FALLBACK_WORKOUT_SEC = 3600;
const KG_PER_LB = 0.45359237;
// Values above these are reported as probable typos (never changed).
export const MAX_PLAUSIBLE_REPS = 60;
export const MAX_PLAUSIBLE_KG = 500;
export const MAX_PLAUSIBLE_M = 100_000;

export const formatHours = (sec: number | undefined) =>
  sec === undefined || sec <= 0 ? '0' : sec >= 3600 ? `${Math.round(sec / 3600)} Std.` : `${Math.round(sec / 60)} Min.`;

export interface RawSet {
  type: SetType;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  distanceM?: number;
  rpe?: number;
  /** Strong stores assistance as negative weight. */
  assisted?: boolean;
}
export interface RawExercise {
  name: string;
  note?: string;
  sets: RawSet[];
}
export interface ParsedWorkout {
  startedAt: number;
  name: string;
  durationSec: number;
  /** Duration as stored in the file. */
  rawDurationSec?: number;
  durationAdjusted: boolean;
  note?: string;
  exercises: RawExercise[];
}
export interface ParsedTemplate {
  name: string;
  exercises: RawExercise[];
}
export interface ParsedWeight {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

function parseSet(row: Record<string, string>): RawSet {
  const label = (row['Set'] ?? '').trim().toUpperCase();
  const type: SetType = label === 'W' ? 'warmup' : label === 'D' ? 'drop' : label === 'F' ? 'failure' : 'normal';
  const weight = num(row['Weight (kg)']);
  const reps = num(row['Reps']);
  return {
    type,
    reps: reps ? Math.round(reps) : undefined,
    weightKg: weight ? Math.abs(weight) : undefined, // 0 = bodyweight without extra weight
    assisted: weight !== undefined && weight < 0 ? true : undefined,
    rpe: num(row['RPE']),
    distanceM: num(row['Distance (m)']) || undefined,
    durationSec: num(row['Duration (s)']) || undefined,
  };
}

/** "2026-10-24 14:22:54" plus a time zone like "Europe/Berlin (+02:00) [device]" -> epoch ms. */
export function parseStrongDate(date: string, timezone = ''): number | undefined {
  const m = date.trim().match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/);
  if (!m) return undefined;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  const off = timezone.match(/([+-])(\d\d):?(\d\d)/);
  if (!off) return new Date(y, mo - 1, d, h, mi, s).getTime(); // no offset given: device time
  const offsetMin = (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3]));
  return Date.UTC(y, mo - 1, d, h, mi, s) - offsetMin * 60_000;
}

/** Consecutive rows of the same exercise form one block (set numbers restart per block). */
function groupExercises(rows: Record<string, string>[], noteColumn?: string): RawExercise[] {
  const out: RawExercise[] = [];
  for (const row of rows) {
    const name = (row['Exercise'] ?? '').trim();
    if (!name) continue;
    let cur = out.at(-1);
    if (!cur || cur.name !== name) {
      cur = { name, sets: [] };
      out.push(cur);
    }
    cur.sets.push(parseSet(row));
    const note = noteColumn ? (row[noteColumn] ?? '').trim() : '';
    if (note && !cur.note) cur.note = note;
  }
  return out;
}

export function parseStrongWorkouts(text: string): ParsedWorkout[] {
  const { rows } = csvToObjects(text);
  const groups = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const key = `${r['Date']}|${r['Workout']}|${r['Timezone']}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const result: ParsedWorkout[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    const startedAt = parseStrongDate(first['Date'], first['Timezone']);
    const exercises = groupExercises(group, 'Exercise Notes');
    if (startedAt === undefined || !exercises.length) continue;
    const dur = num(first['Workout Duration (s)']);
    const plausible = dur !== undefined && dur > 0 && dur <= MAX_PLAUSIBLE_WORKOUT_SEC;
    result.push({
      startedAt,
      name: first['Workout'].trim() || 'Workout',
      durationSec: plausible ? dur : FALLBACK_WORKOUT_SEC,
      rawDurationSec: dur,
      durationAdjusted: !plausible,
      note: group.map((r) => r['Workout Notes']?.trim()).find(Boolean),
      exercises,
    });
  }
  return result.sort((a, b) => a.startedAt - b.startedAt);
}

export function parseStrongTemplates(text: string): ParsedTemplate[] {
  const { rows } = csvToObjects(text);
  const blocks: { name: string; rows: Record<string, string>[] }[] = [];
  for (const r of rows) {
    const name = (r['Template'] ?? '').trim();
    if (!name) continue;
    const last = blocks.at(-1);
    if (last && last.name === name) last.rows.push(r);
    else blocks.push({ name, rows: [r] });
  }
  const seen = new Map<string, number>();
  return blocks.map((b) => {
    const n = (seen.get(b.name) ?? 0) + 1;
    seen.set(b.name, n);
    return { name: n === 1 ? b.name : `${b.name} (${n})`, exercises: groupExercises(b.rows) };
  });
}

const WEIGHT_TYPES = new Set(['gewicht', 'weight', 'body weight', 'bodyweight', 'körpergewicht']);

export function parseStrongWeights(text: string): { weights: ParsedWeight[]; skipped: number } {
  const { rows } = csvToObjects(text);
  const byDay = new Map<string, { time: string; weightKg: number }>();
  let skipped = 0;
  for (const r of rows) {
    const value = num(r['Value']);
    const date = (r['Date'] ?? '').slice(0, 10);
    if (!WEIGHT_TYPES.has((r['Measurement Type'] ?? '').trim().toLowerCase()) || value === undefined || !/^\d{4}-\d\d-\d\d$/.test(date)) {
      skipped++;
      continue;
    }
    const kg = /lb/i.test(r['Unit'] ?? '') ? value * KG_PER_LB : value;
    const cur = byDay.get(date);
    if (!cur || r['Date'] > cur.time) byDay.set(date, { time: r['Date'], weightKg: kg }); // latest of the day
  }
  const weights = [...byDay].map(([date, v]) => ({ date, weightKg: Math.round(v.weightKg * 100) / 100 }));
  return { weights: weights.sort((a, b) => a.date.localeCompare(b.date)), skipped };
}

// ---------------------------------------------------------------- plan

export interface ExistingData {
  exerciseIds: Set<string>;
  workoutIds: Set<string>;
  templateIds: Set<string>;
  measurementDates: Set<string>;
}

export interface ImportPlan {
  /** Custom exercises that do not exist yet. */
  newExercises: Exercise[];
  mappedExercises: { strong: string; library: string }[];
  workouts: Workout[];
  templates: Template[];
  measurements: BodyMeasurement[];
  /** Counts of entries that were already imported or present and are left alone. */
  already: { workouts: number; templates: number; measurements: number };
  warnings: string[];
  /** Individual entries that look like typos in Strong (one line each), imported unchanged except durations. */
  suspicious: string[];
  range?: { from: number; to: number };
}

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function inferType(sets: RawSet[]): ExerciseType {
  if (sets.some((s) => s.distanceM)) return 'distance_duration';
  if (!sets.some((s) => s.reps) && sets.some((s) => s.durationSec)) return 'duration';
  if (sets.some((s) => s.assisted)) return 'assisted_bodyweight';
  if (!sets.some((s) => s.weightKg)) return 'bodyweight_reps';
  return 'weight_reps';
}

const toSet = (s: RawSet, id: string): WorkoutSet => ({
  id,
  type: s.type,
  reps: s.reps,
  weightKg: s.weightKg,
  durationSec: s.durationSec,
  distanceM: s.distanceM,
  rpe: s.rpe,
  completed: true,
});

export function buildPlan(
  input: { workouts?: ParsedWorkout[]; templates?: ParsedTemplate[]; weights?: ParsedWeight[] },
  library: Exercise[],
  existing: ExistingData,
): ImportPlan {
  const workouts = input.workouts ?? [];
  const templates = input.templates ?? [];
  const warnings: string[] = [];

  // --- exercises: collect usage per Strong name, then resolve once
  const usage = new Map<string, RawSet[]>();
  for (const e of [...workouts.flatMap((w) => w.exercises), ...templates.flatMap((t) => t.exercises)]) {
    (usage.get(e.name) ?? usage.set(e.name, []).get(e.name)!).push(...e.sets);
  }
  const libByName = new Map(library.filter((e) => !e.isCustom).map((e) => [e.name, e]));
  const idOf = new Map<string, string>();
  const newExercises: Exercise[] = [];
  const mappedExercises: ImportPlan['mappedExercises'] = [];
  for (const [name, sets] of usage) {
    const entry = STRONG_EXERCISES[name];
    const lib = typeof entry === 'string' ? libByName.get(entry) : undefined;
    if (lib) {
      idOf.set(name, lib.id);
      mappedExercises.push({ strong: name, library: lib.name });
      continue;
    }
    const spec = typeof entry === 'object' ? entry : undefined;
    const id = `strong-${slug(name)}`;
    idOf.set(name, id);
    if (existing.exerciseIds.has(id)) continue;
    newExercises.push({
      id,
      name,
      equipment: spec?.equipment ?? guessEquipment(name),
      type: inferType(sets),
      category: spec?.category,
      primaryMuscles: spec?.muscles ?? [],
      secondaryMuscles: spec?.secondary ?? [],
      instructions: [],
      images: [],
      isCustom: true,
    });
  }

  // --- workouts
  const suspicious: string[] = [];
  const day = (ms: number) => new Date(ms).toLocaleDateString('de-DE');
  let adjusted = 0;
  const planWorkouts: Workout[] = [];
  const idsSeen = new Set<string>();
  let alreadyWorkouts = 0;
  for (const w of workouts) {
    let id = `strong-${w.startedAt}-${slug(w.name)}`;
    while (idsSeen.has(id)) id += '-b';
    idsSeen.add(id);
    if (existing.workoutIds.has(id)) {
      alreadyWorkouts++;
      continue;
    }
    if (w.durationAdjusted) {
      adjusted++;
      suspicious.push(`${day(w.startedAt)} ${w.name}: Dauer ${formatHours(w.rawDurationSec)} → 1 Std. gesetzt`);
    }
    for (const e of w.exercises) {
      e.sets.forEach((s, k) => {
        const what = (s.reps ?? 0) > MAX_PLAUSIBLE_REPS ? `${s.reps} Wdh.` : (s.weightKg ?? 0) > MAX_PLAUSIBLE_KG ? `${s.weightKg} kg` : (s.distanceM ?? 0) > MAX_PLAUSIBLE_M ? `${s.distanceM! / 1000} km` : '';
        if (what) suspicious.push(`${day(w.startedAt)} ${e.name}, Satz ${k + 1}: ${what}`);
      });
    }
    planWorkouts.push({
      id,
      name: w.name,
      startedAt: w.startedAt,
      finishedAt: w.startedAt + w.durationSec * 1000,
      note: w.note,
      exercises: w.exercises.map<WorkoutExercise>((e, i) => ({
        id: `${id}-e${i}`,
        exerciseId: idOf.get(e.name)!,
        order: i,
        note: e.note,
        sets: e.sets.map((s, k) => toSet(s, `${id}-e${i}-s${k}`)),
      })),
    });
  }
  if (adjusted) {
    warnings.push(
      `${adjusted} Workouts hatten keine plausible Dauer (0 oder über 6 Stunden, vermutlich ein Fehler in Strong). Für sie wird 1 Stunde angesetzt.`,
    );
  }
  const oddSets = suspicious.length - adjusted;
  if (oddSets > 0) {
    warnings.push(
      `${oddSets} Sätze haben auffällig hohe Werte (über ${MAX_PLAUSIBLE_REPS} Wiederholungen, ${MAX_PLAUSIBLE_KG} kg oder ${MAX_PLAUSIBLE_M / 1000} km), vermutlich Tippfehler in Strong. Sie werden unverändert übernommen und verfälschen Rekorde, bis du sie im Verlauf korrigierst.`,
    );
  }

  // --- templates
  const planTemplates: Template[] = [];
  let alreadyTemplates = 0;
  templates.forEach((t) => {
    const id = `strong-tpl-${slug(t.name)}`;
    if (existing.templateIds.has(id)) {
      alreadyTemplates++;
      return;
    }
    planTemplates.push({
      id,
      name: t.name,
      exercises: t.exercises.map((e, i) => ({
        id: `${id}-e${i}`,
        exerciseId: idOf.get(e.name)!,
        order: i,
        sets: e.sets.map((s) => ({ type: s.type, reps: s.reps, weightKg: s.weightKg, durationSec: s.durationSec, distanceM: s.distanceM })),
      })),
    });
  });

  // --- body weight: an entry that already exists for a day always wins
  const measurements: BodyMeasurement[] = [];
  let alreadyMeasurements = 0;
  for (const m of input.weights ?? []) {
    if (existing.measurementDates.has(m.date)) alreadyMeasurements++;
    else measurements.push({ id: `strong-w-${m.date}`, date: m.date, weightKg: m.weightKg });
  }

  const starts = workouts.map((w) => w.startedAt);
  return {
    newExercises,
    mappedExercises,
    workouts: planWorkouts,
    templates: planTemplates,
    measurements,
    already: { workouts: alreadyWorkouts, templates: alreadyTemplates, measurements: alreadyMeasurements },
    warnings,
    suspicious,
    range: starts.length ? { from: Math.min(...starts), to: Math.max(...starts) } : undefined,
  };
}

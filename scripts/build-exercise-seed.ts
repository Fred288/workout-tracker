// Builds src/data/exercises.seed.json from free-exercise-db and downloads the images to public/exercises/.
// Run: npm run seed   (Node >= 22.6 with native TypeScript stripping)
import { mkdir, writeFile, access, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Equipment, Exercise, ExerciseType, Level, Sport } from '../src/db/types.ts';

const SOURCE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';
const SKIP_IMAGES = process.argv.includes('--no-images');

interface RawExercise {
  id: string;
  name: string;
  level: string | null;
  equipment: string | null;
  category: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  images: string[];
}

const EQUIPMENT: Record<string, Equipment> = {
  'body only': 'none',
  barbell: 'barbell',
  'e-z curl bar': 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  cable: 'cable',
  bands: 'band',
  kettlebells: 'kettlebell',
  'foam roll': 'other',
  'medicine ball': 'other',
  'exercise ball': 'other',
  other: 'other',
};

function mapEquipment(raw: string | null): Equipment {
  if (!raw) return 'none'; // null in the source = no equipment (mostly stretches)
  return EQUIPMENT[raw] ?? 'other';
}

function mapType(raw: RawExercise, equipment: Equipment): ExerciseType {
  if (raw.category === 'cardio' || raw.category === 'stretching') return 'duration';
  if (equipment === 'none') return 'bodyweight_reps';
  return 'weight_reps';
}

function mapLevel(raw: string | null): Level | undefined {
  return raw === 'beginner' || raw === 'intermediate' || raw === 'expert' ? raw : undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(rel: string): Promise<void> {
  const target = join('public', 'exercises', rel);
  if (await exists(target)) return;
  const res = await fetch(`${SOURCE}/exercises/${rel}`);
  if (!res.ok) throw new Error(`Image ${rel}: HTTP ${res.status}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

const res = await fetch(`${SOURCE}/dist/exercises.json`);
if (!res.ok) throw new Error(`exercises.json: HTTP ${res.status}`);
const raw = (await res.json()) as RawExercise[];

let exercises: Exercise[] = raw.map((r) => {
  const equipment = mapEquipment(r.equipment);
  return {
    id: r.id,
    name: r.name,
    equipment,
    type: mapType(r, equipment),
    category: r.category ?? undefined,
    primaryMuscles: r.primaryMuscles ?? [],
    secondaryMuscles: r.secondaryMuscles ?? [],
    instructions: r.instructions ?? [],
    images: r.images ?? [],
    level: mapLevel(r.level),
    isCustom: false,
  };
});

// Everkinetic line drawings (CC BY-SA 4.0) for manually verified pairs only, see scripts/everkinetic-map.json.
// Unmapped exercises keep their photos.
const EK_SOURCE = 'https://raw.githubusercontent.com/everkinetic/data/master/dist/svg';
const LINE_COLOR = '#d9dbe4';
const ekMap = JSON.parse(await readFile('scripts/everkinetic-map.json', 'utf8')) as Record<string, string[]>;
const byName = new Map(exercises.map((e) => [e.name, e]));

function luminance(hex: string): number | null {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function fetchIllustration(num: string, phase: 'relaxation' | 'tension'): Promise<string> {
  const rel = `illustrations/${num}-${phase}.svg`;
  const target = join('public', rel);
  if (!(await exists(target))) {
    const res = await fetch(`${EK_SOURCE}/${num}-${phase}.svg`);
    if (!res.ok) throw new Error(`Illustration ${num}-${phase}: HTTP ${res.status}`);
    const svg = await res.text();
    // Light areas (background) become transparent, dark lines become a light colour for the dark theme.
    const recoloured = svg.replace(/fill="(#[0-9a-f]{3}|#[0-9a-f]{6})"/gi, (_, hex: string) => {
      const l = luminance(hex);
      if (l === null) throw new Error(`Illustration ${num}-${phase}: unexpected colour ${hex}`);
      return l > 0.6 ? 'fill="none"' : `fill="${LINE_COLOR}"`;
    });
    if (/fill="(?!none|#d9dbe4)/i.test(recoloured) || /style="[^"]*fill/i.test(recoloured)) {
      throw new Error(`Illustration ${num}-${phase}: unhandled fill`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, recoloured);
  }
  return rel;
}

const mapped = new Set<string>();
for (const [num, names] of Object.entries(ekMap)) {
  const frames = [await fetchIllustration(num, 'relaxation'), await fetchIllustration(num, 'tension')];
  for (const name of names) {
    const e = byName.get(name);
    if (!e) throw new Error(`everkinetic-map: unknown exercise "${name}" (${num})`);
    if (mapped.has(e.id)) throw new Error(`everkinetic-map: "${name}" mapped twice`);
    mapped.add(e.id);
    e.illustrations = frames;
  }
}
// Keep the library focused on regular gym and home training, see scripts/exercise-exclusions.json.
// Only the curated core library is seeded, see scripts/exercise-core.json.
const core = JSON.parse(await readFile('scripts/exercise-core.json', 'utf8')) as {
  names: string[];
  types: Record<string, ExerciseType>;
  recategorize: Record<string, string>;
  sports: Record<string, Sport>;
  extras: Exercise[];
};
const coreNames = new Set(core.names);
for (const n of [...coreNames, ...Object.keys(core.recategorize)]) {
  if (!byName.has(n)) throw new Error(`exercise-core: unknown exercise "${n}"`);
}
if (coreNames.size !== core.names.length) throw new Error('exercise-core: duplicate names');
exercises = exercises.filter((e) => coreNames.has(e.name));
for (const [name, category] of Object.entries(core.recategorize)) byName.get(name)!.category = category;
for (const [name, type] of Object.entries(core.types)) {
  const e = byName.get(name);
  if (!e || !coreNames.has(name)) throw new Error(`exercise-core types: "${name}" is not in the core list`);
  e.type = type;
}
for (const [name, sport] of Object.entries(core.sports)) {
  const e = byName.get(name);
  if (!e || !coreNames.has(name)) throw new Error(`exercise-core sports: "${name}" is not in the core list`);
  e.sport = sport;
}
for (const x of core.extras) {
  if (exercises.some((e) => e.id === x.id)) throw new Error(`exercise-core extras: duplicate id "${x.id}"`);
  exercises.push(x);
}
const KEPT_CATEGORIES = ['strength', 'stretching', 'powerlifting', 'cardio'];
const odd = exercises.filter((e) => e.category && !KEPT_CATEGORIES.includes(e.category));
if (odd.length) throw new Error(`Recategorize these: ${odd.map((e) => e.name).join(', ')}`);

// Drop drawings and photos that are no longer referenced.
const usedDrawings = new Set(exercises.flatMap((e) => e.illustrations ?? []).map((p) => p.split('/').pop()));
for (const f of await readdir(join('public', 'illustrations'))) {
  if (!usedDrawings.has(f)) await rm(join('public', 'illustrations', f));
}
const usedPhotoDirs = new Set(exercises.flatMap((e) => e.images).map((p) => p.split('/')[0]));
for (const d of await readdir(join('public', 'exercises')).catch(() => [])) {
  if (!usedPhotoDirs.has(d)) await rm(join('public', 'exercises', d), { recursive: true });
}
console.log(
  `Core library: ${exercises.length} exercises, ${exercises.filter((e) => e.illustrations).length} with drawings`,
);

// Version changes whenever the content changes, so existing installs re-import.
const version = createHash('sha1').update(JSON.stringify(exercises)).digest('hex').slice(0, 10);
await mkdir('src/data', { recursive: true });
await writeFile('src/data/exercises.seed.json', JSON.stringify({ version, exercises }));
// Tiny separate file so the app can check the version without loading the whole seed.
await writeFile('src/data/exercises.seed.version.json', JSON.stringify({ version }) + '\n');
console.log(`Wrote ${exercises.length} exercises (version ${version})`);

if (!SKIP_IMAGES) {
  const images = exercises.flatMap((e) => e.images);
  let done = 0;
  await pool(images, 16, async (rel) => {
    await downloadImage(rel);
    if (++done % 200 === 0) console.log(`Images ${done}/${images.length}`);
  });
  console.log(`Images done (${images.length})`);
}

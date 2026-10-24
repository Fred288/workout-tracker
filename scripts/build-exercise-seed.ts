// Builds src/data/exercises.seed.json from free-exercise-db and downloads the images to public/exercises/.
// Run: npm run seed   (Node >= 22.6 with native TypeScript stripping)
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Equipment, Exercise, ExerciseType, Level } from '../src/db/types.ts';

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

const exercises: Exercise[] = raw.map((r) => {
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

// Version changes whenever the content changes, so existing installs re-import.
const version = createHash('sha1').update(JSON.stringify(exercises)).digest('hex').slice(0, 10);
await mkdir('src/data', { recursive: true });
await writeFile('src/data/exercises.seed.json', JSON.stringify({ version, exercises }));
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

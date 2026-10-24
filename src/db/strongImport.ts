import { db } from './dexie';
import { parseCsv } from '../lib/csv';
import {
  buildPlan,
  detectKind,
  parseStrongTemplates,
  parseStrongWeights,
  parseStrongWorkouts,
  type ImportPlan,
  type ParsedTemplate,
  type ParsedWeight,
  type ParsedWorkout,
  type StrongKind,
} from '../lib/strongImport';

export interface StrongPreview {
  plan: ImportPlan;
  /** Entries per recognised file kind, as found in the files. */
  found: Partial<Record<StrongKind, number>>;
  /** Names of files that are not a Strong export. */
  unknownFiles: string[];
  skippedWeightRows: number;
}

/** Reads the chosen CSV files and works out what would be imported. Writes nothing. */
export async function previewStrongImport(files: File[]): Promise<StrongPreview> {
  let workouts: ParsedWorkout[] | undefined;
  let templates: ParsedTemplate[] | undefined;
  let weights: ParsedWeight[] | undefined;
  const found: StrongPreview['found'] = {};
  const unknownFiles: string[] = [];
  let skippedWeightRows = 0;

  for (const file of files) {
    const text = await file.text();
    const kind = detectKind(parseCsv(text)[0] ?? []);
    if (kind === 'workouts') {
      workouts = [...(workouts ?? []), ...parseStrongWorkouts(text)];
      found.workouts = workouts.length;
    } else if (kind === 'templates') {
      templates = [...(templates ?? []), ...parseStrongTemplates(text)];
      found.templates = templates.length;
    } else if (kind === 'weight') {
      const r = parseStrongWeights(text);
      weights = [...(weights ?? []), ...r.weights];
      skippedWeightRows += r.skipped;
      found.weight = weights.length;
    } else unknownFiles.push(file.name);
  }

  const [exercises, workoutKeys, templateKeys, measurements] = await Promise.all([
    db.exercises.toArray(),
    db.workouts.toCollection().primaryKeys(),
    db.templates.toCollection().primaryKeys(),
    db.measurements.toArray(),
  ]);
  const plan = buildPlan({ workouts, templates, weights }, exercises, {
    exerciseIds: new Set(exercises.map((e) => e.id)),
    workoutIds: new Set(workoutKeys as string[]),
    templateIds: new Set(templateKeys as string[]),
    measurementDates: new Set(measurements.map((m) => m.date)),
  });
  return { plan, found, unknownFiles, skippedWeightRows };
}

/** Writes the plan. Re-running an import is safe: ids are derived from the data, nothing is duplicated. */
export async function applyStrongImport(plan: ImportPlan): Promise<void> {
  await db.transaction('rw', [db.exercises, db.workouts, db.templates, db.measurements], async () => {
    await db.exercises.bulkPut(plan.newExercises);
    await db.workouts.bulkPut(plan.workouts);
    await db.templates.bulkPut(plan.templates);
    await db.measurements.bulkPut(plan.measurements);
  });
}

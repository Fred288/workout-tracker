import 'fake-indexeddb/auto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import seed from '../data/exercises.seed.json';
import { db } from './dexie';
import { parseCsv } from '../lib/csv';
import { applyStrongImport, previewStrongImport } from './strongImport';
import type { Exercise } from './types';

const csvFile = (name: string, text: string) => new File([text], name, { type: 'text/csv' });
const WORKOUTS =
  'Date,Timezone,Workout,Workout Duration (s),Group,Exercise,Set,Weight (kg),Reps,RPE,Distance (m),Duration (s),Workout Notes,Exercise Notes\n' +
  '2026-10-24 14:22:54,Europe/Berlin (+02:00) [device],Brust,3600,,Bench Press (Dumbbell),1,22,11,,,,,\n' +
  '2026-10-24 14:22:54,Europe/Berlin (+02:00) [device],Brust,3600,,Cable flies,1,10,12,,,,,\n';
const WEIGHT = 'Date,Measurement Type,Value,Unit,Source\n2026-10-18 10:21:00,Gewicht,80,kg,Strong\n2026-10-19 10:21:00,Gewicht,79.5,kg,Strong\n';
const TEMPLATES = 'Template,Group,Exercise,Set,Weight (kg),Reps,RPE,Distance (m),Duration (s)\nPush,,Bench Press (Dumbbell),1,22,11,,,\n';

beforeAll(async () => {
  // library as installed by the app
});
beforeEach(async () => {
  await Promise.all([db.exercises.clear(), db.workouts.clear(), db.templates.clear(), db.measurements.clear()]);
  await db.exercises.bulkPut(seed.exercises as Exercise[]);
});

describe('Strong CSV import', () => {
  it('previews without writing, then imports everything', async () => {
    const files = [csvFile('w.csv', WORKOUTS), csvFile('g.csv', WEIGHT), csvFile('t.csv', TEMPLATES)];
    const preview = await previewStrongImport(files);
    expect(preview.found).toEqual({ workouts: 1, weight: 2, templates: 1 });
    expect(await db.workouts.count()).toBe(0);

    await applyStrongImport(preview.plan);
    expect(await db.workouts.count()).toBe(1);
    expect(await db.templates.count()).toBe(1);
    expect(await db.measurements.count()).toBe(2);
    const custom = await db.exercises.filter((e) => e.isCustom).toArray();
    expect(custom.map((e) => e.name)).toEqual(['Cable flies']);

    // the workout references real exercises
    const w = (await db.workouts.toArray())[0];
    expect(await db.exercises.bulkGet(w.exercises.map((e) => e.exerciseId))).not.toContain(undefined);
  });

  it('importing the same files twice changes nothing', async () => {
    const files = () => [csvFile('w.csv', WORKOUTS), csvFile('g.csv', WEIGHT), csvFile('t.csv', TEMPLATES)];
    await applyStrongImport((await previewStrongImport(files())).plan);
    const second = await previewStrongImport(files());
    expect(second.plan.workouts).toEqual([]);
    expect(second.plan.templates).toEqual([]);
    expect(second.plan.measurements).toEqual([]);
    expect(second.plan.newExercises).toEqual([]);
    await applyStrongImport(second.plan);
    expect(await db.workouts.count()).toBe(1);
    expect(await db.exercises.filter((e) => e.isCustom).count()).toBe(1);
  });

  it('keeps existing weight entries and reports foreign files', async () => {
    await db.measurements.put({ id: 'mine', date: '2026-10-18', weightKg: 81 });
    const p = await previewStrongImport([csvFile('g.csv', WEIGHT), csvFile('other.csv', 'a,b\n1,2\n')]);
    expect(p.plan.measurements.map((m) => m.date)).toEqual(['2026-10-19']);
    expect(p.plan.already.measurements).toBe(1);
    expect(p.unknownFiles).toEqual(['other.csv']);
  });
});

// Optional check against a real export: STRONG_DIR=<folder with the three strong_*.csv files> npx vitest run
describe.skipIf(!process.env.STRONG_DIR)('real Strong export', () => {
  it('imports completely and consistently', async () => {
    const dir = process.env.STRONG_DIR!;
    const files = readdirSync(dir).filter((f) => /^strong_.*\.csv$/.test(f)).map((f) => csvFile(f, readFileSync(join(dir, f), 'utf8')));
    const p = await previewStrongImport(files);
    await applyStrongImport(p.plan);

    const workouts = await db.workouts.toArray();
    const exerciseIds = new Set((await db.exercises.toArray()).map((e) => e.id));
    // every referenced exercise exists, every set is complete data
    const dangling = workouts.flatMap((w) => w.exercises).filter((e) => !exerciseIds.has(e.exerciseId));
    expect(dangling).toEqual([]);
    expect(workouts.every((w) => w.finishedAt && w.finishedAt > w.startedAt)).toBe(true);

    // totals computed straight from the CSV must equal what is in the database
    const csv = files.find((f) => f.name.includes('workouts'))!;
    const [header, ...body] = parseCsv(await csv.text());
    const col = (n: string) => header.indexOf(n);
    const sum = (f: (r: string[]) => number) => body.reduce((s, r) => s + f(r), 0);
    const n = (r: string[], c: string) => Number(r[col(c)] || 0);
    const sets = workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets));
    expect(sets.length).toBe(body.length);
    expect(Math.round(sets.reduce((s, x) => s + (x.weightKg ?? 0) * (x.reps ?? 0), 0))).toBe(
      Math.round(sum((r) => Math.abs(n(r, 'Weight (kg)')) * n(r, 'Reps'))),
    );
    expect(sets.reduce((s, x) => s + (x.reps ?? 0), 0)).toBe(sum((r) => n(r, 'Reps')));
    expect(sets.reduce((s, x) => s + (x.distanceM ?? 0), 0)).toBe(sum((r) => n(r, 'Distance (m)')));
    expect(sets.reduce((s, x) => s + (x.durationSec ?? 0), 0)).toBe(sum((r) => n(r, 'Duration (s)')));
    const label = (t: string) => body.filter((r) => r[col('Set')] === t).length;
    expect(sets.filter((x) => x.type === 'warmup').length).toBe(label('W'));
    expect(sets.filter((x) => x.type === 'drop').length).toBe(label('D'));
    expect(sets.filter((x) => x.type === 'failure').length).toBe(label('F'));
    const wt = files.find((f) => f.name.includes('weight'))!;
    const wrows = parseCsv(await wt.text()).slice(1);
    expect(new Set(wrows.map((r) => r[0].slice(0, 10))).size).toBe(await db.measurements.count());
    const tpl = files.find((f) => f.name.includes('templates'))!;
    const tsets = (await db.templates.toArray()).reduce((s, t) => s + t.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
    expect(tsets).toBe(parseCsv(await tpl.text()).length - 1);
    console.log(JSON.stringify({
      found: p.found,
      workouts: workouts.length,
      sets: workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0),
      templates: await db.templates.count(),
      measurements: await db.measurements.count(),
      mapped: p.plan.mappedExercises.length,
      created: p.plan.newExercises.map((e) => `${e.name} [${e.equipment}/${e.type}]`),
      warnings: p.plan.warnings,
      range: p.plan.range && [new Date(p.plan.range.from).toISOString(), new Date(p.plan.range.to).toISOString()],
    }, null, 2));
  });
});

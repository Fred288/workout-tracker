import type { SessionBlock, SessionKind, StepIntensity, Template, TemplateExercise, Zone } from '../db/types';
import { newId } from './id';

/** Library exercise the built-in run templates use. */
export const RUN_EXERCISE_ID = 'Running';

export type StepBlock = SessionBlock;

type TemplateSet = TemplateExercise['sets'][number];

export const DEFAULT_ZONE: Record<StepIntensity, Zone> = {
  warmup: 1,
  recovery: 1,
  cooldown: 1,
  easy: 2,
  steady: 3,
  tempo: 3,
  threshold: 4,
  interval: 5,
};

/** Steps that do not count as working sets (stats, records): stored as warm-up sets. */
const SUPPORT: ReadonlySet<StepIntensity> = new Set(['warmup', 'recovery', 'cooldown']);

/** Expands blocks into template sets. "8 x 100 m" becomes eight sets of 100 m. */
export function blocksToSets(blocks: StepBlock[]): TemplateSet[] {
  return blocks.flatMap((b) =>
    Array.from({ length: Math.max(1, b.repeat) }, () =>
      b.steps.map((s) => ({
        type: SUPPORT.has(s.intensity) ? ('warmup' as const) : ('normal' as const),
        ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
        ...(s.distanceM !== undefined ? { distanceM: s.distanceM } : {}),
        zone: s.zone ?? DEFAULT_ZONE[s.intensity],
      })),
    ).flat(),
  );
}

const min = (m: number) => m * 60;
const warmup = { intensity: 'warmup', durationSec: min(10) } as const;
const cooldown = { intensity: 'cooldown', durationSec: min(10) } as const;

export interface RunPreset {
  id: string;
  kind: SessionKind;
  name: string;
  description: string;
  blocks: StepBlock[];
}

export const RUN_PRESETS: RunPreset[] = [
  {
    id: 'free',
    kind: 'easy',
    name: 'Freier Lauf',
    description: 'Ohne Vorgabe, nur Zeit und Distanz',
    blocks: [{ repeat: 1, steps: [{ intensity: 'easy' }] }],
  },
  {
    id: 'easy',
    kind: 'easy',
    name: 'Lockerer Lauf',
    description: '40 min, Zone 2',
    blocks: [{ repeat: 1, steps: [{ intensity: 'easy', durationSec: min(40) }] }],
  },
  {
    id: 'long',
    kind: 'long',
    name: 'Langer Lauf',
    description: '90 min, Zone 2',
    blocks: [{ repeat: 1, steps: [{ intensity: 'easy', durationSec: min(90) }] }],
  },
  {
    id: 'tempo',
    kind: 'tempo',
    name: 'Tempolauf',
    description: '10 min ein, 20 min Tempo (Zone 4), 10 min aus',
    blocks: [
      { repeat: 1, steps: [warmup] },
      { repeat: 1, steps: [{ intensity: 'tempo', durationSec: min(20), zone: 4 }] },
      { repeat: 1, steps: [cooldown] },
    ],
  },
  {
    id: 'intervals-time',
    kind: 'intervals',
    name: 'Intervalle 4 × 5 min',
    description: '10 min ein, 4 × (5 min hart, 2 min Trabpause), 10 min aus',
    blocks: [
      { repeat: 1, steps: [warmup] },
      {
        repeat: 4,
        steps: [
          { intensity: 'threshold', durationSec: min(5) },
          { intensity: 'recovery', durationSec: min(2) },
        ],
      },
      { repeat: 1, steps: [cooldown] },
    ],
  },
  {
    id: 'intervals-dist',
    kind: 'intervals',
    name: 'Intervalle 6 × 800 m',
    description: '10 min ein, 6 × (800 m schnell, 400 m Trab), 10 min aus',
    blocks: [
      { repeat: 1, steps: [warmup] },
      {
        repeat: 6,
        steps: [
          { intensity: 'interval', distanceM: 800 },
          { intensity: 'recovery', distanceM: 400 },
        ],
      },
      { repeat: 1, steps: [cooldown] },
    ],
  },
];

/** Builds a (not persisted) Template from a preset; start it with workoutFromTemplate. */
export function templateFromPreset(p: RunPreset): Template {
  return {
    id: newId(),
    name: p.name,
    sport: 'run',
    exercises: [{ id: newId(), exerciseId: RUN_EXERCISE_ID, order: 0, sets: blocksToSets(p.blocks) }],
  };
}

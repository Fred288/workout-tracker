import type { SessionBlock, SessionKind, SessionPart, Template, WorkoutSport } from '../db/types';
import { newId } from './id';
import { RUN_PRESETS, blocksToSets } from './runTemplates';
import { SPORT_EXERCISE } from './sports';

/** A ready-made session for any sport; start it directly or put it in the plan. */
export interface Preset {
  id: string;
  sport: WorkoutSport;
  kind: SessionKind;
  name: string;
  description: string;
  parts: SessionPart[];
}

const min = (m: number) => m * 60;
const rep = (repeat: number, ...steps: SessionBlock['steps']): SessionBlock => ({ repeat, steps });

const SWIM_PRESETS: Preset[] = [
  {
    id: 'swim-technique',
    sport: 'swim',
    kind: 'easy',
    name: 'Schwimmen 8 × 100 m',
    description: '200 m ein, 8 × 100 m ruhig, 100 m aus',
    parts: [{ sport: 'swim', blocks: [rep(1, { intensity: 'warmup', distanceM: 200 }), rep(8, { intensity: 'easy', distanceM: 100 }), rep(1, { intensity: 'cooldown', distanceM: 100 })] }],
  },
  {
    id: 'swim-intervals',
    sport: 'swim',
    kind: 'intervals',
    name: 'Schwimm-Intervalle 10 × 50 m',
    description: '200 m ein, 10 × 50 m schnell, 100 m aus',
    parts: [{ sport: 'swim', blocks: [rep(1, { intensity: 'warmup', distanceM: 200 }), rep(10, { intensity: 'interval', distanceM: 50 }), rep(1, { intensity: 'cooldown', distanceM: 100 })] }],
  },
  {
    id: 'swim-long',
    sport: 'swim',
    kind: 'long',
    name: 'Schwimmen 1500 m',
    description: '1500 m am Stück, ruhiges Tempo',
    parts: [{ sport: 'swim', blocks: [rep(1, { intensity: 'easy', distanceM: 1500 })] }],
  },
];

const BIKE_PRESETS: Preset[] = [
  {
    id: 'bike-easy',
    sport: 'bike',
    kind: 'easy',
    name: 'Lockere Radfahrt',
    description: '60 min, Zone 2',
    parts: [{ sport: 'bike', blocks: [rep(1, { intensity: 'easy', durationSec: min(60) })] }],
  },
  {
    id: 'bike-long',
    sport: 'bike',
    kind: 'long',
    name: 'Lange Radfahrt',
    description: '2 h, Zone 2',
    parts: [{ sport: 'bike', blocks: [rep(1, { intensity: 'easy', durationSec: min(120) })] }],
  },
  {
    id: 'bike-intervals',
    sport: 'bike',
    kind: 'intervals',
    name: 'Rad-Intervalle 4 × 5 min',
    description: '10 min ein, 4 × (5 min hart, 3 min locker), 10 min aus',
    parts: [
      {
        sport: 'bike',
        blocks: [
          rep(1, { intensity: 'warmup', durationSec: min(10) }),
          rep(4, { intensity: 'threshold', durationSec: min(5) }, { intensity: 'recovery', durationSec: min(3) }),
          rep(1, { intensity: 'cooldown', durationSec: min(10) }),
        ],
      },
    ],
  },
];

const OTHER_PRESETS: Preset[] = [
  {
    id: 'brick',
    sport: 'brick',
    kind: 'brick',
    name: 'Koppeltraining',
    description: 'Rad 45 min, direkt danach Laufen 15 min',
    parts: [
      { sport: 'bike', blocks: [rep(1, { intensity: 'easy', durationSec: min(45) })] },
      { sport: 'run', blocks: [rep(1, { intensity: 'steady', durationSec: min(15) })] },
    ],
  },
  {
    id: 'core',
    sport: 'strength',
    kind: 'strength',
    name: 'Stabi und Mobility',
    description: '30 min Rumpf und Beweglichkeit',
    parts: [{ sport: 'strength', blocks: [rep(1, { intensity: 'easy', durationSec: min(30) })] }],
  },
];

const RUN: Preset[] = RUN_PRESETS.map((p) => ({
  id: p.id,
  sport: 'run',
  kind: p.kind,
  name: p.name,
  description: p.description,
  parts: [{ sport: 'run', blocks: p.blocks }],
}));

export const ENDURANCE_PRESETS: Preset[] = [...RUN, ...SWIM_PRESETS, ...BIKE_PRESETS, ...OTHER_PRESETS];

/** Presets by sport, in the order they are offered. */
export const PRESET_GROUPS: { sport: WorkoutSport; presets: Preset[] }[] = (['run', 'swim', 'bike', 'brick', 'strength'] as const).map((sport) => ({
  sport,
  presets: ENDURANCE_PRESETS.filter((p) => p.sport === sport),
}));

/** Builds a (not persisted) Template from a preset; start it with workoutFromTemplate. */
export function templateFromPreset(p: Preset): Template {
  return {
    id: newId(),
    name: p.name,
    sport: p.sport,
    exercises: p.parts.map((part, i) => ({ id: newId(), exerciseId: SPORT_EXERCISE[part.sport], order: i, sets: blocksToSets(part.blocks) })),
  };
}

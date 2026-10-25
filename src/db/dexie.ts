import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyMeasurement,
  Exercise,
  Goal,
  MetaEntry,
  Plan,
  PlannedSession,
  Profile,
  Template,
  Workout,
} from './types';

export const DB_NAME = 'workout-tracker';

export const db = new Dexie(DB_NAME) as Dexie & {
  exercises: EntityTable<Exercise, 'id'>;
  workouts: EntityTable<Workout, 'id'>;
  templates: EntityTable<Template, 'id'>;
  measurements: EntityTable<BodyMeasurement, 'id'>;
  profile: EntityTable<Profile, 'id'>;
  meta: EntityTable<MetaEntry, 'key'>;
  goals: EntityTable<Goal, 'id'>;
  plans: EntityTable<Plan, 'id'>;
  plannedSessions: EntityTable<PlannedSession, 'id'>;
};

export const SCHEMA_V1 = {
  exercises: 'id, name, equipment, type, isCustom, *primaryMuscles',
  workouts: 'id, startedAt, finishedAt',
  templates: 'id, name',
  measurements: 'id, date',
  profile: 'id',
  meta: 'key',
};

db.version(1).stores(SCHEMA_V1);

// v2: endurance module. New fields are optional, so existing rows need no upgrade.
db.version(2).stores({
  exercises: 'id, name, equipment, type, isCustom, *primaryMuscles, sport',
  workouts: 'id, startedAt, finishedAt, plannedSessionId',
  goals: 'id, targetDate',
  plans: 'id, goalId',
  plannedSessions: 'id, planId, date',
});

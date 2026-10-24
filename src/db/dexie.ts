import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyMeasurement,
  Exercise,
  MetaEntry,
  Profile,
  Template,
  Workout,
} from './types';

export const db = new Dexie('workout-tracker') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>;
  workouts: EntityTable<Workout, 'id'>;
  templates: EntityTable<Template, 'id'>;
  measurements: EntityTable<BodyMeasurement, 'id'>;
  profile: EntityTable<Profile, 'id'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

db.version(1).stores({
  exercises: 'id, name, equipment, type, isCustom, *primaryMuscles',
  workouts: 'id, startedAt, finishedAt',
  templates: 'id, name',
  measurements: 'id, date',
  profile: 'id',
  meta: 'key',
});

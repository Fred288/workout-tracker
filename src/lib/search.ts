import type { Equipment, Exercise } from '../db/types';
import { displayName, normalize } from './exercises';
import { MUSCLES, MUSCLE_LABELS, type MuscleId } from './muscleMap';

// Exercise search with "similar exercises". Names in the library are English, so German
// gym terms are mapped to English name fragments, muscles, equipment or categories.
// Keys are normalized (lowercase, no umlauts), values are compact English fragments.

const TERMS: Record<string, string[]> = {
  bankdrucken: ['benchpress'],
  schragbank: ['incline'],
  negativbank: ['decline'],
  kniebeuge: ['squat'],
  kniebeugen: ['squat'],
  kreuzheben: ['deadlift'],
  klimmzug: ['pullup', 'chinup'],
  klimmzuge: ['pullup', 'chinup'],
  liegestutz: ['pushup'],
  liegestutze: ['pushup'],
  dips: ['dips'],
  barrenstutz: ['dips'],
  rudern: ['row'],
  latzug: ['pulldown'],
  uberzug: ['pullover'],
  uberzuge: ['pullover'],
  schulterdrucken: ['shoulderpress', 'militarypress', 'dumbbellpress'],
  seitheben: ['lateralraise'],
  frontheben: ['frontraise', 'frontdumbbellraise', 'frontplateraise'],
  fliegende: ['fly', 'flye'],
  butterfly: ['butterfly', 'fly'],
  bizepscurl: ['curl'],
  hammercurl: ['hammercurl'],
  trizepsdrucken: ['pushdown'],
  stirndrucken: ['skullcrusher', 'lyingtricepspress'],
  beinpresse: ['legpress'],
  beinstrecker: ['legextension'],
  beinbeuger: ['legcurl'],
  wadenheben: ['calfraise', 'calfpress'],
  ausfallschritt: ['lunge'],
  ausfallschritte: ['lunge'],
  huftheben: ['hipthrust', 'glutebridge', 'bridge'],
  bauchpresse: ['crunch', 'situp'],
  unterarmstutz: ['plank'],
  seitstutz: ['sidebridge'],
  beinheben: ['legraise', 'kneehipraise'],
  ruckenstrecker: ['hyperextension'],
  schulterheben: ['shrug'],
  seilspringen: ['ropejumping'],
  laufband: ['treadmill'],
  rudergerat: ['rowingstationary'],
  fahrrad: ['bicycling'],
  ergometer: ['bicycling'],
  crosstrainer: ['elliptical'],
  stepper: ['stairmaster'],
  hampelmann: ['starjump'],
  bergsteiger: ['mountainclimber'],
  faszienrolle: ['smr'],
  blackroll: ['smr'],
  schwingen: ['swing'],
};

const EQUIPMENT_TERMS: Record<string, Equipment> = {
  langhantel: 'barbell',
  kurzhantel: 'dumbbell',
  kurzhanteln: 'dumbbell',
  hanteln: 'dumbbell',
  kabel: 'cable',
  kabelzug: 'cable',
  seilzug: 'cable',
  maschine: 'machine',
  gerat: 'machine',
  band: 'band',
  bander: 'band',
  widerstandsband: 'band',
  kettlebell: 'kettlebell',
  korpergewicht: 'none',
  zuhause: 'none',
};

const MUSCLE_TERMS: Record<string, MuscleId[]> = {
  ...Object.fromEntries(MUSCLES.map((m) => [normalize(MUSCLE_LABELS[m]).replace(/\s+/g, ''), [m]])),
  bauchmuskeln: ['abdominals'],
  rucken: ['lats', 'middle back', 'lower back'],
  schulter: ['shoulders'],
  beine: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
  oberschenkel: ['quadriceps', 'hamstrings'],
  po: ['glutes'],
  arme: ['biceps', 'triceps', 'forearms'],
};

const CATEGORY_TERMS: Record<string, string> = {
  dehnen: 'stretching',
  dehnung: 'stretching',
  stretching: 'stretching',
  cardio: 'cardio',
  ausdauer: 'cardio',
};

// Multi-word German phrases are joined before splitting the query into words.
const PHRASES: [RegExp, string][] = [
  [/ohne gerate/g, 'korpergewicht'],
  [/aufrecht(es)? rudern/g, 'uprightrow'],
  [/french press/g, 'stirndrucken'],
];

const DICTIONARY_KEYS = [
  ...Object.keys(TERMS),
  ...Object.keys(EQUIPMENT_TERMS),
  ...Object.keys(MUSCLE_TERMS),
  ...Object.keys(CATEGORY_TERMS),
];

interface Term {
  word: string;
  fragments: string[];
  muscles: MuscleId[];
  equipment: Equipment[];
  categories: string[];
}

const compact = (s: string) => normalize(s).replace(/[^a-z0-9]/g, '');

/** Builds a term from the dictionary: the exact key, or (while typing) all keys starting with the word. */
function lookup(word: string): Term {
  const t: Term = { word, fragments: [compact(word)], muscles: [], equipment: [], categories: [] };
  const keys = DICTIONARY_KEYS.includes(word)
    ? [word]
    : word.length >= 3
      ? DICTIONARY_KEYS.filter((k) => k.startsWith(word))
      : [];
  for (const k of keys) {
    t.fragments.push(...(TERMS[k] ?? []));
    t.muscles.push(...(MUSCLE_TERMS[k] ?? []));
    if (EQUIPMENT_TERMS[k]) t.equipment.push(EQUIPMENT_TERMS[k]);
    if (CATEGORY_TERMS[k]) t.categories.push(CATEGORY_TERMS[k]);
  }
  return t;
}

export function parseQuery(query: string): Term[] {
  let q = normalize(query);
  for (const [re, rep] of PHRASES) q = q.replace(re, rep);
  return q.split(/\s+/).filter(Boolean).map(lookup);
}

function haystack(e: Exercise): string {
  return compact(`${e.name} ${e.nameDe ?? ''}`);
}

function termMatches(t: Term, e: Exercise, hay: string): boolean {
  return (
    t.fragments.some((f) => f && hay.includes(f)) ||
    t.muscles.some((m) => e.primaryMuscles.includes(m)) ||
    t.equipment.includes(e.equipment) ||
    (!!e.category && t.categories.includes(e.category))
  );
}

/** Edit distance where swapping two neighbouring letters counts as one typo (optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

const maxTypos = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/** Closest dictionary key or name word for a misspelled word, or undefined. */
function correct(word: string, vocabulary: string[]): string | undefined {
  const limit = maxTypos(word.length);
  if (!limit) return undefined;
  let best: { w: string; d: number } | undefined;
  for (const v of vocabulary) {
    if (Math.abs(v.length - word.length) > limit) continue;
    const d = editDistance(word, v);
    if (d <= limit && (!best || d < best.d)) best = { w: v, d };
  }
  return best?.w;
}

const GENERIC = new Set([
  'barbell', 'dumbbell', 'cable', 'machine', 'with', 'the', 'and', 'on', 'a', 'to', 'of', 'one', 'arm', 'two',
  'standing', 'seated', 'lying', 'grip', 'close', 'wide', 'medium', 'smith', 'bands', 'band', 'alternate',
]);
const nameWords = (e: Exercise) =>
  normalize(e.name)
    .split(/[^a-z0-9]+/)
    .map((w) => w.replace(/s$/, ''))
    .filter((w) => w.length > 2 && !GENERIC.has(w));

/** Exercises related to the given ones: same main muscle and/or same movement words. */
function related(seeds: Exercise[], pool: Exercise[], exclude: Set<string>, limit: number): Exercise[] {
  const muscles = new Set(seeds.flatMap((s) => s.primaryMuscles.slice(0, 1)));
  const words = new Set(seeds.flatMap(nameWords));
  const equipment = new Set(seeds.map((s) => s.equipment));
  return pool
    .filter((e) => !exclude.has(e.id))
    .map((e) => {
      const shared = nameWords(e).filter((w) => words.has(w)).length;
      const score =
        (muscles.has(e.primaryMuscles[0] as MuscleId) ? 2 : 0) + shared * 1.5 + (equipment.has(e.equipment) ? 0.5 : 0);
      return { e, score };
    })
    .filter((x) => x.score >= 2.5)
    .sort((a, b) => b.score - a.score || displayName(a.e).localeCompare(displayName(b.e), 'de'))
    .slice(0, limit)
    .map((x) => x.e);
}

export interface SearchResult {
  matches: Exercise[];
  similar: Exercise[];
}

const byName = (a: Exercise, b: Exercise) =>
  displayName(a).localeCompare(displayName(b), 'de', { sensitivity: 'base' });

/**
 * Exact matches need every query word (or its German synonym, muscle, equipment).
 * Similar results cover typos and exercises related to the matches.
 */
export function searchExercises(list: Exercise[], query: string, similarLimit = 8): SearchResult {
  const terms = parseQuery(query);
  if (!terms.length) return { matches: [...list].sort(byName), similar: [] };

  const hays = new Map(list.map((e) => [e.id, haystack(e)]));
  const matchAll = (ts: Term[]) => list.filter((e) => ts.every((t) => termMatches(t, e, hays.get(e.id)!)));
  const matches = matchAll(terms).sort(byName);

  let seeds = matches;
  let fuzzy: Exercise[] = [];
  if (!matches.length) {
    // Correct misspelled words against the dictionary and the words in exercise names.
    const vocabulary = [...new Set([...DICTIONARY_KEYS, ...list.flatMap((e) => normalize(e.name).split(/[^a-z0-9]+/))])];
    const corrected = terms.map((t) => {
      const fixed = correct(t.word, vocabulary);
      return fixed ? lookup(fixed) : t;
    });
    fuzzy = matchAll(corrected);
    if (!fuzzy.length) {
      // Fall back to exercises matching at least one corrected word, best first.
      fuzzy = list
        .map((e) => ({ e, n: corrected.filter((t) => termMatches(t, e, hays.get(e.id)!)).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n || byName(a.e, b.e))
        .map((x) => x.e);
    }
    seeds = fuzzy;
  }

  const exclude = new Set(matches.map((e) => e.id));
  const similar = fuzzy.slice(0, similarLimit);
  similar.forEach((e) => exclude.add(e.id));
  if (similar.length < similarLimit && seeds.length) {
    similar.push(...related(seeds.slice(0, 5), list, exclude, similarLimit - similar.length));
  }
  return { matches, similar };
}

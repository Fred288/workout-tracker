// Parsers for activity files exported from watches and apps: GPX, TCX and FIT. They run
// completely in the browser and need no DOM (plain text scanning, a small binary reader).
// The result is one summary plus laps; nothing here touches the database.

export type ImportSport = 'run' | 'bike' | 'swim' | 'other';

export interface ActivityLap {
  startedAt: number; // epoch ms
  durationSec: number; // moving (timer) time
  distanceM: number;
  avgHr?: number;
  maxHr?: number;
  avgPowerW?: number;
}

export interface ParsedActivity {
  source: 'gpx' | 'tcx' | 'fit';
  sport: ImportSport;
  /** The file did not name a sport, it was guessed from the average speed. */
  sportGuessed: boolean;
  name?: string;
  startedAt: number; // epoch ms
  elapsedSec: number; // wall clock from start to end
  durationSec: number; // moving (timer) time
  distanceM: number;
  avgHr?: number;
  maxHr?: number;
  avgPowerW?: number;
  laps: ActivityLap[];
}

export class ActivityFileError extends Error {}

// ---------------------------------------------------------------- shared helpers

/** Sport from a free text such as "Running", "running", "road_biking". */
export function sportFromText(text: string | undefined): ImportSport | undefined {
  const t = (text ?? '').toLowerCase();
  if (!t) return undefined;
  if (/run|jog|lauf/.test(t)) return 'run';
  if (/bik|cycl|ride|rad/.test(t)) return 'bike';
  if (/swim|schwimm/.test(t)) return 'swim';
  // Strava GPX used numbers for the type: 1 = ride, 9 = run.
  if (t === '9') return 'run';
  if (t === '1') return 'bike';
  return 'other';
}

/** Guess for files without a sport: walking and running pace vs. cycling speed. */
export function guessSport(distanceM: number, durationSec: number): ImportSport {
  if (!(distanceM > 0) || !(durationSec > 0)) return 'other';
  const v = distanceM / durationSec; // m/s
  if (v >= 1.8 && v <= 6.5) return 'run';
  if (v > 6.5 && v <= 20) return 'bike';
  return 'other';
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/** Distance between two points in metres (haversine). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------- XML scanning

const unescapeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Inner content of every `<tag ...>...</tag>` (namespace prefix optional, no nesting of the same tag). */
function elements(xml: string, tag: string): { attrs: string; inner: string }[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}(\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, 'g');
  const out: { attrs: string; inner: string }[] = [];
  for (let m = re.exec(xml); m; m = re.exec(xml)) out.push({ attrs: m[1] ?? '', inner: m[2] });
  return out;
}

function text(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${tag}>`).exec(xml);
  return m ? unescapeXml(m[1].trim()) : undefined;
}

function num(xml: string, tag: string): number | undefined {
  const t = text(xml, tag);
  const n = t === undefined ? NaN : Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(attrs);
  return m ? unescapeXml(m[1]) : undefined;
}

const toMs = (iso: string | undefined) => {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
};

// ---------------------------------------------------------------- GPX

/** Gaps longer than this between two points count as a stop (auto pause) and not as moving time. */
const MAX_MOVING_GAP_SEC = 30;

export function parseGpx(xml: string): ParsedActivity {
  const trk = elements(xml, 'trk')[0]?.inner ?? xml;
  const pts = elements(trk, 'trkpt')
    .map((p) => ({
      lat: Number(attr(p.attrs, 'lat')),
      lon: Number(attr(p.attrs, 'lon')),
      t: toMs(text(p.inner, 'time')),
      hr: num(p.inner, 'hr'),
      power: num(p.inner, 'power') ?? num(p.inner, 'Watts'),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.t !== undefined);
  if (pts.length < 2) throw new ActivityFileError('Die GPX-Datei enthält keine Trackpunkte mit Zeit.');
  pts.sort((a, b) => a.t! - b.t!);

  let distanceM = 0;
  let moving = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t! - pts[i - 1].t!) / 1000;
    distanceM += haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    if (dt <= MAX_MOVING_GAP_SEC) moving += dt;
  }
  const hrs = pts.map((p) => p.hr).filter((x): x is number => x !== undefined && x > 30 && x < 250);
  const powers = pts.map((p) => p.power).filter((x): x is number => x !== undefined && x >= 0);
  const typeText = text(trk, 'type');
  const sportFromFile = sportFromText(typeText);
  const sport = sportFromFile && sportFromFile !== 'other' ? sportFromFile : guessSport(distanceM, moving);
  const elapsedSec = (pts.at(-1)!.t! - pts[0].t!) / 1000;
  const lap: ActivityLap = {
    startedAt: pts[0].t!,
    durationSec: Math.round(moving),
    distanceM: Math.round(distanceM),
    ...(hrs.length ? { avgHr: Math.round(mean(hrs)!), maxHr: Math.max(...hrs) } : {}),
    ...(powers.length ? { avgPowerW: Math.round(mean(powers)!) } : {}),
  };
  return {
    source: 'gpx',
    sport,
    sportGuessed: !sportFromFile || sportFromFile === 'other',
    name: text(trk, 'name'),
    startedAt: pts[0].t!,
    elapsedSec: Math.round(elapsedSec),
    durationSec: lap.durationSec,
    distanceM: lap.distanceM,
    avgHr: lap.avgHr,
    maxHr: lap.maxHr,
    avgPowerW: lap.avgPowerW,
    laps: [lap],
  };
}

// ---------------------------------------------------------------- TCX

export function parseTcx(xml: string): ParsedActivity {
  const activity = elements(xml, 'Activity')[0];
  if (!activity) throw new ActivityFileError('Die TCX-Datei enthält keine Aktivität.');
  const sportText = attr(activity.attrs, 'Sport');
  const laps: ActivityLap[] = elements(activity.inner, 'Lap').map((l) => {
    const watts = elements(l.inner, 'Watts')
      .map((w) => Number(w.inner))
      .filter((x) => Number.isFinite(x) && x >= 0);
    const hr = (tag: string) => {
      const inner = elements(l.inner, tag)[0]?.inner;
      const v = inner ? num(inner, 'Value') : undefined;
      return v !== undefined && v > 30 && v < 250 ? v : undefined;
    };
    return {
      startedAt: toMs(attr(l.attrs, 'StartTime')) ?? NaN,
      durationSec: Math.round(num(l.inner, 'TotalTimeSeconds') ?? 0),
      distanceM: Math.round(num(l.inner, 'DistanceMeters') ?? 0),
      avgHr: hr('AverageHeartRateBpm'),
      maxHr: hr('MaximumHeartRateBpm'),
      ...(watts.length ? { avgPowerW: Math.round(mean(watts)!) } : {}),
    };
  });
  const valid = laps.filter((l) => Number.isFinite(l.startedAt) && l.durationSec > 0);
  if (!valid.length) throw new ActivityFileError('Die TCX-Datei enthält keine Runden mit Zeit.');

  const durationSec = valid.reduce((n, l) => n + l.durationSec, 0);
  const distanceM = valid.reduce((n, l) => n + l.distanceM, 0);
  const hrLaps = valid.filter((l) => l.avgHr !== undefined);
  const hrTime = hrLaps.reduce((n, l) => n + l.durationSec, 0);
  const last = valid.at(-1)!;
  const sportFromFile = sportFromText(sportText);
  return {
    source: 'tcx',
    sport: sportFromFile && sportFromFile !== 'other' ? sportFromFile : guessSport(distanceM, durationSec),
    sportGuessed: !sportFromFile || sportFromFile === 'other',
    name: undefined,
    startedAt: valid[0].startedAt,
    elapsedSec: Math.round((last.startedAt + last.durationSec * 1000 - valid[0].startedAt) / 1000),
    durationSec,
    distanceM,
    avgHr: hrTime ? Math.round(hrLaps.reduce((n, l) => n + l.avgHr! * l.durationSec, 0) / hrTime) : undefined,
    maxHr: hrLaps.length ? Math.max(...valid.map((l) => l.maxHr ?? 0)) || undefined : undefined,
    avgPowerW: (() => {
      const p = valid.filter((l) => l.avgPowerW !== undefined);
      const t = p.reduce((n, l) => n + l.durationSec, 0);
      return t ? Math.round(p.reduce((n, l) => n + l.avgPowerW! * l.durationSec, 0) / t) : undefined;
    })(),
    laps: valid,
  };
}

// ---------------------------------------------------------------- FIT

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31 00:00 UTC). */
const FIT_EPOCH_OFFSET_SEC = 631_065_600;

const FIT_SPORT: Record<number, ImportSport> = { 1: 'run', 2: 'bike', 5: 'swim', 11: 'other' };

interface FieldDef {
  num: number;
  size: number;
  baseType: number;
}
interface MsgDef {
  littleEndian: boolean;
  global: number;
  fields: FieldDef[];
  devBytes: number;
}

/** Reads an integer field; undefined for the "invalid" marker of its base type. */
function readUint(view: DataView, offset: number, size: number, le: boolean): number | undefined {
  if (size === 1) {
    const v = view.getUint8(offset);
    return v === 0xff ? undefined : v;
  }
  if (size === 2) {
    const v = view.getUint16(offset, le);
    return v === 0xffff ? undefined : v;
  }
  if (size === 4) {
    const v = view.getUint32(offset, le);
    return v === 0xffffffff ? undefined : v;
  }
  return undefined;
}

interface FitMsg {
  global: number;
  values: Map<number, number>;
}

function readFitMessages(buffer: ArrayBuffer, wanted: ReadonlySet<number>): FitMsg[] {
  const view = new DataView(buffer);
  if (buffer.byteLength < 14) throw new ActivityFileError('Die FIT-Datei ist zu kurz.');
  const headerSize = view.getUint8(0);
  const sig = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if ((headerSize !== 12 && headerSize !== 14) || sig !== '.FIT') throw new ActivityFileError('Das ist keine gültige FIT-Datei.');
  const end = Math.min(buffer.byteLength, headerSize + view.getUint32(4, true));

  const defs = new Map<number, MsgDef>();
  const out: FitMsg[] = [];
  let pos = headerSize;
  while (pos < end) {
    const header = view.getUint8(pos++);
    if (header & 0x80) {
      // Compressed timestamp header: data message of local type bits 5-6.
      const def = defs.get((header >> 5) & 0x03);
      if (!def) throw new ActivityFileError('Die FIT-Datei ist beschädigt.');
      pos = readData(def, pos);
    } else if (header & 0x40) {
      const hasDev = (header & 0x20) !== 0;
      const le = view.getUint8(pos + 1) === 0;
      const global = view.getUint16(pos + 2, le);
      const n = view.getUint8(pos + 4);
      pos += 5;
      const fields: FieldDef[] = [];
      for (let i = 0; i < n; i++, pos += 3) fields.push({ num: view.getUint8(pos), size: view.getUint8(pos + 1), baseType: view.getUint8(pos + 2) });
      let devBytes = 0;
      if (hasDev) {
        const dn = view.getUint8(pos++);
        for (let i = 0; i < dn; i++, pos += 3) devBytes += view.getUint8(pos + 1);
      }
      defs.set(header & 0x0f, { littleEndian: le, global, fields, devBytes });
    } else {
      const def = defs.get(header & 0x0f);
      if (!def) throw new ActivityFileError('Die FIT-Datei ist beschädigt.');
      pos = readData(def, pos);
    }
  }
  return out;

  function readData(def: MsgDef, start: number): number {
    let p = start;
    const values = new Map<number, number>();
    const keep = wanted.has(def.global);
    for (const f of def.fields) {
      if (p + f.size > end) throw new ActivityFileError('Die FIT-Datei ist abgeschnitten.');
      if (keep) {
        const v = readUint(view, p, f.size, def.littleEndian);
        if (v !== undefined) values.set(f.num, v);
      }
      p += f.size;
    }
    if (keep) out.push({ global: def.global, values });
    return p + def.devBytes;
  }
}

const MSG_SESSION = 18;
const MSG_LAP = 19;

export function parseFit(buffer: ArrayBuffer): ParsedActivity {
  const msgs = readFitMessages(buffer, new Set([MSG_SESSION, MSG_LAP]));
  const toLap = (m: FitMsg, durKey: number): ActivityLap | undefined => {
    const start = m.values.get(2);
    const dur = m.values.get(durKey);
    if (start === undefined || dur === undefined) return undefined;
    const hr = (k: number) => {
      const v = m.values.get(k);
      return v !== undefined && v > 30 && v < 250 ? v : undefined;
    };
    const power = m.values.get(m.global === MSG_SESSION ? 20 : 19);
    return {
      startedAt: (start + FIT_EPOCH_OFFSET_SEC) * 1000,
      durationSec: Math.round(dur / 1000),
      distanceM: Math.round((m.values.get(9) ?? 0) / 100),
      avgHr: hr(m.global === MSG_SESSION ? 16 : 15),
      maxHr: hr(m.global === MSG_SESSION ? 17 : 16),
      ...(power !== undefined && power > 0 && power < 3000 ? { avgPowerW: power } : {}),
    };
  };

  const session = msgs.find((m) => m.global === MSG_SESSION);
  const laps = msgs
    .filter((m) => m.global === MSG_LAP)
    .map((m) => toLap(m, 8))
    .filter((l): l is ActivityLap => !!l && l.durationSec > 0);
  const summary = session ? toLap(session, 8) : undefined;
  if (!summary && !laps.length) throw new ActivityFileError('Die FIT-Datei enthält keine Aktivität mit Zeit.');

  const base: ActivityLap = summary ?? {
    startedAt: laps[0].startedAt,
    durationSec: laps.reduce((n, l) => n + l.durationSec, 0),
    distanceM: laps.reduce((n, l) => n + l.distanceM, 0),
  };
  const elapsed = session?.values.get(7);
  const sportCode = session?.values.get(5);
  const sportFromFile = sportCode !== undefined ? (FIT_SPORT[sportCode] ?? 'other') : undefined;
  return {
    source: 'fit',
    sport: sportFromFile && sportFromFile !== 'other' ? sportFromFile : guessSport(base.distanceM, base.durationSec),
    sportGuessed: !sportFromFile || sportFromFile === 'other',
    startedAt: base.startedAt,
    elapsedSec: elapsed !== undefined ? Math.round(elapsed / 1000) : base.durationSec,
    durationSec: base.durationSec,
    distanceM: base.distanceM,
    avgHr: base.avgHr,
    maxHr: base.maxHr,
    avgPowerW: base.avgPowerW,
    laps: laps.length ? laps : [base],
  };
}

// ---------------------------------------------------------------- entry point

/** Parses a file by its extension. */
export async function parseActivityFile(file: File): Promise<ParsedActivity> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.fit')) return parseFit(await file.arrayBuffer());
  const content = await file.text();
  if (name.endsWith('.gpx')) return parseGpx(content);
  if (name.endsWith('.tcx')) return parseTcx(content);
  throw new ActivityFileError('Nur GPX-, TCX- und FIT-Dateien werden unterstützt.');
}

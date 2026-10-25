import { describe, expect, it } from 'vitest';
import { ActivityFileError, guessSport, haversineM, parseFit, parseGpx, parseTcx, sportFromText } from './activityFiles';

describe('helpers', () => {
  it('maps sport texts', () => {
    expect(sportFromText('Running')).toBe('run');
    expect(sportFromText('trail_running')).toBe('run');
    expect(sportFromText('Biking')).toBe('bike');
    expect(sportFromText('road_cycling')).toBe('bike');
    expect(sportFromText('lap_swimming')).toBe('swim');
    expect(sportFromText('9')).toBe('run');
    expect(sportFromText('yoga')).toBe('other');
    expect(sportFromText(undefined)).toBeUndefined();
  });
  it('guesses the sport from the speed', () => {
    expect(guessSport(10_000, 3000)).toBe('run'); // 3.3 m/s
    expect(guessSport(30_000, 3600)).toBe('bike'); // 8.3 m/s
    expect(guessSport(1000, 3600)).toBe('other'); // walking
    expect(guessSport(0, 100)).toBe('other');
  });
  it('computes distances', () => {
    expect(haversineM(0, 0, 0, 0)).toBe(0);
    expect(haversineM(52.5, 13.4, 52.5, 13.401)).toBeGreaterThan(65);
    expect(haversineM(52.5, 13.4, 52.5, 13.401)).toBeLessThan(75);
  });
});

// 20 points, one every 10 s, 0.0001 deg latitude apart (~11.1 m), plus a 5 min pause.
function gpx(opts: { type?: string; pause?: boolean; hr?: boolean } = {}): string {
  const pts: string[] = [];
  let t = Date.UTC(2026, 9, 20, 7, 0, 0);
  for (let i = 0; i < 20; i++) {
    if (opts.pause && i === 10) t += 300_000;
    pts.push(
      `<trkpt lat="${(52 + i * 0.0001).toFixed(4)}" lon="13.0000"><ele>40</ele><time>${new Date(t).toISOString()}</time>` +
        (opts.hr ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${140 + i}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>` : '') +
        `</trkpt>`,
    );
    t += 10_000;
  }
  return `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Morgenlauf &amp; Kaffee</name>${
    opts.type ? `<type>${opts.type}</type>` : ''
  }<trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}

describe('parseGpx', () => {
  it('computes distance, time and heart rate', () => {
    const a = parseGpx(gpx({ type: 'running', hr: true }));
    expect(a).toMatchObject({ source: 'gpx', sport: 'run', sportGuessed: false, name: 'Morgenlauf & Kaffee' });
    expect(a.startedAt).toBe(Date.UTC(2026, 9, 20, 7, 0, 0));
    expect(a.distanceM).toBeGreaterThan(205);
    expect(a.distanceM).toBeLessThan(215);
    expect(a.elapsedSec).toBe(190);
    expect(a.durationSec).toBe(190);
    expect(a.avgHr).toBe(150); // mean of 140..159 rounded
    expect(a.maxHr).toBe(159);
    expect(a.laps).toHaveLength(1);
  });
  it('leaves a long pause out of the moving time', () => {
    const a = parseGpx(gpx({ pause: true }));
    expect(a.elapsedSec).toBe(490);
    expect(a.durationSec).toBe(180);
  });
  it('guesses the sport when the file has none', () => {
    const a = parseGpx(gpx());
    expect(a.sportGuessed).toBe(true);
    expect(a.avgHr).toBeUndefined();
    // 211 m in 190 s is about 1.1 m/s, i.e. walking
    expect(a.sport).toBe('other');
  });
  it('rejects files without track points', () => {
    expect(() => parseGpx('<gpx><trk></trk></gpx>')).toThrow(ActivityFileError);
  });
});

const tcx = `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
<Activities><Activity Sport="Running"><Id>2026-10-21T06:00:00Z</Id>
<Lap StartTime="2026-10-21T06:00:00Z"><TotalTimeSeconds>600.0</TotalTimeSeconds><DistanceMeters>1800.5</DistanceMeters>
<AverageHeartRateBpm><Value>130</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>140</Value></MaximumHeartRateBpm>
<Track><Trackpoint><Time>2026-10-21T06:00:01Z</Time><HeartRateBpm><Value>120</Value></HeartRateBpm></Trackpoint></Track></Lap>
<Lap StartTime="2026-10-21T06:10:00Z"><TotalTimeSeconds>300.0</TotalTimeSeconds><DistanceMeters>1250</DistanceMeters>
<AverageHeartRateBpm><Value>170</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>178</Value></MaximumHeartRateBpm></Lap>
</Activity></Activities></TrainingCenterDatabase>`;

describe('parseTcx', () => {
  it('reads laps and weights the average heart rate by time', () => {
    const a = parseTcx(tcx);
    expect(a).toMatchObject({ source: 'tcx', sport: 'run', sportGuessed: false, durationSec: 900, distanceM: 3051, maxHr: 178, elapsedSec: 900 });
    expect(a.avgHr).toBe(143); // (130 * 600 + 170 * 300) / 900
    expect(a.laps).toHaveLength(2);
    expect(a.laps[1]).toMatchObject({ durationSec: 300, distanceM: 1250, avgHr: 170 });
    expect(a.startedAt).toBe(Date.UTC(2026, 9, 21, 6, 0, 0));
  });
  it('rejects files without activity or laps', () => {
    expect(() => parseTcx('<x/>')).toThrow(ActivityFileError);
    expect(() => parseTcx('<Activity Sport="Running"></Activity>')).toThrow(ActivityFileError);
  });
});

// ------------------------------------------------------------ FIT builder for tests

type Field = { num: number; size: number; baseType: number; value: number };

function fitFile(messages: { local: number; global: number; fields: Field[]; le?: boolean; dev?: boolean }[]): ArrayBuffer {
  const body: number[] = [];
  const push = (n: number, size: number, le: boolean) => {
    for (let i = 0; i < size; i++) body.push(le ? (n >>> (8 * i)) & 0xff : (n >>> (8 * (size - 1 - i))) & 0xff);
  };
  for (const m of messages) {
    const le = m.le ?? true;
    body.push(0x40 | (m.dev ? 0x20 : 0) | m.local, 0, le ? 0 : 1);
    push(m.global, 2, le);
    body.push(m.fields.length);
    for (const f of m.fields) body.push(f.num, f.size, f.baseType);
    if (m.dev) body.push(1, 0, 4, 0); // one developer field: num 0, size 4, dev index 0
    body.push(m.local);
    for (const f of m.fields) push(f.value, f.size, le);
    if (m.dev) push(0xdeadbeef, 4, le);
  }
  const header = [14, 0x20, 0, 0, 0, 0, 0, 0, 0x2e, 0x46, 0x49, 0x54, 0, 0];
  const size = body.length;
  header[4] = size & 0xff;
  header[5] = (size >> 8) & 0xff;
  header[6] = (size >> 16) & 0xff;
  header[7] = (size >> 24) & 0xff;
  const all = new Uint8Array([...header, ...body, 0, 0]);
  return all.buffer;
}

const u32 = 0x86;
const u16 = 0x84;
const u8 = 0x02;
const FIT_START = Date.UTC(2026, 9, 22, 8, 0, 0) / 1000 - 631_065_600;

const sessionMsg = (le = true, dev = false) => ({
  local: 0,
  global: 18,
  le,
  dev,
  fields: [
    { num: 2, size: 4, baseType: u32, value: FIT_START },
    { num: 5, size: 1, baseType: 0, value: 1 }, // sport: running
    { num: 7, size: 4, baseType: u32, value: 3_700_000 }, // elapsed ms
    { num: 8, size: 4, baseType: u32, value: 3_600_000 }, // timer ms
    { num: 9, size: 4, baseType: u32, value: 1_000_000 }, // 10 km in cm
    { num: 16, size: 1, baseType: u8, value: 152 },
    { num: 17, size: 1, baseType: u8, value: 181 },
    { num: 20, size: 2, baseType: u16, value: 0xffff }, // invalid power
  ],
});
const lapMsg = (start: number, timerMs: number, cm: number, hr: number) => ({
  local: 1,
  global: 19,
  fields: [
    { num: 2, size: 4, baseType: u32, value: start },
    { num: 8, size: 4, baseType: u32, value: timerMs },
    { num: 9, size: 4, baseType: u32, value: cm },
    { num: 15, size: 1, baseType: u8, value: hr },
  ],
});

describe('parseFit', () => {
  it('reads the session summary and laps', () => {
    const a = parseFit(fitFile([sessionMsg(), lapMsg(FIT_START, 1_800_000, 500_000, 150), lapMsg(FIT_START + 1800, 1_800_000, 500_000, 154)]));
    expect(a).toMatchObject({ source: 'fit', sport: 'run', sportGuessed: false, durationSec: 3600, elapsedSec: 3700, distanceM: 10_000, avgHr: 152, maxHr: 181 });
    expect(a.avgPowerW).toBeUndefined();
    expect(a.startedAt).toBe(Date.UTC(2026, 9, 22, 8, 0, 0));
    expect(a.laps.map((l) => [l.durationSec, l.distanceM, l.avgHr])).toEqual([[1800, 5000, 150], [1800, 5000, 154]]);
  });
  it('reads big endian files and skips developer fields', () => {
    const a = parseFit(fitFile([sessionMsg(false, true)]));
    expect(a.distanceM).toBe(10_000);
    expect(a.durationSec).toBe(3600);
    expect(a.laps).toHaveLength(1);
  });
  it('falls back to laps without a session message', () => {
    const a = parseFit(fitFile([lapMsg(FIT_START, 600_000, 200_000, 140), lapMsg(FIT_START + 600, 600_000, 200_000, 150)]));
    expect(a.durationSec).toBe(1200);
    expect(a.distanceM).toBe(4000);
    expect(a.sport).toBe('run'); // guessed: 3.3 m/s
    expect(a.sportGuessed).toBe(true);
  });
  it('rejects broken input', () => {
    expect(() => parseFit(new ArrayBuffer(5))).toThrow(ActivityFileError);
    expect(() => parseFit(new Uint8Array(30).buffer)).toThrow(ActivityFileError);
    expect(() => parseFit(fitFile([]))).toThrow(ActivityFileError);
    const truncated = fitFile([sessionMsg()]).slice(0, 40);
    expect(() => parseFit(truncated)).toThrow();
  });
});

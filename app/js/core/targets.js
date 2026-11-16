// Weapon targets (wpntarget_n of the DTC): objectives of the campaign and their features (buildings), read from the BMS install.
// Objective centre: CampObjData.XML (PositionX = north ft, PositionY = east ft). Features of an objective: ObjectiveRelatedData/OCD_nnnnn/FED_nnnnn.XML,
// each with an offset from the centre (OffsetY = north ft, OffsetX = east ft, checked against a file saved by WDP to 0.5 ft); its name is
// FeatureCtIdx -> CT EntityIdx -> Falcon4_FCD.xml Name. The ini line is "north, east, -elevation, -1, <objective name> <feature name>".
export const OBJ_TYPES = {
  0: 'SAM site',
  1: 'Airbase',
  2: 'AirStrip',
  3: 'ArmyBase',
  4: 'Beach',
  5: 'Border',
  6: 'Bridge',
  7: 'Chemical',
  8: 'City',
  9: 'Com Control',
  10: 'Depot',
  11: 'Factory',
  12: 'Fort',
  13: 'Fortification',
  14: 'Scenery',
  15: 'Intersection',
  16: 'Nav Beacon',
  17: 'Nuclear',
  18: 'Pass',
  19: 'Port',
  20: 'Power Plant',
  21: 'Radar',
  22: 'Radio Tower',
  23: 'Rail Terminal',
  24: 'Railroad',
  25: 'Refinery',
  26: 'Road',
  27: 'Sea',
  28: 'Town',
  29: 'Village',
  30: 'Harts',
  31: 'SAM / AAA site',
};
const tag = (b, k) => {
  const q = b.match(new RegExp('<' + k + '>([^<]*)<'));
  return q ? q[1] : '';
};
const decode = s =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
export const pad5 = n => String(n).padStart(5, '0');
export const fedPath = n => `ObjectiveRelatedData/OCD_${pad5(n)}/FED_${pad5(n)}.XML`;
export const phdPath = n => `ObjectiveRelatedData/OCD_${pad5(n)}/PHD_${pad5(n)}.XML`;
export const pdxPath = n => `ObjectiveRelatedData/OCD_${pad5(n)}/PDX_${pad5(n)}.XML`;
export const ocdPath = n => `ObjectiveRelatedData/OCD_${pad5(n)}/OCD_${pad5(n)}.XML`;
// CampObjData.XML -> [{id, name, ocd, n, e}]
export const parseObjectives = xml =>
  [...xml.matchAll(/<CampObj CampId="(\d+)">([\s\S]*?)<\/CampObj>/g)].map(m => ({
    id: +m[1],
    name: decode(tag(m[2], 'CampName')).trim(),
    ocd: +tag(m[2], 'OcdIndex'),
    n: +tag(m[2], 'PositionX'),
    e: +tag(m[2], 'PositionY'),
  }));
// OCD_nnnnn.XML -> class table number of the objective
export const parseOcdCt = xml => {
  const v = tag(xml, 'CtIdx');
  return v === '' ? -1 : +v;
};
// Falcon4_FCD.xml -> {number: name}
export function parseFcdNames(xml) {
  const o = {};
  for (const m of xml.matchAll(/<FCD Num="(\d+)">([\s\S]*?)<\/FCD>/g)) o[m[1]] = decode(tag(m[2], 'Name')).trim();
  return o;
}
// Falcon4_FCD.xml -> {number: [RadarIdx, Det_LowAir km]}: the radar of a feature (fixed radar stations, control towers ...)
export function parseFcdRadar(xml) {
  const o = {};
  for (const m of xml.matchAll(/<FCD Num="(\d+)">([\s\S]*?)<\/FCD>/g))
    o[m[1]] = [+tag(m[2], 'RadarIdx') || 0, +tag(m[2], 'Det_LowAir') || 0, +tag(m[2], 'Det_Air') || 0];
  return o;
}
// the radar features of an objective: [{k (index in the feature list), n, e (ft), det (km)}] for features that have a radar and a detection range of at least minKm
export const radarFeatures = (obj, fed, ct, fcdR, minKm = 30) =>
  fed
    .map((f, k) => {
      const r = fcdR[(ct[f.ct] || [])[4]] || [0, 0];
      return { k, n: obj.n + f.dn, e: obj.e + f.de, det: r[1], detAir: r[2] || r[1], radar: r[0] };
    })
    .filter(f => f.radar > 0 && Math.max(f.det, f.detAir) >= minKm);
// FED_nnnnn.XML -> [{i, ct, value, dn, de}] with dn / de = offset north / east in ft from the objective centre
export const parseFed = xml =>
  [...xml.matchAll(/<FED Num="(\d+)">([\s\S]*?)<\/FED>/g)].map(m => ({
    i: +m[1],
    ct: +tag(m[2], 'FeatureCtIdx'),
    value: +tag(m[2], 'Value'),
    dn: +tag(m[2], 'OffsetY'),
    de: +tag(m[2], 'OffsetX'),
  }));
// the features of an objective with their name and position; `ct` is the table of parseCt (entityIdx at [4]), `fcd` the one of parseFcdNames
export const featuresOf = (obj, fed, ct, fcd) =>
  fed.map(f => ({
    i: f.i,
    name: fcd[(ct[f.ct] || [])[4]] || '#' + f.ct,
    value: f.value,
    n: obj.n + f.dn,
    e: obj.e + f.de,
  }));
// ini value of a target; empty slot when `t` is null
export const targetLine = (t, old) => {
  if (!t) return '0.000000, 0.000000, 0.000000, -1, Not set';
  const f = (old || '').split(',').map(x => x.trim());
  return `${t.n.toFixed(6)}, ${t.e.toFixed(6)}, ${(-t.elv).toFixed(6)}, ${f[3] !== undefined && f[3] !== '' && f[4] !== 'Not set' ? f[3] : '-1'}, ${t.name}`;
};
// a line of the ini -> {n, e, elv, name} or null when the slot is empty
export function readTarget(v) {
  const p = String(v)
    .split(',')
    .map(x => x.trim());
  if (p.length < 5) return null;
  if (p[4] === 'Not set' && +p[0] === 0 && +p[1] === 0) return null;
  return { n: +p[0], e: +p[1], elv: Math.round(-p[2]), name: p.slice(4).join(', ') };
}

// The runways and taxiways of an airbase from its point files (PHD / PDX: offsets in ft, OffsetX east, OffsetY north, from the centre of the objective):
// the four corners of each runway (header and points of Type 8, as bmsdata/runways.js), the numbers of its ends (the landing headers, Type 1: Data = heading)
// and the taxi paths (runs of points of Type 2-4, takeoff and taxi, one after another in a header, never more than 2,500 ft apart: approximate).
// -> {rwy: [{c: [[n, e] x4], ends: [{n, dir}]}], taxi: [[[n, e], ...]]} in ft on the ground
export function parseAirfield(phdXml, pdxXml, obj) {
  const tg = (b, k) => {
      const q = b.match(new RegExp('<' + k + '>([^<]*)<'));
      return q ? q[1].trim() : '';
    },
    pts = [...String(pdxXml).matchAll(/<PD Num="(\d+)">([\s\S]*?)<\/PD>/g)].map(m => ({
      n: obj.n + +tg(m[2], 'OffsetY'),
      e: obj.e + +tg(m[2], 'OffsetX'),
      t: +tg(m[2], 'Type'),
    })),
    H = [...String(phdXml).matchAll(/<PHD Num="(\d+)">([\s\S]*?)<\/PHD>/g)].map(m => ({
      t: +tg(m[2], 'Type'),
      rw: +tg(m[2], 'RunwayNumber'),
      dir: +tg(m[2], 'Data'),
      first: +tg(m[2], 'FirstPtIdx'),
      count: +tg(m[2], 'PointCount'),
    })),
    rwy = [],
    taxi = [];
  for (const h of H) {
    const P = pts.slice(h.first, h.first + h.count);
    if (h.t === 8) {
      const c = P.filter(p => p.t === 8);
      if (c.length !== 4) continue;
      // the corners in order around the centre
      const cn = c.reduce((a, p) => a + p.n, 0) / 4,
        ce = c.reduce((a, p) => a + p.e, 0) / 4;
      c.sort((a, b) => Math.atan2(a.n - cn, a.e - ce) - Math.atan2(b.n - cn, b.e - ce));
      const ends = H.filter(x => x.t === 1 && x.rw === h.rw).map(x => ({
        n: Math.round(x.dir / 10 + 0.01) % 36 || 36,
        dir: x.dir,
      }));
      rwy.push({ c: c.map(p => [p.n, p.e]), ends: ends.filter((x, i) => ends.findIndex(y => y.n === x.n) === i) });
      continue;
    }
    let run = [];
    const flush = () => {
      if (run.length >= 2) taxi.push(run);
      run = [];
    };
    for (const p of P) {
      if (p.t < 2 || p.t > 4) {
        flush();
        continue;
      }
      const q = run[run.length - 1];
      if (q && Math.hypot(q[0] - p.n, q[1] - p.e) > 2500) flush();
      run.push([p.n, p.e]);
    }
    flush();
  }
  return { rwy, taxi };
}

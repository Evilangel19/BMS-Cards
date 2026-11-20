// @ts-check
// DTC steerpoints on the map: reads and writes the [STPT] section of the DTC .ini (a list of lines, see parsers/dtc.js).
// Positions in the ini are feet: north, east (origin = south-west corner of the theater, 1 campaign km = 3280.84 ft).
// Groups handled (the other steerpoints are not in the ini or are not editable here):
//   prec  STPT 81-99  target_80 .. target_98     "north, east, -altitude, type, name"
//   ppt   STPT 56-70  ppt_0 ...                  "north, east, 0, range (ft), name"   (pre-planned threats: name = threat, range = ring)
//   line  STPT 31-54  lineSTPT_0 .. lineSTPT_23  "north, east, 0"   F-16: 4 lines (LINE1-4) of up to 6 consecutive steerpoints each:
//         LINE n uses rows 6(n-1) .. 6(n-1)+5
//   sit   F-15 SIT lines 6-12 (BMS 4.38.2), [F15_SIT_LINES] SITLINE_<n>_<i> "north, east", 30 points each (i 0-29), an empty point = a break; with their
//         looks SITLINE_<n>_NAME / _ENABLED / _COLORHEX (or _COLORIDX) / _DASHOPT for the lines 1-12 (1-4 the STPT lines, 5 the PPT rings)
import { toAscii } from './ascii.js';
export const FT_KM = 3280.84,
  FT_NM = 6076.12;
export const GROUPS = {
  prec: { label: 'Precision target', first: 81, key: 'target_', base: 80, n: 19, layer: 'dp' },
  ppt: { label: 'Pre-planned', first: 56, key: 'ppt_', base: 0, n: 15, layer: 'dq' },
  line: { label: 'Geo line point', first: 31, key: 'lineSTPT_', base: 0, n: 24, layer: 'dl' },
  sit: { label: 'SIT line point', first: 0, key: 'SITLINE_', base: 0, n: 210, layer: 'ds', sec: 'F15_SIT_LINES' },
};
// the ranges as written on the screen ("81-99"), always taken from GROUPS (the SIT lines 6-12 are not steerpoints)
export const STPT_RANGE = Object.fromEntries(
  Object.entries(GROUPS)
    .filter(([, G]) => !G.sec)
    .map(([g, G]) => [g, G.first + '-' + (G.first + G.n - 1)])
);
// the F-15 SIT lines: 1-4 the STPT lines, 5 the PPT rings (looks only), 6-12 the lines of [F15_SIT_LINES] (30 points)
export const SIT_SEC = 'F15_SIT_LINES',
  SIT_FIRST = 6,
  SIT_LAST = 12,
  SIT_LEN = 30;
export const secOf = g => (GROUPS[g] && GROUPS[g].sec) || 'STPT';
// the names BMS gives them, the dash styles, the colour indexes (the F-15 SIT Lines Editor of BMS: its palette, the first entries)
export const SIT_NAMES = {
  5: 'PPT',
  6: 'ECOAST',
  7: 'WCOAST',
  8: 'FEZ',
  9: 'MISC',
  10: 'KILL',
  11: 'HAZARD',
  12: 'RESTRICTED',
};
export const SIT_DASH = ['Solid', 'XL dash', 'L dash', 'M dash', 'Dotted'];
export const SIT_DASH_PX = [null, [24, 24], [12, 12], [7, 7], [4, 4]];
export const SIT_IDX = [
  'FF0000',
  'FFFFFF',
  '00FF00',
  'FFFF00',
  '00FFFF',
  'FF66FF',
  '0000CC',
  '808080',
  '66FF33',
  'D9D9D9',
  '595959',
  '000000',
  '33CC33',
];
export const SIT_QUICK = ['FFFFFF', 'FF0000', '44E6EE', '00FF00', 'FFFF00', 'FF66FF', 'F59E0B'];
// a line number (1-4, 6-12): its group, its first slot, its length
export const lineSpec = n =>
  n <= LINES
    ? { g: 'line', a: (n - 1) * LINE_LEN, len: LINE_LEN }
    : { g: 'sit', a: (n - SIT_FIRST) * SIT_LEN, len: SIT_LEN };
export const lineNo = p =>
  p.group == 'sit' ? SIT_FIRST + Math.floor(p.slot / SIT_LEN) : Math.floor(p.slot / LINE_LEN) + 1;
export const lineName = (n, meta) => (meta && meta[n] && meta[n].name) || SIT_NAMES[n] || 'LINE' + n;
/** the looks of the SIT lines 1-12 in the DTC lines: {n: {name, on, hex, dash}} (name '' = the BMS one) */
export function sitMeta(lines) {
  const by = new Map();
  (lines || []).forEach(l => {
    if (l.s == SIT_SEC && l.k !== undefined) by.set(l.k.toUpperCase(), String(l.v).trim());
  });
  const o = {};
  for (let n = 1; n <= SIT_LAST; n++) {
    const g = k => by.get('SITLINE_' + n + '_' + k),
      hx = /^#?([0-9a-f]{6})$/i.exec(g('COLORHEX') || ''),
      ix = parseInt(g('COLORIDX'), 10),
      d = parseInt(g('DASHOPT'), 10);
    o[n] = {
      n,
      name: g('NAME') || '',
      on: g('ENABLED') !== '0',
      hex: hx ? hx[1].toUpperCase() : SIT_IDX[ix >= 0 && ix < SIT_IDX.length ? ix : 1],
      dash: d >= 0 && d <= 4 ? d : 0,
    };
  }
  return o;
}
/** the keys and values to write for a change of the looks of line n: [[key, value]] (the colour as COLORHEX, as the editor of BMS writes it) */
export function sitMetaRows(n, patch) {
  const o = [],
    p = patch || {};
  if (p.name !== undefined)
    o.push([
      'SITLINE_' + n + '_NAME',
      toAscii(
        String(p.name)
          .replace(/[\r\n=]/g, ' ')
          .trim()
      ).slice(0, 16) ||
        SIT_NAMES[n] ||
        'LINE ' + n,
    ]);
  if (p.on !== undefined) o.push(['SITLINE_' + n + '_ENABLED', p.on ? '1' : '0']);
  if (p.hex !== undefined && /^[0-9a-f]{6}$/i.test(p.hex)) o.push(['SITLINE_' + n + '_COLORHEX', p.hex.toUpperCase()]);
  if (p.dash !== undefined) o.push(['SITLINE_' + n + '_DASHOPT', String(Math.max(0, Math.min(4, p.dash | 0)))]);
  return o;
}
// weapon targets of the DTC (wpntarget_0 ... wpntarget_99)
export const WT_N = 100;
export const LINE_LEN = 6,
  LINES = 4;
// What BMS keeps of a campaign / Tactical Engagement DTC (<name>.ini; the same for both, checked on files BMS wrote: a Korea campaign of an add-on theater and two TEs): [MISSION] title= and the [STPT] data only, in this order (checked on a file written by BMS):
// target_0-23, target_80-98, ppt_0-14, lineSTPT_0-23, wpntarget_0-99. A DTC has more (MFD pages, COMMS...), none of it goes into these files.
/** @type {[string, number[][], string][]} */
const BMS_STPT = [
  [
    'target_',
    [
      [0, 23],
      [80, 98],
    ],
    '0.000000, 0.000000, 0.000000, -1, Not set',
  ],
  ['ppt_', [[0, GROUPS.ppt.n - 1]], '0.000000, 0.000000, 0.000000, 0.000000,'],
  ['lineSTPT_', [[0, 23]], '0.000000, 0.000000, 0.000000'],
  ['wpntarget_', [[0, WT_N - 1]], '0.000000, 0.000000, 0.000000, -1, Not set'],
];
export const bmsStptKeys = () =>
  BMS_STPT.flatMap(([p, rs, e]) =>
    rs.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => [p + (a + i), e]))
  );
export const bmsStptKey = k => {
  const m = /^(target_|ppt_|lineSTPT_|wpntarget_)(\d+)$/.exec(k || '');
  return !!m && BMS_STPT.some(([p, rs]) => p == m[1] && rs.some(([a, b]) => +m[2] >= a && +m[2] <= b));
};
// The route of the flight: target_0-23 (STPT 1-24) as BMS writes them ("north, east, -altitude, action, Not set"; an unused row is the empty line), and target_24 (STPT 25) = the bullseye.
// BMS keeps the ground elevation as the altitude; here it is the altitude of the flight plan (the campaign has no terrain heights), 0 on the ground.
export const ROUTE_N = 25;
export const isRouteKey = k => {
  const m = /^target_(\d+)$/.exec(k || '');
  return !!m && +m[1] < ROUTE_N;
};
/** @returns {[string, string][]|null} the 25 rows [key, value] for a flight of a campaign, null when the flight has no plan */
export function routeRows(C, f) {
  if (!C || !f || !Array.isArray(f.wps) || !f.wps.length) return null;
  /** @type {[string, string][]} */
  const rows = [];
  for (let i = 0; i < 24; i++) {
    const p = f.wps[i];
    rows.push([
      'target_' + i,
      p
        ? [f6(p.y * FT_KM), f6(p.x * FT_KM), f6(p.z ? -p.z * 10 : 0), p.act | 0, 'Not set'].join(', ')
        : '0.000000, 0.000000, 0.000000, -1, Not set',
    ]);
  }
  rows.push([
    'target_24',
    C.bull
      ? [f6(C.bull.y * FT_KM), f6(C.bull.x * FT_KM), f6(0), 0, 'Not set'].join(', ')
      : '0.000000, 0.000000, 0.000000, -1, Not set',
  ]);
  return rows;
}
// the sections of a campaign / TE file that BMS Cards does not write ([F15_SIT_LINES] of the F-15 SIT Lines Editor, ...): kept as they are, after [STPT]
export function extraSections(text, skip) {
  const o = [];
  let keep = false;
  String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .forEach(l => {
      const h = /^\s*\[(.+?)\]/.exec(l);
      if (h) keep = !/^(MISSION|STPT)$/i.test(h[1].trim()) && !(skip && skip.test(h[1].trim()));
      if (keep) o.push(l);
    });
  while (o.length && !o[o.length - 1].trim()) o.pop();
  return o;
}
/** @param {string} title @param {any[]} lines @param {string} [old] the file as it is now: its other sections stay; the F-15 SIT lines of the DTC, when it
 * has them, take the place of those of the file (BMS 4.38.2 reads them from the campaign file too) */
export function campaignIni(title, lines, old) {
  const sit = (lines || []).filter(l => l.s == SIT_SEC && l.k !== undefined),
    sitRows = sit.length ? ['[' + SIT_SEC + ']', ...sit.map(l => l.k + '=' + String(l.v))] : [];
  const by = new Map();
  (lines || []).forEach(l => {
    if (l.s == 'STPT' && l.k !== undefined) by.set(l.k, l.dirty || l.v !== undefined ? String(l.v) : '');
  });
  return (
    [
      '[MISSION]',
      'title=' + toAscii(title),
      '[STPT]',
      ...bmsStptKeys().flatMap(([k, e]) => {
        const o = [k + '=' + (by.has(k) ? by.get(k) : e)];
        // the bullseye row follows the route only when the DTC has it (BMS files do not)
        if (k == 'target_23' && by.has('target_24')) o.push('target_24=' + by.get('target_24'));
        return o;
      }),
      ...extraSections(old, sit.length ? /^F15_SIT_LINES$/i : null),
      ...sitRows,
    ].join('\r\n') + '\r\n'
  );
}
export const lineOf = slot => Math.floor(slot / LINE_LEN) + 1;
export const dtcKey = (g, slot) =>
  g == 'sit'
    ? 'SITLINE_' + (SIT_FIRST + Math.floor(slot / SIT_LEN)) + '_' + (slot % SIT_LEN)
    : GROUPS[g].key + (GROUPS[g].base + slot);
const f6 = v => (+v).toFixed(6);
export const dtcEmpty = g =>
  g == 'prec'
    ? '0.000000, 0.000000, 0.000000, -1, Not set'
    : g == 'ppt'
      ? '0.000000, 0.000000, 0.000000, 0.000000,'
      : g == 'sit'
        ? '0.000000, 0.000000'
        : '0.000000, 0.000000, 0.000000';
const fields = v => {
  const p = String(v || '')
    .split(',')
    .map(x => x.trim());
  return {
    n: +p[0] || 0,
    e: +p[1] || 0,
    z: +p[2] || 0,
    p3: p[3] === undefined ? '' : p[3],
    name: p.slice(4).join(',').trim(),
  };
};
// All points of the three groups: {group, slot, key, stpt, x, y (campaign km), altFt, name, rngNm, empty}. null when the file has no [STPT] section.
export function dtcPoints(lines) {
  if (!lines || !lines.some(l => l.s == 'STPT' && l.k !== undefined)) return null;
  const by = new Map();
  lines.forEach(l => {
    if (l.s == 'STPT' && l.k !== undefined) by.set(l.k, l.v);
  });
  const sit = new Map();
  lines.forEach(l => {
    if (l.s == SIT_SEC && l.k !== undefined) sit.set(l.k.toUpperCase(), l.v);
  });
  const out = {};
  for (const g of Object.keys(GROUPS)) {
    const G = GROUPS[g],
      src = g == 'sit' ? sit : by;
    out[g] = [];
    for (let i = 0; i < G.n; i++) {
      const k = dtcKey(g, i),
        kk = g == 'sit' ? k.toUpperCase() : k;
      if (!src.has(kk)) continue;
      const f = fields(src.get(kk));
      out[g].push({
        group: g,
        slot: i,
        key: k,
        stpt: g == 'sit' ? 0 : G.first + i,
        x: f.e / FT_KM,
        y: f.n / FT_KM,
        altFt: Math.round(-f.z) || 0,
        empty: f.n == 0 && f.e == 0,
        name: g == 'line' || g == 'sit' || /^not set$/i.test(f.name) ? '' : f.name,
        rngNm: g == 'ppt' ? (+f.p3 > 1000 ? +f.p3 / FT_NM : 0) : 0,
      });
    }
  }
  return out;
}
// New ini value for a slot: the old value with the given changes {x, y (km), altFt, name, rngNm} applied (unknown fields are kept)
export function dtcValue(g, old, patch) {
  const f = fields(old),
    o = patch || {};
  const n = o.y !== undefined ? o.y * FT_KM : f.n,
    e = o.x !== undefined ? o.x * FT_KM : f.e,
    z = o.altFt !== undefined ? -o.altFt : f.z;
  const name =
    o.name !== undefined
      ? String(o.name)
          .replace(/[\r\n,]/g, ' ')
          .trim()
      : f.name;
  if (g == 'line') return [f6(n), f6(e), f6(z)].join(', ');
  if (g == 'sit') return [f6(n), f6(e)].join(', ');
  if (g == 'prec') return [f6(n), f6(e), f6(z), f.p3 === '' ? '-1' : f.p3, name || 'Not set'].join(', ');
  const rng =
    o.rngNm !== undefined
      ? f6(o.rngNm > 0 ? o.rngNm * FT_NM : 0.1)
      : f.p3 === '' || f.p3 === '0.000000'
        ? '0.100000'
        : f.p3;
  return [f6(n), f6(e), f6(z), rng, name].join(', ');
}
// First free slot of a group (TGT steerpoints: the last free one); for lines (line = 1..4): the slot after the last used one of that line, -1 when the line already has 6 points
export function freeSlot(pts, g, line) {
  const G = GROUPS[g],
    used = new Set((pts[g] || []).filter(p => !p.empty).map(p => p.slot));
  if (g == 'line' || g == 'sit') {
    const { a, len } = lineSpec(g == 'sit' && line < SIT_FIRST ? SIT_FIRST : line);
    let last = a - 1;
    for (let i = a; i < a + len; i++) if (used.has(i)) last = i;
    return last + 1 < a + len ? last + 1 : -1;
  }
  // TGT steerpoints are filled from the last one (STPT 99, 98, ...): 98 / 99 are the ones the datacard uses as secondary / primary
  if (g == 'prec') {
    for (let i = G.n - 1; i >= 0; i--) if (!used.has(i)) return i;
    return -1;
  }
  for (let i = 0; i < G.n; i++) if (!used.has(i)) return i;
  return -1;
}
// The lines: [{line: 1..4 (and 6..12 with pts.sit), pts: [point, ...]}] (runs of consecutive used rows inside each line), empty lines left out
export function dtcLines(pts) {
  const out = [];
  for (const n of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]) {
    const { g, a, len } = lineSpec(n),
      rows = (pts[g] || []).filter(p => !p.empty && p.slot >= a && p.slot < a + len).sort((x, y) => x.slot - y.slot);
    let cur = null,
      prev = -2;
    rows.forEach(p => {
      if (p.slot != prev + 1) {
        cur = { line: n, pts: [] };
        out.push(cur);
      }
      cur.pts.push(p);
      prev = p.slot;
    });
  }
  return out;
}
// "N 37° 05.123'  E 127° 01.000'" or "37.0853 127.0167" -> [lat, lon] or null
export function parseLL(str) {
  const t = String(str || '')
    .toUpperCase()
    .replace(/[°'′"″,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let m = t.match(/^([NS]) ?(\d+) (\d+(?:\.\d+)?) ([EW]) ?(\d+) (\d+(?:\.\d+)?)$/);
  if (m) return [(m[1] == 'S' ? -1 : 1) * (+m[2] + +m[3] / 60), (m[4] == 'W' ? -1 : 1) * (+m[5] + +m[6] / 60)];
  m = t.match(/^(-?\d+(?:\.\d+)?) ?N? (-?\d+(?:\.\d+)?) ?E?$/);
  return m ? [+m[1], +m[2]] : null;
}
// Delete a point: its row is emptied; in a line the following points of the same line move up one row so the line stays in one piece.
// set(g, slot, patch) and clear(g, slot) write to the DTC.
export function removePoint(pts, g, slot, set, clear) {
  if (g == 'sit') return sitShift(pts, slot, -1, set, clear);
  if (g != 'line') return clear(g, slot);
  const at = i => (pts.line || []).find(r => r.slot == i),
    end = lineOf(slot) * LINE_LEN - 1;
  let i = slot;
  for (; i < end && at(i + 1) && !at(i + 1).empty; i++) {
    const n = at(i + 1);
    set('line', i, { x: n.x, y: n.y, altFt: n.altFt });
  }
  clear('line', i);
}
// SIT lines 6-12: the points after `slot` move up one (dir -1: the point at slot is deleted) or down one (dir +1: room at slot + 1, empty = a break,
// filled with `put` when given); the breaks move with them. false when the line is full (no room to move down).
export function sitShift(pts, slot, dir, set, clear, put) {
  const n = SIT_FIRST + Math.floor(slot / SIT_LEN),
    a = (n - SIT_FIRST) * SIT_LEN,
    end = a + SIT_LEN - 1,
    at = i => (pts.sit || []).find(r => r.slot == i),
    used = i => !!at(i) && !at(i).empty;
  let last = slot;
  for (let i = a; i <= end; i++) if (used(i)) last = Math.max(last, i);
  const cp = (to, from) => (used(from) ? set('sit', to, { x: at(from).x, y: at(from).y }) : clear('sit', to));
  if (dir < 0) {
    for (let i = slot; i < last; i++) cp(i, i + 1);
    clear('sit', last);
    return true;
  }
  if (last >= end) return false;
  for (let i = last + 1; i > slot + 1; i--) cp(i, i - 1);
  if (put) set('sit', slot + 1, put);
  else clear('sit', slot + 1);
  return true;
}

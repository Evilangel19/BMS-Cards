// DTC steerpoints on the map: reads and writes the [STPT] section of the DTC .ini (a list of lines, see parsers/dtc.js).
// Positions in the ini are feet: north, east (origin = south-west corner of the theater, 1 campaign km = 3280.84 ft).
// Groups handled (the other steerpoints are not in the ini or are not editable here):
//   prec  STPT 81-99  target_80 .. target_98     "north, east, -altitude, type, name"
//   ppt   STPT 56-80  ppt_0 ...                  "north, east, 0, range (ft), name"   (pre-planned threats: name = threat, range = ring)
//   line  STPT 31-54  lineSTPT_0 .. lineSTPT_23  "north, east, 0"   F-16: 4 lines (LINE1-4) of up to 6 consecutive steerpoints each:
//         LINE n uses rows 6(n-1) .. 6(n-1)+5
export const FT_KM = 3280.84, FT_NM = 6076.12;
export const GROUPS = {
  prec: {label: 'Precision target', first: 81, key: 'target_', base: 80, n: 19, layer: 'dp'},
  ppt: {label: 'Pre-planned', first: 56, key: 'ppt_', base: 0, n: 25, layer: 'dq'},
  line: {label: 'Geo line point', first: 31, key: 'lineSTPT_', base: 0, n: 24, layer: 'dl'}};
export const LINE_LEN = 6, LINES = 4;
export const lineOf = slot => Math.floor(slot / LINE_LEN) + 1;
export const dtcKey = (g, slot) => GROUPS[g].key + (GROUPS[g].base + slot);
const f6 = v => (+v).toFixed(6);
export const dtcEmpty = g => g == 'prec' ? '0.000000, 0.000000, 0.000000, -1, Not set' : g == 'ppt' ? '0.000000, 0.000000, 0.000000, 0.000000,' : '0.000000, 0.000000, 0.000000';
const fields = v => { const p = String(v || '').split(',').map(x => x.trim()); return {n: +p[0] || 0, e: +p[1] || 0, z: +p[2] || 0, p3: p[3] === undefined ? '' : p[3], name: p.slice(4).join(',').trim()}; };
// All points of the three groups: {group, slot, key, stpt, x, y (campaign km), altFt, name, rngNm, empty}. null when the file has no [STPT] section.
export function dtcPoints(lines) {
  if (!lines || !lines.some(l => l.s == 'STPT' && l.k !== undefined)) return null;
  const by = new Map(); lines.forEach(l => { if (l.s == 'STPT' && l.k !== undefined) by.set(l.k, l.v); });
  const out = {};
  for (const g of Object.keys(GROUPS)) {
    const G = GROUPS[g]; out[g] = [];
    for (let i = 0; i < G.n; i++) {
      const k = dtcKey(g, i); if (!by.has(k)) continue;
      const f = fields(by.get(k));
      out[g].push({group: g, slot: i, key: k, stpt: G.first + i, x: f.e / FT_KM, y: f.n / FT_KM, altFt: Math.round(-f.z) || 0, empty: f.n == 0 && f.e == 0,
        name: g == 'line' || /^not set$/i.test(f.name) ? '' : f.name, rngNm: g == 'ppt' ? (+f.p3 > 1000 ? +f.p3 / FT_NM : 0) : 0});
    }
  }
  return out;
}
// New ini value for a slot: the old value with the given changes {x, y (km), altFt, name, rngNm} applied (unknown fields are kept)
export function dtcValue(g, old, patch) {
  const f = fields(old), o = patch || {};
  const n = o.y !== undefined ? o.y * FT_KM : f.n, e = o.x !== undefined ? o.x * FT_KM : f.e, z = o.altFt !== undefined ? -o.altFt : f.z;
  const name = o.name !== undefined ? String(o.name).replace(/[\r\n,]/g, ' ').trim() : f.name;
  if (g == 'line') return [f6(n), f6(e), f6(z)].join(', ');
  if (g == 'prec') return [f6(n), f6(e), f6(z), f.p3 === '' ? '-1' : f.p3, name || 'Not set'].join(', ');
  const rng = o.rngNm !== undefined ? f6(o.rngNm > 0 ? o.rngNm * FT_NM : 0.1) : (f.p3 === '' || f.p3 === '0.000000' ? '0.100000' : f.p3);
  return [f6(n), f6(e), f6(z), rng, name].join(', ');
}
// First free slot of a group (TGT steerpoints: the last free one); for lines (line = 1..4): the slot after the last used one of that line, -1 when the line already has 6 points
export function freeSlot(pts, g, line) {
  const G = GROUPS[g], used = new Set((pts[g] || []).filter(p => !p.empty).map(p => p.slot));
  if (g == 'line') {
    const a = (line - 1) * LINE_LEN; let last = a - 1; for (let i = a; i < a + LINE_LEN; i++) if (used.has(i)) last = i;
    return last + 1 < a + LINE_LEN ? last + 1 : -1;
  }
  // TGT steerpoints are filled from the last one (STPT 99, 98, ...): 98 / 99 are the ones the datacard uses as secondary / primary
  if (g == 'prec') { for (let i = G.n - 1; i >= 0; i--) if (!used.has(i)) return i; return -1; }
  for (let i = 0; i < G.n; i++) if (!used.has(i)) return i;
  return -1;
}
// The lines: [{line: 1..4, pts: [point, ...]}] (runs of consecutive used rows inside each line's 6 rows), empty lines left out
export function dtcLines(pts) {
  const out = [];
  for (let n = 1; n <= LINES; n++) {
    const a = (n - 1) * LINE_LEN, rows = (pts.line || []).filter(p => !p.empty && p.slot >= a && p.slot < a + LINE_LEN).sort((x, y) => x.slot - y.slot); let cur = null, prev = -2;
    rows.forEach(p => { if (p.slot != prev + 1) { cur = {line: n, pts: []}; out.push(cur); } cur.pts.push(p); prev = p.slot; });
  }
  return out;
}
// "N 37° 05.123'  E 127° 01.000'" or "37.0853 127.0167" -> [lat, lon] or null
export function parseLL(str) {
  const t = String(str || '').toUpperCase().replace(/[°'′"″,;]/g, ' ').replace(/\s+/g, ' ').trim();
  let m = t.match(/^([NS]) ?(\d+) (\d+(?:\.\d+)?) ([EW]) ?(\d+) (\d+(?:\.\d+)?)$/);
  if (m) return [(m[1] == 'S' ? -1 : 1) * (+m[2] + +m[3] / 60), (m[4] == 'W' ? -1 : 1) * (+m[5] + +m[6] / 60)];
  m = t.match(/^(-?\d+(?:\.\d+)?) ?N? (-?\d+(?:\.\d+)?) ?E?$/);
  return m ? [+m[1], +m[2]] : null;
}
// Delete a point: its row is emptied; in a line the following points of the same line move up one row so the line stays in one piece.
// set(g, slot, patch) and clear(g, slot) write to the DTC.
export function removePoint(pts, g, slot, set, clear) {
  if (g != 'line') return clear(g, slot);
  const at = i => (pts.line || []).find(r => r.slot == i), end = lineOf(slot) * LINE_LEN - 1; let i = slot;
  for (; i < end && at(i + 1) && !at(i + 1).empty; i++) { const n = at(i + 1); set('line', i, {x: n.x, y: n.y, altFt: n.altFt}); }
  clear('line', i);
}

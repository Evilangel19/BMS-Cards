// Missile data of BMS: Data\Sim\...\Misdata\<name>.dat (listed in MisTypes.lst) and Lofttables\<file>.txt.
// A .dat holds the input data (weights, seeker, guidance), aero tables and a "Range Data" block: the maximum range (ft) for
// altitude x ownship velocity x a third axis (its heading says "aspect" but the values run 0..50 000, so it is read as target altitude, ft).
// Units are those of the files; velocity is taken as ft/s (unconfirmed), ranges in ft.
const NUM = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const nums = l => l.trim().split(/\s+/).filter(x => NUM.test(x)).map(Number);

// the "# Name" comment followed by a value line, of the input data block
const INPUT = {'Weight of missile (lbs)': 'weight', 'Weight of propellant (lbs)': 'propellant', 'Motor Impulse (lb-sec)': 'impulse', 'Reference Area (ft*ft)': 'refArea', 'Length (ft)': 'length',
  'Velocity min (mach)': 'machMin', 'Gimbal Angle Limit (deg)': 'gimbalLimit', 'Field of View (deg)': 'fov', 'Guidance Delay (sec)': 'guidanceDelay', 'Lofting Bias (Gs)': 'loftBias',
  'Proportional nav gain': 'navGain', 'Time To Go Active (sec)': 'timeToActive', 'Seeker Type': 'seekerType', 'Missile loft time': 'loftTime', 'Final Time (sec)': 'finalTime', terminalguiderange: 'terminalRange'};

export function parseMissileDat(text) {
  const L = String(text).split(/\r?\n/), m = {title: '', params: {}, range: null, loftFile: '', rmaxType: 1, extra: {}};
  const t = L.find(l => /^#\s*Title:/i.test(l)); if (t) m.title = t.replace(/^#\s*Title:\s*/i, '').trim();
  for (let i = 0; i < L.length; i++) {
    const h = L[i].replace(/^#\s*/, '').trim();
    if (/^#/.test(L[i]) && INPUT[h] && i + 1 < L.length && NUM.test(L[i + 1].trim())) m.params[INPUT[h]] = +L[i + 1];
    const kv = L[i].match(/^(loftTableFilename|RMaxTableType|MinEngagementRange|MinEngagementAlt|miniaerorange|TerminalStageDist|maxGTerminal|maxGNormal|RaeroTerminalGmax|RaeroTerminalGmin|SmallFighterPitbull|FighterPitbull|BomberPitbull)\s*(.*)$/);
    if (kv) { if (kv[1] == 'loftTableFilename') m.loftFile = kv[2].trim(); else if (kv[1] == 'RMaxTableType') m.rmaxType = +kv[2] || 0; else m.extra[kv[1]] = +kv[2]; }
  }
  const r0 = L.findIndex(l => /^#\s+Range Data/.test(l)); if (r0 < 0) return m;
  const seq = []; for (const l of L.slice(r0)) if (!/^\s*#/.test(l)) seq.push(...nums(l)); // numbers after the "Range Data" header, in file order
  // layout: multiplier, na, alts[na], nv, vels[nv], nt, tgt[nt], then for each alt, each vel: nt values
  const s = seq, mul = s[0]; let q = 1; const take = n => { const a = s.slice(q, q + n); q += n; return a; };
  const na = s[q++], alts = take(na), nv = s[q++], vels = take(nv), nt = s[q++], tg = take(nt);
  const table = []; for (let a = 0; a < na; a++) { table.push([]); for (let v = 0; v < nv; v++) table[a].push(take(nt)); }
  if (table.flat(2).some(x => x === undefined || isNaN(x)) || table.flat(2).length != na * nv * nt) return m;
  m.range = {mult: mul, alts, vels, tgtAlts: tg, table};
  return m;
}

export const parseMisList = text => String(text).split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^\d+$/.test(l));

// loft table: ang[aspect][alt] (deg), alt breakpoints, aspect breakpoints
export function parseLoftTable(text) {
  const L = String(text).split(/\r?\n/).filter(l => !/^\s*#/.test(l) && l.trim()), s = L.flatMap(nums);
  let q = 0; const na = s[q++], alts = s.slice(q, q + na); q += na; const ns = s[q++], asp = s.slice(q, q + ns); q += ns;
  const rows = []; for (let i = 0; i < ns; i++) rows.push(s.slice(q + i * na, q + (i + 1) * na));
  if (!na || !ns || rows.flat().length != na * ns || rows.flat().some(x => isNaN(x))) return null;
  return {alts, aspects: asp, angle: rows};
}

const lerp1 = (xs, x) => { // [index, fraction] for x inside the breakpoints (clamped)
  if (x <= xs[0]) return [0, 0]; if (x >= xs[xs.length - 1]) return [xs.length - 2 < 0 ? 0 : xs.length - 2, xs.length > 1 ? 1 : 0];
  let i = 0; while (xs[i + 1] < x) i++; return [i, (x - xs[i]) / (xs[i + 1] - xs[i])];
};
// maximum range in ft: launch altitude (ft), ownship velocity (ft/s), target altitude (ft); trilinear over the table, times the table multiplier
export function rmax(m, alt, vel, tgtAlt) {
  const R = m && m.range; if (!R) return null;
  const [a, fa] = lerp1(R.alts, alt), [v, fv] = lerp1(R.vels, vel), [t, ft] = lerp1(R.tgtAlts, tgtAlt), g = (i, j, k) => R.table[Math.min(i, R.alts.length - 1)][Math.min(j, R.vels.length - 1)][Math.min(k, R.tgtAlts.length - 1)];
  let o = 0; for (const [di, wi] of [[0, 1 - fa], [1, fa]]) for (const [dj, wj] of [[0, 1 - fv], [1, fv]]) for (const [dk, wk] of [[0, 1 - ft], [1, ft]]) o += wi * wj * wk * g(a + di, v + dj, t + dk);
  return o * R.mult;
}
// loft angle (deg) at an altitude for an aspect (deg), from the loft table
export function loftAngle(tab, alt, aspect = 0) {
  if (!tab) return null; const [a, fa] = lerp1(tab.alts, alt), [s, fs] = lerp1(tab.aspects, aspect), g = (i, j) => tab.angle[Math.min(i, tab.angle.length - 1)][Math.min(j, tab.alts.length - 1)];
  return (1 - fs) * ((1 - fa) * g(s, a) + fa * g(s, a + 1)) + fs * ((1 - fa) * g(s + 1, a) + fa * g(s + 1, a + 1));
}

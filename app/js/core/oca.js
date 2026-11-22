// @ts-check
// OCA: the SWEEP and the ESCORT of a package (JP 3-01: fighter sweep "to seek out and destroy enemy aircraft", fighter escort "dedicated protection").
// The NATO tactical manual (Sweep and Escort; the BMS wiki copy): a sweep leads the package by at least 2 min or flies more than 10 NM aside, a detached
// escort less than 2 min or 10 NM, a close (embedded) escort joins the package and keeps it in sight (not at night, in IMC or low level); commit under 40 NM
// for a sweep with active radar missiles, 30 NM for a detached escort alone, 20-30 NM with other units or embedded; the position codes FS-1 (sweep), FS-2
// (detached), FS-3 (embedded), A on the route, B left, C right. Players: the sweep clears the air 30 NM around the target, 2 min between flights.
// BMS: SWEEP succeeds with one kill, ESCORT when the package takes no loss.
// Positions in km of the theater (x east, y north), times in ms, distances of the page in NM. Pure functions, no DOM.
import { posAt } from './sead.js';

export const KM_NM = 1.852;
export const ocaKind = m => {
  const s = String(m || '')
    .toUpperCase()
    .trim();
  return s == 'SWEEP' ? 'SWEEP' : s == 'ESCORT' ? 'ESCORT' : null;
};
// the defaults by mode: sweep, det (detached escort), emb (embedded escort)
export const OCA_PROF = {
  sweep: { lead: 3, side: 0, off: 0, w: 20, commit: 40, stop: 30, ta: 30, wpn: 'free' },
  det: { lead: 1, side: 0, off: 0, w: 20, commit: 30, stop: 15, ta: 30, wpn: 'tight' },
  emb: { lead: 0, side: 1, off: 1, w: 20, commit: 25, stop: 5, ta: 30, wpn: 'tight' },
};
export const OCA_RANGE = {
  lead: [0, 10, 0.5],
  off: [0, 20, 1],
  w: [10, 40, 2],
  commit: [10, 60, 5],
  stop: [5, 40, 5],
  ta: [10, 40, 5],
  alt: [0, 50000, 500],
};
// the commit of the manual: the most for each mode
export const COMMIT_MAX = { sweep: 40, det: 30, emb: 30 };
export const modeOf = (kind, s) => (kind == 'SWEEP' ? 'sweep' : s && s.esc == 'emb' ? 'emb' : 'det');
export const posCode = (mode, side, off) =>
  'FS-' +
  (mode == 'sweep' ? 1 : mode == 'det' ? 2 : 3) +
  (side == 0 || (mode != 'emb' && !off) ? 'A' : side < 0 ? 'B' : 'C');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1k = v => Math.round(v / 1000) * 1000;
/** the starting values: the profile of the mode, the lead of the flight plan when it fits the mode, the block from the cruise of the package (escort) */
export function ocaDefaults(kind, esc, planned, cruiseFt) {
  const m = kind == 'SWEEP' ? 'sweep' : esc == 'emb' ? 'emb' : 'det',
    P = OCA_PROF[m],
    fits = planned != null && (m == 'sweep' ? planned >= 2 : m == 'det' ? planned >= 0 && planned < 2 : false),
    c = cruiseFt || 20000;
  return {
    esc: kind == 'SWEEP' ? '' : m,
    lead: fits ? Math.round(planned * 2) / 2 : P.lead,
    side: P.side,
    off: P.off,
    w: P.w,
    commit: P.commit,
    stop: P.stop,
    ta: P.ta,
    wpn: P.wpn,
    alt: m == 'sweep' ? [25000, 35000] : [r1k(c + 2000), r1k(c + 6000)],
    night: false,
    cur: null,
  };
}
/** a saved state put back in its ranges */
export function cleanOca(s, kind, planned, cruiseFt) {
  const o0 = s && typeof s == 'object' ? s : {},
    D = ocaDefaults(kind, o0.esc, planned, cruiseFt),
    o = { ...D, ...o0 },
    r = (k, R) => (o[k] = clamp(Number.isFinite(+o[k]) ? +o[k] : D[k], R[0], R[1]));
  ['lead', 'off', 'w', 'commit', 'stop', 'ta'].forEach(k => r(k, OCA_RANGE[k]));
  if (kind == 'SWEEP') o.esc = '';
  else if (!['det', 'emb'].includes(o.esc)) o.esc = 'det';
  if (![-1, 0, 1].includes(+o.side)) o.side = D.side;
  o.side = +o.side;
  if (!['free', 'tight', 'hold'].includes(o.wpn)) o.wpn = D.wpn;
  o.night = !!o.night;
  const a = Array.isArray(o.alt) ? o.alt.map(Number) : D.alt,
    lo = clamp(Number.isFinite(a[0]) ? a[0] : D.alt[0], 0, 49000);
  o.alt = [lo, clamp(Number.isFinite(a[1]) ? a[1] : D.alt[1], lo + 1000, 50000)];
  return o;
}

// the window of the package: from its push (else three steerpoints before the target) to two steerpoints after the target; tgt: the first attack
export function pkgWindow(R, tgtN) {
  const i = Math.max(
      0,
      R.findIndex(p => p.n == tgtN)
    ),
    pu = R.findIndex(p => p.act == 2),
    a = pu >= 0 && pu < i ? pu : Math.max(0, i - 3),
    b = Math.min(R.length - 1, i + 2);
  return { a, b, t0: R[a].arr, t1: R[b].dep > R[b].arr ? R[b].dep : R[b].arr, pts: R.slice(a, b + 1) };
}
/** where the fighter should be at time t: the package lead min ahead along its route, off NM to the side (side -1 left, 1 right); null off the route */
export function fighterAt(R, s, t) {
  const p = posAt(R, t + s.lead * 60000);
  if (!p) return null;
  const h = (p.hdg * Math.PI) / 180,
    d = s.side * s.off * KM_NM;
  return { x: p.x + Math.cos(h) * d, y: p.y - Math.sin(h) * d, hdg: p.hdg };
}
/** the track of the fighter over the window, a point every step ms */
export function track(R, s, t0, t1, step = 30000) {
  const o = [];
  for (let t = t0; t <= t1; t += step) {
    const p = fighterAt(R, s, t);
    if (p) o.push({ ...p, t });
  }
  return o;
}
/** the corridor of the sweep: w NM wide around the track (the left side, then the right one back), every k-th point */
export function corridor(T, w, k = 4) {
  const P = T.filter((_, i) => i % k == 0 || i == T.length - 1),
    h = (w / 2) * KM_NM,
    side = sg =>
      P.map(p => {
        const r = (p.hdg * Math.PI) / 180;
        return { x: p.x + sg * Math.cos(r) * h, y: p.y - sg * Math.sin(r) * h };
      });
  return P.length > 1 ? [...side(-1), ...side(1).reverse()] : [];
}
/** the times the track is inside a circle (cx, cy, r km): the first one, or null */
const firstIn = (T, c) => {
  const p = T.find(q => Math.hypot(q.x - c.x, q.y - c.y) <= c.r);
  return p ? p.t : null;
};

// THE WARNINGS: [text, red]. o: {kind, s, track, sams [{x, y, r, name}], dor, idOk, bingo, planned (the lead of the flight plan, min) | null, hm (time text)}
export function ocaChecks(o) {
  const W = [],
    s = o.s,
    m = modeOf(o.kind, s);
  if (m == 'sweep' && s.lead < 2 && s.off < 10)
    W.push(['Lead under 2 min and within 10 NM of the package: a detached escort, not a sweep', true]);
  if (m == 'det' && (s.lead >= 2 || s.off >= 10))
    W.push(['Lead of 2 min or more, or 10 NM aside: a sweep, the package is left alone', true]);
  if (s.commit > COMMIT_MAX[m])
    W.push([
      'COMMIT ' +
        s.commit +
        ' NM: over ' +
        COMMIT_MAX[m] +
        ' NM for ' +
        (m == 'sweep' ? 'a sweep' : m == 'det' ? 'a detached escort (dragged off the package)' : 'an embedded escort'),
      true,
    ]);
  if (o.dor && s.commit < o.dor)
    W.push(['COMMIT ' + s.commit + ' NM < DOR ' + Math.round(o.dor) + ' NM: no room to defend', true]);
  if (m == 'emb' && s.night) W.push(['Night, IMC or low level: no close escort', true]);
  const hit = (o.sams || [])
    .map(c => ({ c, t: firstIn(o.track || [], c) }))
    .filter(z => z.t != null)
    .sort((a, b) => a.t - b.t);
  hit.slice(0, 2).forEach(z => W.push([z.c.name + ': inside its ring at ' + (o.hm ? o.hm(z.t) : ''), true]));
  if (hit.length > 2) W.push(['and ' + (hit.length - 2) + ' more SAM rings', true]);
  if (s.wpn == 'free' && o.idOk === false) W.push(['WPN FREE without ID criteria in the ROE', true]);
  if (o.bingo === false) W.push(['BUGOUT without BINGO in the ROE', true]);
  if (o.planned != null && Math.abs(o.planned - s.lead) >= 1)
    W.push([
      'Flight plan: lead ' + Math.round(o.planned * 2) / 2 + ' min (change the push or the times of the steerpoints)',
      false,
    ]);
  return W;
}

// the A-A block of the ROE of the flight (core/roesop.js sel.faor, the same field as DCA)
export function ocaRoe(s, kind, code, altf) {
  return {
    kind,
    wpn: s.wpn,
    commit: Math.round(s.commit),
    stop: Math.round(s.stop),
    drop: 0,
    alt: [Math.round(s.alt[0]), Math.round(s.alt[1])],
    hw: '',
    lead: s.lead,
    pos: code,
    ta: Math.round(s.ta),
    ...(altf || {}),
  };
}

// THE LINES OF THE DTC: the track of the fighter (6 points at most), the area of the target (a pentagon, closed: 6 points)
export function ocaDtcLines(T, tgt, s) {
  const n = Math.min(6, T.length),
    tr = n > 1 ? Array.from({ length: n }, (_, i) => T[Math.round((i * (T.length - 1)) / (n - 1))]) : [],
    r = s.ta * KM_NM,
    pent = tgt
      ? Array.from({ length: 6 }, (_, i) => {
          const a = ((i % 5) * 2 * Math.PI) / 5;
          return { x: tgt.x + Math.sin(a) * r, y: tgt.y + Math.cos(a) * r };
        })
      : null;
  return { track: tr.map(p => ({ x: p.x, y: p.y })), area: pent };
}

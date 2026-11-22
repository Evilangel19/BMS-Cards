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
export const posCode = (mode, side, off, indep) =>
  indep
    ? 'FS-1D'
    : 'FS-' +
      (mode == 'sweep' ? 1 : mode == 'det' ? 2 : 3) +
      (side == 0 || (mode != 'emb' && !off) ? 'A' : side < 0 ? 'B' : 'C');
// what the codes mean (the tooltips of the page)
export const POS_HELP =
  'NATO manual, Sweep and Escort: FS-1 sweep (2 min or more ahead of the package, or more than 10 NM aside), FS-2 detached escort (under 2 min and 10 NM), FS-3 embedded escort (with the package, in sight of it). A: on the route of the package, B: left of it, C: right of it, D: independent (a sweep on its own route).';

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
// (endN: the last steerpoint of the task of an independent sweep: the window ends there)
export function pkgWindow(R, tgtN, endN) {
  const i = Math.max(
      0,
      R.findIndex(p => p.n == tgtN)
    ),
    e = endN
      ? Math.max(
          i,
          R.findIndex(p => p.n == endN)
        )
      : -1,
    pu = R.findIndex(p => p.act == 2),
    // an independent sweep: from its first sweep steerpoint (the way in is not the sweep)
    a = e >= 0 ? i : pu >= 0 && pu < i ? pu : Math.max(0, i - 3),
    b = Math.min(R.length - 1, e >= 0 ? e : i + 2);
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
/** the sweep area: one outline around the track, w NM wide (every point within w / 2 of it, round ends and turns), so that turns and short legs
 * make no overlapping boxes. Traced on a grid of the distance to the track (marching squares): km points, closed (no repeated first point); the
 * longest outline when the track closes on itself */
export function sweepArea(T, w) {
  const r = (w / 2) * KM_NM,
    P = T.filter((p, i) => !i || Math.hypot(p.x - T[i - 1].x, p.y - T[i - 1].y) > 1e-6);
  if (!P.length || r <= 0) return [];
  const xs = P.map(p => p.x),
    ys = P.map(p => p.y),
    x0 = Math.min(...xs) - r * 1.3,
    y0 = Math.min(...ys) - r * 1.3,
    W = Math.max(...xs) + r * 1.3 - x0,
    H = Math.max(...ys) + r * 1.3 - y0,
    c = Math.max(r / 6, Math.max(W, H) / 240), // the cell: 1/6 of the half width, 240 cells at most a side
    nx = Math.ceil(W / c) + 1,
    ny = Math.ceil(H / c) + 1,
    dist = (x, y) => {
      let m = Infinity;
      for (let k = 0; k < P.length; k++) {
        const a = P[k],
          b = P[Math.min(k + 1, P.length - 1)],
          vx = b.x - a.x,
          vy = b.y - a.y,
          L = vx * vx + vy * vy,
          t = L ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L)) : 0;
        m = Math.min(m, Math.hypot(x - a.x - t * vx, y - a.y - t * vy));
      }
      return m;
    },
    F = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F.push(r - dist(x0 + i * c, y0 + j * c)); // > 0 inside
  const f = (i, j) => F[j * nx + i],
    pt = {}, // the crossing of an edge of the grid: h i j (from (i, j) to (i+1, j)), v i j (to (i, j+1))
    at = (k, i, j) => {
      const id = k + i + ',' + j;
      if (!pt[id]) {
        const a = f(i, j),
          b = k == 'h' ? f(i + 1, j) : f(i, j + 1),
          t = a / (a - b);
        pt[id] = k == 'h' ? { x: x0 + (i + t) * c, y: y0 + j * c } : { x: x0 + i * c, y: y0 + (j + t) * c };
      }
      return id;
    },
    nb = {},
    link = (a, b) => {
      (nb[a] = nb[a] || []).push(b);
      (nb[b] = nb[b] || []).push(a);
    };
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const q =
        (f(i, j) > 0 ? 1 : 0) | (f(i + 1, j) > 0 ? 2 : 0) | (f(i + 1, j + 1) > 0 ? 4 : 0) | (f(i, j + 1) > 0 ? 8 : 0);
      if (!q || q == 15) continue;
      const B = () => at('h', i, j),
        R = () => at('v', i + 1, j),
        Tp = () => at('h', i, j + 1),
        L = () => at('v', i, j);
      const E = {
        1: [[L, B]],
        2: [[B, R]],
        3: [[L, R]],
        4: [[R, Tp]],
        5: [
          [L, Tp],
          [B, R],
        ],
        6: [[B, Tp]],
        7: [[L, Tp]],
        8: [[Tp, L]],
        9: [[Tp, B]],
        10: [
          [B, L],
          [Tp, R],
        ],
        11: [[Tp, R]],
        12: [[R, L]],
        13: [[R, B]],
        14: [[B, L]],
      }[q];
      E.forEach(([a, b]) => link(a(), b()));
    }
  // the loops
  const seen = new Set(),
    loops = [];
  Object.keys(nb).forEach(s0 => {
    if (seen.has(s0)) return;
    const L = [];
    let prev = null,
      cur = s0;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      L.push(pt[cur]);
      const nx2 = (nb[cur] || []).find(z => z !== prev && !seen.has(z));
      prev = cur;
      cur = nx2;
    }
    loops.push(L);
  });
  return loops.sort((a, b) => b.length - a.length)[0] || [];
}
/** the times the track is inside a circle (cx, cy, r km): the first one, or null */
const firstIn = (T, c) => {
  const p = T.find(q => Math.hypot(q.x - c.x, q.y - c.y) <= c.r);
  return p ? p.t : null;
};

// THE WARNINGS: [text, red]. o: {kind, s, track, sams [{x, y, r, name}], dor, idOk, bingo, planned (the lead of the flight plan, min) | null, hm (time text),
// indep (an independent sweep), dark (night over the target: the Sun under -6°), sun (its height)}
export function ocaChecks(o) {
  const W = [],
    s = o.s,
    m = modeOf(o.kind, s);
  if (m == 'sweep' && !o.indep && s.lead < 2 && s.off < 10)
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
  if (m == 'emb' && o.dark) W.push(['Night over the target (Sun ' + Math.round(o.sun) + '°): no close escort', true]);
  if (m == 'emb' && s.night) W.push(['IMC or low level: no close escort', true]);
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
    pos: code,
    ta: Math.round(s.ta),
    ...(altf || {}),
  };
}

// THE LINES OF THE DTC (a LINE holds 6 points). No track: the steerpoints of the flight show it already.
// SWEEP: the outline of the sweep area as two open lines of 6 points, one each side, meeting at the ends (10 vertices around the area, none inside it).
// ESCORT: the box of the target area at the TOT, open on the side the package comes from: the sides touch the STOP circle of the package and the
// COMMIT circle of the escort, along the heading of the package into the target, and bend back to the push (push: its time), 6 points.
export function ocaDtcLines(T, W, tgt, s, sweep, push) {
  if (sweep) {
    const V = sweepRing(T, s.w, 10);
    if (V.length < 10) return [];
    const k = V.reduce(
        (b, p, i) => (Math.hypot(p.x - T[0].x, p.y - T[0].y) < Math.hypot(V[b].x - T[0].x, V[b].y - T[0].y) ? i : b),
        0
      ),
      at = i => ({ x: V[(k + i) % 10].x, y: V[(k + i) % 10].y });
    return [
      ['sw1', 'SWEEP AREA', [0, 1, 2, 3, 4, 5].map(at)],
      ['sw2', 'SWEEP AREA', [5, 6, 7, 8, 9, 10].map(at)],
    ];
  }
  if (!tgt) return [];
  const pk = posAt(W, tgt.t) || { ...tgt, hdg: 0 },
    fp = fighterAt(W, s, tgt.t),
    h = (pk.hdg * Math.PI) / 180,
    u = { x: Math.sin(h), y: Math.cos(h) }, // ahead
    n = { x: Math.cos(h), y: -Math.sin(h) }, // right
    C = [{ c: pk, r: s.stop * KM_NM }, ...(fp ? [{ c: fp, r: s.commit * KM_NM }] : [])],
    a = q => (q.c.x - tgt.x) * u.x + (q.c.y - tgt.y) * u.y,
    b = q => (q.c.x - tgt.x) * n.x + (q.c.y - tgt.y) * n.y,
    near = Math.min(...C.map(q => a(q) - q.r)),
    far = Math.max(...C.map(q => a(q) + q.r)),
    left = Math.min(...C.map(q => b(q) - q.r)),
    right = Math.max(...C.map(q => b(q) + q.r)),
    P = (x, y) => ({ x: tgt.x + u.x * x + n.x * y, y: tgt.y + u.y * x + n.y * y }),
    U = [P(near, left), P(far, left), P(far, right), P(near, right)],
    // the sides bent back to the push: the push point moved out to each side by the same width, square to the heading of the package there
    pp = push != null ? posAt(W, push) : null;
  if (!pp || (pp.x - tgt.x) * u.x + (pp.y - tgt.y) * u.y > near - 1) return [['box', 'ESCORT AREA', U]];
  const hp = (pp.hdg * Math.PI) / 180,
    np = { x: Math.cos(hp), y: -Math.sin(hp) },
    side = d => ({ x: pp.x + np.x * d, y: pp.y + np.y * d });
  return [['box', 'ESCORT AREA', [side(left), ...U, side(right)]]];
}
// the sweep area as k vertices (closed ring, no repeated point): the outline simplified by area (Visvalingam), then each edge moved out by as much
// as the area passes it, the vertices where the moved edges meet: nothing of the area outside, the edges close to it
export function sweepRing(T, w, k) {
  const A = sweepArea(T, w),
    m = A.length;
  if (m < k) return [];
  const I = simplify(A, k),
    sa = A.reduce((t, p, i) => t + p.x * A[(i + 1) % m].y - A[(i + 1) % m].x * p.y, 0) > 0 ? 1 : -1, // counter-clockwise: outside on the right
    L = I.map((a, e) => {
      const b = I[(e + 1) % k],
        P = A[a],
        Q = A[b],
        dx = Q.x - P.x,
        dy = Q.y - P.y,
        len = Math.hypot(dx, dy) || 1,
        n = { x: (sa * dy) / len, y: (-sa * dx) / len };
      let push = 0;
      for (let q = a; q != b; q = (q + 1) % m) push = Math.max(push, (A[q].x - P.x) * n.x + (A[q].y - P.y) * n.y);
      return { p: { x: P.x + n.x * push, y: P.y + n.y * push }, d: { x: dx / len, y: dy / len }, n, push };
    });
  return L.map((e, i) => {
    const f = L[(i - 1 + k) % k],
      den = f.d.x * e.d.y - f.d.y * e.d.x;
    if (Math.abs(den) < 0.26) {
      // nearly straight on (under 15°): the vertex moved out by the larger push
      const v = A[I[i]],
        g = Math.max(f.push, e.push),
        nx = f.n.x + e.n.x,
        ny = f.n.y + e.n.y,
        l = Math.hypot(nx, ny) || 1;
      return { x: v.x + (nx / l) * g, y: v.y + (ny / l) * g };
    }
    const t = ((e.p.x - f.p.x) * e.d.y - (e.p.y - f.p.y) * e.d.x) / den,
      X = { x: f.p.x + f.d.x * t, y: f.p.y + f.d.y * t },
      v = A[I[i]],
      far = Math.hypot(X.x - v.x, X.y - v.y),
      lim = w * KM_NM; // a sharp turn: no spike, at most w from the area (the miter limit of the drawings)
    return far <= lim ? X : { x: v.x + ((X.x - v.x) * lim) / far, y: v.y + ((X.y - v.y) * lim) / far };
  });
}
// Visvalingam: the indices of the k points of the ring that keep the most of its area
function simplify(R, k) {
  const V = R.map((p, i) => i),
    tri = (a, b, c) => Math.abs((R[b].x - R[a].x) * (R[c].y - R[a].y) - (R[b].y - R[a].y) * (R[c].x - R[a].x)) / 2;
  while (V.length > k) {
    let m = 0,
      best = Infinity;
    for (let i = 0; i < V.length; i++) {
      const t = tri(V[(i - 1 + V.length) % V.length], V[i], V[(i + 1) % V.length]);
      if (t < best) {
        best = t;
        m = i;
      }
    }
    V.splice(m, 1);
  }
  return V;
}

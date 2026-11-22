// @ts-check
// FAOR: the Fighter Area Of Responsibility of a CAP flight (NATO AJP-3.3.1: a CAP may be given a FAOR; the US calls the zone where the fighters engage
// a FEZ, with its weapons control). The FEZ is a rectangle laid on the threat axis: its long side faces the threat, the CAP sits in its back third.
// The lines: COMMIT (a hostile group closer than this, toward the threat: the flight commits), STOP (no pursuit beyond it), DROP (a group running cold
// further than this is let go), HARDWALL (the limit with the FAOR of the next friendly CAP, with a 5 NM buffer).
// Positions in km of the theater (x east, y north), distances of the page in NM, altitudes in feet, bearings true.
// The minimums of BMS (its mission success rules, Airgoons and the forum): a CAP must reach its first CAP point on time and stay on station for the
// patrol time; the time away from the CAP points (about 20-30 NM, not documented) does not count; DCA / HAVCAP / RESCAP: the asset must live; TARCAP:
// the strikers must live. Pure functions, no DOM.
export const KM_NM = 1.852;
export const HW_BUF = 5; // NM: the buffer of a hardwall
export const STN_NM = 20, // NM from the CAP points: further away, the time may not count as on station (BMS, about 20-30 NM, not documented)
  STN_MAX = 30; // further than this, it does not

// the kinds of mission this page plans: the BMS mission name -> the profile
export function capKind(mission) {
  const m = String(mission || '')
    .toUpperCase()
    .trim();
  if (/^BARCAP/.test(m)) return 'BARCAP';
  if (m == 'RESCAP' || m == 'RESCORT') return 'RESCAP';
  return ['CAP', 'AMBUSHCAP', 'TARCAP', 'DCA', 'HAVCAP'].includes(m) ? m : null;
}
// the default of each kind: w x d the FEZ (NM), alt [floor, ceiling] (ft; 'msa': from the MSA of the FEZ), commit / stop / drop (NM), wpn, asset: the
// furthest STOP from what it protects (DCA, HAVCAP, RESCAP), stn: the least time on station (min) besides the planned one
export const PROFILES = {
  BARCAP: { w: 60, d: 30, alt: [25000, 35000], commit: 40, stop: 20, drop: 15, wpn: 'tight', anchor: 'the CAP points' },
  CAP: { w: 50, d: 30, alt: [20000, 30000], commit: 30, stop: 20, drop: 12, wpn: 'tight', anchor: 'the CAP points' },
  AMBUSHCAP: {
    w: 40,
    d: 25,
    alt: 'msa',
    commit: 20,
    stop: 18,
    drop: 10,
    wpn: 'tight',
    anchor: 'the CAP points, low under the radars',
  },
  TARCAP: { w: 40, d: 30, alt: [20000, 30000], commit: 30, stop: 20, drop: 12, wpn: 'free', anchor: 'the target area' },
  DCA: {
    w: 50,
    d: 30,
    alt: [15000, 30000],
    commit: 40,
    stop: 20,
    drop: 12,
    wpn: 'tight',
    asset: 30,
    anchor: 'the asset',
  },
  HAVCAP: {
    w: 80,
    d: 30,
    alt: [26000, 36000],
    commit: 50,
    stop: 20,
    drop: 15,
    wpn: 'tight',
    asset: 30,
    stn: 60,
    anchor: 'the HVAA orbit',
  },
  RESCAP: {
    w: 30,
    d: 30,
    alt: [10000, 20000],
    commit: 25,
    stop: 20,
    drop: 10,
    wpn: 'tight',
    asset: 20,
    anchor: 'the CSAR point',
  },
};
export const WPN = ['free', 'tight', 'hold'];
// the ranges of the sliders (the minimums of BMS: on station not less than planned, see limits)
export const RANGE = {
  w: [20, 120, 5],
  d: [15, 80, 5],
  commit: [10, 80, 1],
  stop: [5, 80, 1],
  drop: [5, 30, 1],
  cor: [-45, 45, 5],
  alt: [0, 50000, 500],
};

const up100 = v => Math.ceil(v / 100 - 1e-6) * 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const n360 = a => ((a % 360) + 360) % 360;
export const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
// bearing (true) from a to b, km points
export const bearing = (a, b) => n360((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI);
export const distNm = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) / KM_NM;
// "FL250" from 18 000 ft up, else "6 500 ft"
export const altTxt = ft =>
  ft >= 18000
    ? 'FL' + String(Math.round(ft / 1000) * 10).padStart(3, '0')
    : Math.round(ft).toLocaleString('en-US').replace(/,/g, ' ') + ' ft';
export const altBlock = a => altTxt(a[0]) + '-' + altTxt(a[1]).replace(/^FL/, a[0] >= 18000 ? '' : 'FL');

// the time planned on station (min): from the arrival at the first CAP point to the departure from the last one
export function plannedMin(cap) {
  if (!cap || !cap.length) return 0;
  const a = cap[0].arr,
    b = cap[cap.length - 1].dep || cap[cap.length - 1].arr;
  return a && b && b > a ? Math.round((b - a) / 60000) : 0;
}
// the slider values a flight starts with: the profile of its kind, the time planned, the MSA of the FEZ for the AMBUSHCAP
export function defaults(kind, planned, msaFt) {
  const P = PROFILES[kind] || PROFILES.CAP,
    msa = msaFt == null ? 3000 : msaFt,
    alt = P.alt == 'msa' ? [up100(msa + 500), up100(msa + 3000)] : [...P.alt];
  return {
    axis: 'perp',
    cor: 0,
    w: P.w,
    d: P.d,
    alt,
    commit: P.commit,
    stop: P.stop,
    drop: P.drop,
    wpn: P.wpn,
    stn: Math.max(planned || 0, P.stn || 0, planned ? 0 : 30),
  };
}
// the slider limits of a flight: the time on station from the planned one (less fails the mission in BMS)
export function limits(kind, planned) {
  const P = PROFILES[kind] || PROFILES.CAP,
    lo = Math.max(planned || 0, P.stn || 0) || 30;
  return { stn: [lo, lo + 90, 5] };
}
// a value of the state put back inside its range (a saved state, a slider of an older version)
export function cleanState(s, kind, planned) {
  const D = defaults(kind, planned, null),
    o = { ...D, ...(s && typeof s == 'object' ? s : {}) },
    L = limits(kind, planned),
    r = (k, R) => (o[k] = clamp(Number.isFinite(+o[k]) ? +o[k] : D[k], R[0], R[1]));
  ['w', 'd', 'commit', 'stop', 'drop', 'cor'].forEach(k => r(k, RANGE[k]));
  r('stn', L.stn);
  if (!['perp', 'par'].includes(o.axis)) o.axis = 'perp';
  if (!WPN.includes(o.wpn)) o.wpn = D.wpn;
  const a = Array.isArray(o.alt) ? o.alt.map(Number) : D.alt;
  const lo = clamp(Number.isFinite(a[0]) ? a[0] : D.alt[0], 0, 49000);
  o.alt = [lo, clamp(Number.isFinite(a[1]) ? a[1] : D.alt[1], lo + 1000, 50000)];
  return o;
}

// the bearing of the threat from the anchor: the enemy points (ground units, SAMs, airbases), the nearest n, each by 1 / distance (the near ones lead);
// null without any
export function threatBrg(anchor, pts, n = 8) {
  const L = (pts || [])
    .map(p => ({ p, d: Math.hypot(p.x - anchor.x, p.y - anchor.y) }))
    .filter(z => z.d > 0.5)
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
  if (!L.length) return null;
  let sx = 0,
    sy = 0;
  L.forEach(({ p, d }) => {
    sx += (p.x - anchor.x) / d / d;
    sy += (p.y - anchor.y) / d / d;
  });
  return Math.hypot(sx, sy) < 1e-9 ? bearing(anchor, L[0].p) : n360((Math.atan2(sx, sy) * 180) / Math.PI);
}

// the geometry of the FAOR: cap = the CAP steerpoints (one or more), enemy = the bearing of the threat (null: unknown), s = the state of the page.
// Returns {anchor, leg (bearing of the CAP leg, null with one point), base (the axis before the correction), brg (the threat axis), at(u, v) (NM across,
// NM toward the threat -> km point), box (the FEZ, 4 corners), front (its edge on the threat side, NM from the anchor), commit, stop (their lines)}
export function faorGeo(cap, enemy, s) {
  const P = cap.length ? cap : [{ x: 512, y: 512 }],
    a = P[0],
    b = P[P.length - 1],
    anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    leg = Math.hypot(b.x - a.x, b.y - a.y) > 2 ? bearing(a, b) : null,
    en = enemy == null ? (leg == null ? 0 : n360(leg - 90)) : enemy;
  let base;
  if (leg == null) base = en;
  else {
    const C = s.axis == 'par' ? [leg, leg + 180] : [leg + 90, leg - 90];
    base = n360(angDiff(C[0], en) <= angDiff(C[1], en) ? C[0] : C[1]);
  }
  const brg = n360(base + (s.cor || 0)),
    r = (brg * Math.PI) / 180,
    v = { x: Math.sin(r), y: Math.cos(r) },
    u = { x: Math.cos(r), y: -Math.sin(r) },
    at = (pu, pv) => ({
      x: anchor.x + (pu * u.x + pv * v.x) * KM_NM,
      y: anchor.y + (pu * u.y + pv * v.y) * KM_NM,
    }),
    w2 = s.w / 2,
    back = -s.d / 3,
    front = (s.d * 2) / 3;
  return {
    anchor,
    leg,
    base,
    brg,
    enemy,
    at,
    // NM across (right of the axis) and toward the threat of a km point
    local: p => {
      const dx = (p.x - anchor.x) / KM_NM,
        dy = (p.y - anchor.y) / KM_NM;
      return { u: dx * u.x + dy * u.y, v: dx * v.x + dy * v.y };
    },
    box: [at(-w2, back), at(w2, back), at(w2, front), at(-w2, front)],
    front,
    back,
    commit: [at(-w2, s.commit), at(w2, s.commit)],
    stop: [at(-w2, s.stop), at(w2, s.stop)],
    cap: P,
  };
}
// inside the FEZ (with a margin in NM)
export const inFez = (G, s, p, m = 0) => {
  const q = G.local(p);
  return Math.abs(q.u) <= s.w / 2 + m && q.v >= G.back - m && q.v <= G.front + m;
};
// the reach of the CAP points from the anchor (NM): STOP further than this + STN_NM leaves the station
export const capReach = G => Math.max(0, ...G.cap.map(p => Math.abs(G.local(p).v)));

// THE HARDWALL with the nearest friendly CAP (its anchor within 80 NM): the line half way between the two anchors, square to the line joining them,
// as long as the depth of the FEZ around it. {a, b (the ends), name, gap (NM from my FEZ to the wall, < HW_BUF: inside the buffer)} or null
export function hardwall(G, s, mates) {
  const M = (mates || [])
    .map(m => ({ m, d: distNm(G.anchor, m.anchor) }))
    .filter(z => z.d > 1 && z.d < 80)
    .sort((x, y) => x.d - y.d)[0];
  if (!M) return null;
  const o = M.m.anchor,
    mid = { x: (G.anchor.x + o.x) / 2, y: (G.anchor.y + o.y) / 2 },
    dx = (o.x - G.anchor.x) / (M.d * KM_NM),
    dy = (o.y - G.anchor.y) / (M.d * KM_NM),
    half = Math.max(s.d, 20) * 0.6 * KM_NM,
    a = { x: mid.x - dy * half, y: mid.y + dx * half },
    b = { x: mid.x + dy * half, y: mid.y - dx * half },
    // the corner of my FEZ furthest toward the other CAP: its distance to the wall
    reach = Math.max(...G.box.map(p => ((p.x - G.anchor.x) * dx + (p.y - G.anchor.y) * dy) / KM_NM)),
    gap = M.d / 2 - reach;
  return { a, b, name: M.m.name, other: o, gap };
}

// THE WARNINGS: [text, red]. ctx: {kind, planned, msa (ft, the MSA of the FEZ), dor (NM), idOk (ID criteria in the ROE), bingo (BUGOUT with Bingo in the
// ROE), hw (hardwall), targets [{x, y, name}] (TARCAP: the targets of the strikers)}
export function checks(G, s, ctx) {
  const W = [],
    P = PROFILES[ctx.kind] || PROFILES.CAP;
  if (G.cap.some(p => !inFez(G, s, p, 0.5))) W.push(['CAP points outside the FEZ', true]);
  if (ctx.dor && s.commit < ctx.dor)
    W.push(['COMMIT ' + Math.round(s.commit) + ' NM < DOR ' + Math.round(ctx.dor) + ' NM: no room to defend', true]);
  const reach = capReach(G);
  if (s.stop > reach + STN_MAX)
    W.push([
      'STOP ' + Math.round(s.stop) + ' NM: over ' + STN_MAX + ' NM past the CAP points, off station (BMS)',
      true,
    ]);
  else if (s.stop > reach + STN_NM)
    W.push([
      'STOP ' + Math.round(s.stop) + ' NM: over ' + STN_NM + ' NM past the CAP points, it may count as off station',
      false,
    ]);
  if (P.asset && s.stop > P.asset)
    W.push(['STOP ' + Math.round(s.stop) + ' NM: further than ' + P.asset + ' NM from ' + P.anchor, true]);
  if (ctx.msa != null && s.alt[0] < ctx.msa)
    W.push(['FEZ floor ' + altTxt(s.alt[0]) + ' under the MSA ' + altTxt(ctx.msa), true]);
  if (s.wpn == 'free' && ctx.idOk === false) W.push(['WPN FREE without ID criteria in the ROE', true]);
  if (ctx.bingo === false) W.push(['BUGOUT without BINGO in the ROE', true]);
  if (ctx.hw && ctx.hw.gap < HW_BUF)
    W.push([
      'FEZ ' +
        (ctx.hw.gap < 0 ? 'over' : 'inside the ' + HW_BUF + ' NM buffer of') +
        ' the HARDWALL with ' +
        ctx.hw.name,
      true,
    ]);
  if (ctx.kind == 'TARCAP' && ctx.targets && ctx.targets.length) {
    const out = ctx.targets.filter(t => !inFez(G, s, t));
    if (out.length) W.push(['TARGET ' + out[0].name + ' outside the FEZ', true]);
  }
  if (s.stn > ctx.planned && ctx.planned)
    W.push(['On station ' + s.stn + ' min, planned ' + ctx.planned + ': the fuel has to last', false]);
  return W;
}

// the FAOR block of the ROE of the flight (core/roesop.js sel.faor): what the FEZ asks of the pilots
export function faorRoe(s, kind, hwName) {
  return {
    kind: kind || '',
    wpn: s.wpn,
    commit: Math.round(s.commit),
    stop: Math.round(s.stop),
    drop: Math.round(s.drop),
    alt: [Math.round(s.alt[0]), Math.round(s.alt[1])],
    hw: hwName ? String(hwName).slice(0, 24) : '',
  };
}
// a FAOR block from outside (a file, the datacard): checked, null when it is not one
export function cleanFaor(f) {
  if (!f || typeof f != 'object' || !WPN.includes(f.wpn)) return null;
  const n = (v, a, b) => clamp(Math.round(+v || 0), a, b),
    alt = Array.isArray(f.alt) ? f.alt : [0, 0];
  return {
    kind: String(f.kind || '')
      .replace(/[^A-Z]/gi, '')
      .toUpperCase()
      .slice(0, 12),
    wpn: f.wpn,
    commit: n(f.commit, 0, 200),
    stop: n(f.stop, 0, 200),
    drop: n(f.drop, 0, 200),
    alt: [n(alt[0], 0, 60000), n(alt[1], 0, 60000)],
    hw: String(f.hw || '')
      .replace(/[\r\n]/g, ' ')
      .slice(0, 24),
    // QRA (core/qra.js): ALERT or INTERCEPT, the vector (magnetic), the intercept and scramble ranges (NM)
    ...(f.qra == 'ALERT' || f.qra == 'INTERCEPT'
      ? {
          qra: f.qra,
          vec: n(f.vec, 0, 360),
          ri: n(f.ri, 0, 300),
          rs: n(f.rs, 0, 999),
        }
      : {}),
    // OCA (core/oca.js): the position code (it marks an OCA block; the tactic is not a line of the ROE), the target area (NM)
    ...(f.pos != null
      ? {
          pos: String(f.pos)
            .replace(/[^A-Z0-9-]/gi, '')
            .slice(0, 6),
          ta: n(f.ta, 0, 100),
        }
      : {}),
  };
}
const isOca = f => f.pos != null;
// THE LINE OF THE DATACARD BOX (core/roesop.js roeText) after WPN and COMMIT: the one rule of the block that matters most
export function faorBox(f) {
  if (f.qra)
    return f.qra == 'ALERT'
      ? 'SCRAMBLE LINE ' + f.rs + 'NM'
      : 'VECTOR ' + String(f.vec % 360 || 360).padStart(3, '0') + ' ANGELS ' + Math.round(f.alt[0] / 1000);
  if (isOca(f)) return 'STOP ' + f.stop + 'NM FROM ' + (f.pos == 'FS-1D' ? 'ROUTE' : 'PKG');
  return 'STOP ' + f.stop + 'NM · FEZ ' + altBlock(f.alt);
}
// its lines: short (the card, the ROE box) or long (the ROE page, the ROE card)
export function faorLines(f, long) {
  if (!f) return [];
  const W = f.wpn.toUpperCase();
  if (f.qra) {
    const al = f.qra == 'ALERT',
      ang = Math.round(f.alt[0] / 1000),
      v = String(f.vec % 360 || 360).padStart(3, '0');
    return long
      ? [
          'Weapons ' + W,
          'Commit: hostile group within ' + f.commit + ' NM',
          al
            ? 'Scramble line ' + f.rs + ' NM on the threat axis ' + v + '°: meet the raid ' + f.ri + ' NM from the base'
            : 'Vector ' + v + '°, ANGELS ' + ang + ', BUSTER to the intercept',

          'Scramble on the order of the controller (CRC / AWACS)',
        ]
      : [
          'WPN ' + W,
          'COMMIT ' + f.commit + 'NM',
          al ? 'SCRAMBLE LINE ' + f.rs + 'NM AXIS ' + v : 'VECTOR ' + v + ' ANGELS ' + ang,
          al ? 'INTERCEPT ' + f.ri + 'NM FROM BASE' : 'BUSTER',
        ];
  }
  if (isOca(f)) {
    const sw = f.kind == 'SWEEP',
      ind = f.pos == 'FS-1D'; // an independent sweep: its own route, no package
    return long
      ? [
          'Weapons ' + W,
          'Commit: hostile group within ' + f.commit + ' NM',

          'No pursuit beyond ' + f.stop + ' NM from ' + (ind ? 'your route' : 'the package'),
          'Altitude block ' + altBlock(f.alt),
          sw ? 'Clear the air ' + f.ta + ' NM around the target' : 'Stay between the threat and the package',
        ]
      : [
          'WPN ' + W,
          'COMMIT ' + f.commit + 'NM',

          'STOP ' + f.stop + 'NM FROM ' + (ind ? 'ROUTE' : 'PKG'),
          'BLOCK ' + altBlock(f.alt),
          sw ? 'TGT AREA ' + f.ta + 'NM' : 'STAY WITH THE PACKAGE',
        ];
  }
  return long
    ? [
        'Weapons ' + W + ' inside the FEZ',
        'Commit: hostile group within ' + f.commit + ' NM toward the threat',
        'Stop line ' + f.stop + ' NM: no pursuit beyond it',
        'Drop: a group running cold beyond ' + f.drop + ' NM is let go',
        'FEZ altitude block ' + altBlock(f.alt),
        ...(f.hw ? ['HARDWALL with the FAOR of ' + f.hw + ', ' + HW_BUF + ' NM buffer'] : []),
        'No fire outside the FEZ',
      ]
    : [
        'FEZ WPN ' + W,
        'COMMIT ' + f.commit + 'NM',
        'STOP ' + f.stop + 'NM',
        'DROP ' + f.drop + 'NM',
        'FEZ ' + altBlock(f.alt),
        ...(f.hw ? ['HARDWALL ' + f.hw.toUpperCase()] : []),
        'NO FIRE OUTSIDE FEZ',
      ];
}

// THE LINES OF THE DTC (Map page, AUTO): the FEZ (5 points, closed), COMMIT / STOP as a U on the sides of the FEZ (4 points), the HARDWALL (2 points)
export function faorDtcLines(G, hw) {
  const c = G.commit,
    t = G.stop;
  return {
    fez: [...G.box, G.box[0]],
    cs: [c[0], c[1], t[1], t[0]],
    hw: hw ? [hw.a, hw.b] : null,
  };
}

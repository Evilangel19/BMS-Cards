// @ts-check
// A-A > DCA, the QRA flight (core/qrapage.js). Pure functions, km of the theater (x east, y north), times in ms, no DOM.
// In the ATO of BMS a QRA waits on its airbase (a route base -> base, no target); when the campaign launches it, the same flight gets the mission
// INTERCEPTION and a route with an Intercept steerpoint (action 13) that names the enemy flight to meet. Two states:
// ALERT (no Intercept steerpoint): the threat axis of the DCA from the base; the intercept range wanted, the SCRAMBLE LINE: how far out a raid on the
//   axis must be seen for the QRA, airborne at the take-off of the ATO, to meet it there: rs = ri + vt * (time to climb + dash to ri).
// INTERCEPT (Intercept steerpoint): the target as the controller gives it (the spotted enemy flight: position, heading, speed, dead reckoning) and
//   the collision point (the first time the fighter, climb then dash, can be where the target is); without a spotted target the steerpoint of BMS.
//   With VID in the ROE, the stern conversion: the displacement abeam of the target and the turn to its six.
// NATO air policing: the QRA is guided by the CRC to the target (heading, altitude, range to the intercept); AFTTP 3-2.8 (air control
// communication): the vector, ANGELS, BUSTER.
import { KM_NM, WPN, bearing, distNm, angDiff } from './faor.js';

export const qraKind = m =>
  /^(QRA|INTERCEPT|INTERCEPTION)$/.test(
    String(m || '')
      .toUpperCase()
      .trim()
  )
    ? 'QRA'
    : null;
export const CLIMB_KT = 350; // the ground speed in the climb to ANGELS
export const LINE_NM = 20; // the half width of the scramble and intercept lines
export const QRA_DEF = { ri: 40, vt: 480, vi: 520, tc: 3, ang: 25000, commit: 40, disp: 4, wpn: 'tight', cor: 0 };
export const QRA_RANGE = {
  ri: [10, 150, 5],
  vt: [250, 900, 10],
  vi: [350, 900, 10],
  tc: [1, 10, 0.5],
  ang: [1000, 45000, 1000],
  commit: [10, 80, 1],
  disp: [2, 10, 0.5],
  cor: [-45, 45, 5],
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** the state of a QRA flight from outside (the page, a mission file): every value inside its slider, the defaults for the others */
export function cleanQra(s) {
  const o = { ...QRA_DEF },
    v = s && typeof s == 'object' ? s : {};
  Object.entries(QRA_RANGE).forEach(([k, [a, b, st]]) => {
    const n = +v[k];
    if (v[k] != null && isFinite(n)) o[k] = Math.round(clamp(n, a, b) / st) * st;
  });
  if (WPN.includes(v.wpn)) o.wpn = v.wpn;
  return o;
}
export const unit = brg => ({ x: Math.sin((brg * Math.PI) / 180), y: Math.cos((brg * Math.PI) / 180) });
const along = (p, u, nm) => ({ x: p.x + u.x * nm * KM_NM, y: p.y + u.y * nm * KM_NM });
/** the distance (NM) the fighter covers in tau minutes after the take-off: the climb at CLIMB_KT for tc minutes, then the dash */
export const reachNm = (tau, S) =>
  tau <= 0 ? 0 : tau <= S.tc ? (tau / 60) * CLIMB_KT : (S.tc / 60) * CLIMB_KT + ((tau - S.tc) / 60) * S.vi;
/** the minutes to reach d NM (the inverse of reachNm) */
export const timeTo = (d, S) => {
  const dc = (S.tc / 60) * CLIMB_KT;
  return d <= dc ? (d / CLIMB_KT) * 60 : S.tc + ((d - dc) / S.vi) * 60;
};
// a line square to the axis u at s NM from p, LINE_NM each side
const across = (p, u, s) => {
  const c = along(p, u, s),
    n = { x: u.y, y: -u.x };
  return [along(c, n, LINE_NM), along(c, n, -LINE_NM)];
};

// ALERT: base {x, y}, brg (the threat axis, true), S -> {brg, u, ri, rs, tInt (min), at(s), scr [2 pts], ic [2 pts]}
export function qraAlert(base, brg, S) {
  const b = (brg + S.cor + 360) % 360,
    u = unit(b),
    tInt = timeTo(S.ri, S),
    rs = Math.round(S.ri + (S.vt * tInt) / 60);
  return {
    brg: b,
    u,
    ri: S.ri,
    rs,
    tInt,
    at: s => along(base, u, s),
    scr: across(base, u, rs),
    ic: across(base, u, S.ri),
  };
}
/** how far (NM) along the axis from the base the friendly radars see (radars [{x, y, rng km}]): null with none on the axis */
export function coverNm(base, u, radars) {
  let best = null;
  (radars || []).forEach(r => {
    const dx = (r.x - base.x) / KM_NM,
      dy = (r.y - base.y) / KM_NM,
      R = r.rng / KM_NM,
      a = dx * u.x + dy * u.y,
      off = Math.abs(dx * u.y - dy * u.x);
    if (off >= R) return;
    const s = a + Math.sqrt(R * R - off * off);
    if (s > 0 && (best == null || s > best)) best = s;
  });
  return best == null ? null : Math.round(best);
}

// INTERCEPT: base, t0 (take-off, ms), T {x, y, t (ms of that position), hdg (true), gs (kt)}, S -> {t, p, vec, d (NM from the base), tInt (min),
// track [from, ahead], commitPt, aspect, conv} | null (no intercept within 90 minutes: the target is faster or opening)
export function qraIntercept(base, t0, T, S, vid) {
  const ut = unit(T.hdg),
    P = t => along(T, ut, (T.gs * (t - T.t)) / 3600000),
    gap = t => reachNm((t - t0) / 60000, S) - distNm(base, P(t)),
    a0 = Math.max(t0, T.t),
    STEP = 5000;
  let t = a0;
  while (gap(t) < 0 && t - a0 < 90 * 60000) t += STEP;
  if (gap(t) < 0) return null;
  let lo = Math.max(a0, t - STEP),
    hi = t;
  if (gap(lo) < 0)
    for (let k = 0; k < 30; k++) {
      const m = (lo + hi) / 2;
      if (gap(m) < 0) lo = m;
      else hi = m;
    }
  t = hi;
  const p = P(t),
    vec = bearing(base, p),
    uv = unit(vec),
    d = distNm(base, p);
  // the commit: the first time the range between the fighter (on the vector) and the target is under COMMIT
  let cp = null;
  for (let q = a0; q <= t; q += STEP) {
    const f = along(base, uv, Math.min(d, reachNm((q - t0) / 60000, S)));
    if (distNm(f, P(q)) <= S.commit) {
      cp = f;
      break;
    }
  }
  const asp = angDiff(T.hdg, bearing(p, base)),
    aspect = asp <= 30 ? 'HOT' : asp <= 70 ? 'FLANK' : asp <= 110 ? 'BEAM' : 'DRAG';
  return {
    t,
    p,
    vec,
    d: Math.round(d),
    tInt: (t - t0) / 60000,
    track: [P(Math.min(T.t, t - 10 * 60000)), P(t + 5 * 60000)],
    commitPt: cp,
    aspect,
    conv: vid ? stern(base, p, T.hdg, S.disp) : null,
  };
}
// INTERCEPT without a spotted target: the Intercept steerpoint of BMS {x, y, n, arr}; the target taken as head-on for the conversion
export function qraFromStpt(base, t0, ic, S, vid) {
  const vec = bearing(base, ic);
  return {
    t: ic.arr || t0,
    p: { x: ic.x, y: ic.y },
    vec,
    d: Math.round(distNm(base, ic)),
    tInt: ic.arr ? (ic.arr - t0) / 60000 : timeTo(distNm(base, ic), S),
    track: null,
    commitPt: null,
    aspect: null,
    conv: vid ? stern(base, ic, (vec + 180) % 360, S.disp) : null,
  };
}
// the stern conversion (schematic, ground frame): the aim point abeam of the target by the displacement, on the side the fighter comes from, then the
// turn of radius disp / 2 behind the target to its track
export function stern(base, p, hdg, disp) {
  const ut = unit(hdg),
    n = { x: ut.y, y: -ut.x },
    side = (base.x - p.x) * n.x + (base.y - p.y) * n.y >= 0 ? 1 : -1,
    r = disp / 2,
    c = along(p, n, side * r),
    arc = [];
  for (let k = 0; k <= 12; k++) {
    const th = (Math.PI * k) / 12;
    arc.push(along(along(c, n, side * r * Math.cos(th)), ut, -r * Math.sin(th)));
  }
  return { aim: arc[0], arc, side: side > 0 ? 'right' : 'left' };
}

// THE CHECKS: [text, red] — ctx {mode, A (alert plan), I (intercept plan), cover (NM | null), awacs, abs [{x, y, name}] (enemy airbases), idOk, tgt}
export function qraChecks(S, base, c) {
  const W = [];
  if (c.mode == 'ALERT' && c.A) {
    const A = c.A;
    if (c.awacs) W.push(['AWACS on station at the take-off: the raid is seen beyond the scramble line.', false]);
    else if (c.cover == null)
      W.push(['No friendly radar known on the threat axis: the scramble line cannot be checked.', false]);
    else if (A.rs > c.cover)
      W.push([
        'SCRAMBLE LINE ' +
          A.rs +
          ' NM is beyond the radar coverage on the axis (' +
          c.cover +
          ' NM): a raid is seen too late to meet it at ' +
          A.ri +
          ' NM.',
        true,
      ]);
    const ab = (c.abs || [])
      .map(a => ({ a, d: distNm(base, a), off: angDiff(bearing(base, a), A.brg) }))
      .filter(z => z.off <= 30 && z.d < A.rs)
      .sort((x, y) => x.d - y.d)[0];
    if (ab)
      W.push([
        'Enemy airbase ' +
          ab.a.name +
          ' at ' +
          Math.round(ab.d) +
          ' NM, inside the scramble line: a raid from it reaches ' +
          A.ri +
          ' NM before you.',
        true,
      ]);
  }
  if (c.mode == 'INTERCEPT') {
    if (!c.I) W.push(['No intercept within 90 minutes: the target is faster or opening (dash ' + S.vi + ' kt).', true]);
    if (c.tgt && c.tgt.gone) W.push(['The target of the intercept is no longer in the campaign.', false]);
    else if (c.tgt && !c.tgt.st)
      W.push(['Target not spotted: the plan follows the Intercept steerpoint of BMS.', false]);
    if (c.I && c.ic && c.tgt && c.tgt.st) {
      const g = distNm(c.I.p, c.ic);
      if (g > 15)
        W.push([
          'BMS planned the intercept at STPT ' + c.ic.n + ', ' + Math.round(g) + ' NM from the intercept of now.',
          false,
        ]);
    }
    if (c.tgt && c.tgt.st && c.tgt.st.alt && Math.abs(c.tgt.st.alt - S.ang) > 15000)
      W.push([
        'The target flies at ' + Math.round(c.tgt.st.alt / 1000) + ' 000 ft, ANGELS ' + S.ang / 1000 + '.',
        false,
      ]);
  }
  if (c.idOk === false && S.wpn == 'free') W.push(['WEAPONS FREE with no ID criteria in the ROE.', true]);
  return W;
}

// THE A-A BLOCK of the ROE (core/faor.js cleanFaor / faorLines, field qra): vec and axis magnetic, as the pilot reads them; no tactic (the stern
// conversion is on the page and the cards)
export function qraRoe(S, mode, o) {
  return {
    kind: 'QRA',
    wpn: S.wpn,
    commit: Math.round(S.commit),
    stop: 0,
    drop: 0,
    alt: [S.ang, S.ang],
    hw: '',
    qra: mode,
    vec: Math.round(o.vec || 0),
    ri: Math.round(o.ri || 0),
    rs: Math.round(o.rs || 0),
  };
}
// THE DTC LINES: ALERT the scramble line and the intercept line; INTERCEPT the vector (base -> intercept) and the track of the target
export function qraDtcLines(mode, A, I, base) {
  if (mode == 'ALERT')
    return [
      ['scr', 'SCRAMBLE', A.scr],
      ['ic', 'INTERCEPT', A.ic],
    ];
  return [['vec', 'VECTOR', [base, I.p]], ...(I.track ? [['trk', 'TARGET', I.track]] : [])];
}

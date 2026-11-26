// @ts-check
// Air-to-air refuelling (Performance > AAR, core/aarpage.js): the tanker, its track, where it is at a time, the rendezvous of the flight with it, the fuel
// to take and the procedure. Pure maths, no DOM. Units: km of the theater (x east, y north), times in ms, speeds in kt, altitudes in ft.
// BMS 4.38 (Training Manual, mission 4D): the tanker flies a racetrack on its two track steerpoints (action 24): a leg from the first to the second,
// a 180° turn at 30° of bank, the leg back, a turn; about 300 KCAS at 20-24,000 ft. It does not turn to meet the receiver: the receiver joins it.
// The side of its turns depends on where it comes from (the game decides): the times use the line of the track (the turn as a stop of its length at
// each end, the place known within two turn radii), the drawings show the two possible racetracks.
// A-A TACAN: the KC-10 gives distance and bearing, the KC-135 and the KC-130H the distance only. Drogue (probe): KC-135, KC/DC-10, KC-130H, C-160R NG,
// IL-78M (since BMS 4.36); boom: KC-135 and KC/DC-10.
import { timed, posAt } from './sead.js';
import { atmos, machFromCas } from './airperf.js';

export const KM_NM = 1.852;
const FT_NM = 6076.12,
  KT_FTS = 1.68781;
export const TANKER_KCAS = 300, // the tanker on its track (Training Manual: about 300-305 kt)
  TURN_BANK = 30,
  OVERTAKE = 100, // kt of overtake beyond 2 NM, then 10 kt per 1,000 ft
  JOIN_BELOW = 1000, // ft below the tanker to join
  RATE = 1000; // lb a minute: the flow of fuel, an estimate (BMS does not give it)

export { PROBE, methodOf, tankerKind, serves } from '../rules/tankers.js';

// ---- the track
export const hm = t => {
  const m = Math.floor((t || 0) / 60000);
  return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
const brg = (dx, dy) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
/** the true airspeed (kt) of a calibrated airspeed at an altitude (ISA) */
export const tasOf = (kcas, altFt) => {
  const A = atmos(altFt);
  return machFromCas(kcas, A) * A.a;
};
/** the turn radius (NM) at a TAS and a bank */
export const turnNm = (tas, bank = TURN_BANK) =>
  (tas * KT_FTS) ** 2 / (32.174 * Math.tan((bank * Math.PI) / 180)) / FT_NM;
/**
 * The track of a tanker from its route (the campaign waypoints): the two track steerpoints, the time on station, the altitude, the speed and the racetrack.
 * null without two track steerpoints.
 * @returns {{w: any[], a: {x: number, y: number}, b: {x: number, y: number}, t0: number, t1: number, alt: number, tas: number, kcas: number,
 *   leg: number, r: number, hdg: number, per: number} | null}
 */
export function trackOf(wps) {
  const w = timed(wps || []),
    g = w.filter(p => p.act == 24);
  if (g.length < 2) return null;
  const a = { x: g[0].x, y: g[0].y },
    b = { x: g[1].x, y: g[1].y },
    alt = Math.round((g[0].z || 0) * 10) || 22000,
    tas = tasOf(TANKER_KCAS, alt),
    leg = Math.hypot(b.x - a.x, b.y - a.y) / KM_NM,
    r = turnNm(tas),
    last = g[g.length - 1];
  return {
    w,
    a,
    b,
    t0: g[0].arr,
    t1: last.dep > last.arr ? last.dep : last.arr,
    alt,
    tas,
    kcas: TANKER_KCAS,
    leg,
    r,
    hdg: brg(b.x - a.x, b.y - a.y),
    per: ((2 * leg + 2 * Math.PI * r) / tas) * 3600000,
  };
}
/** a point s NM along the racetrack from the first track steerpoint: {x, y, hdg}; side: -1 turns left, 1 right, 0 on the line of the track (the
 * turns not known: the tanker waits the time of a turn at each end) */
export function onTrack(T, s, side = 0) {
  const L = T.leg,
    r = T.r,
    P = 2 * L + 2 * Math.PI * r;
  s = ((s % P) + P) % P;
  const ux = (T.b.x - T.a.x) / (L * KM_NM),
    uy = (T.b.y - T.a.y) / (L * KM_NM),
    nx = side < 0 ? -uy : uy, // the side of the turns
    ny = side < 0 ? ux : -ux,
    R = r * KM_NM,
    at = (p, dx, dy) => ({ x: p.x, y: p.y, hdg: brg(dx, dy) });
  if (s <= L) return at({ x: T.a.x + ux * s * KM_NM, y: T.a.y + uy * s * KM_NM }, ux, uy);
  s -= L;
  if (!side) {
    const t = Math.PI * r;
    if (s <= t) return at(T.b, ux, uy);
    if (s <= t + L) return at({ x: T.b.x - ux * (s - t) * KM_NM, y: T.b.y - uy * (s - t) * KM_NM }, -ux, -uy);
    return at(T.a, -ux, -uy);
  }
  if (s <= Math.PI * r) {
    const f = s / r,
      cx = T.b.x + nx * R,
      cy = T.b.y + ny * R;
    return at(
      { x: cx - nx * R * Math.cos(f) + ux * R * Math.sin(f), y: cy - ny * R * Math.cos(f) + uy * R * Math.sin(f) },
      nx * Math.sin(f) + ux * Math.cos(f),
      ny * Math.sin(f) + uy * Math.cos(f)
    );
  }
  s -= Math.PI * r;
  if (s <= L) return at({ x: T.b.x + 2 * nx * R - ux * s * KM_NM, y: T.b.y + 2 * ny * R - uy * s * KM_NM }, -ux, -uy);
  const f = (s - L) / r,
    cx = T.a.x + nx * R,
    cy = T.a.y + ny * R;
  return at(
    { x: cx + nx * R * Math.cos(f) - ux * R * Math.sin(f), y: cy + ny * R * Math.cos(f) - uy * R * Math.sin(f) },
    -nx * Math.sin(f) - ux * Math.cos(f),
    -ny * Math.sin(f) - uy * Math.cos(f)
  );
}
/** a racetrack (side -1 left, 1 right) as a closed line of points */
export const racetrack = (T, side, n = 72) =>
  Array.from({ length: n }, (_, i) => onTrack(T, (i / n) * (2 * T.leg + 2 * Math.PI * T.r), side)).map(p => ({
    x: p.x,
    y: p.y,
  }));
/** where the tanker is at a time: on its track while on station, else on its route ({x, y, hdg}); null when it does not fly then */
export function tankerAt(T, t) {
  if (t >= T.t0 && t <= T.t1) return onTrack(T, ((t - T.t0) / 3600000) * T.tas);
  const p = posAt(T.w, t);
  return p ? { x: p.x, y: p.y, hdg: p.hdg } : null;
}

// ---- the join
/** seconds to close from a gap (NM) behind the tanker to the pre-contact: 100 kt of overtake, from 10,000 ft 10 kt per 1,000 ft, 10 kt inside 1,000 ft */
export function closeSec(gapNm) {
  const g = Math.max(0, gapNm) * FT_NM,
    a = g > 10000 ? (g - 10000) / (OVERTAKE * KT_FTS) : 0,
    g2 = Math.min(g, 10000),
    b = g2 > 1000 ? Math.log(g2 / 1000) / (0.01 * KT_FTS) : 0,
    c = (Math.min(g, 1000) - 50) / (10 * KT_FTS);
  return a + b + Math.max(0, c);
}
/**
 * The rendezvous. o: {T (trackOf), mode: 'enr' | 'anchor', gap (NM: the tanker ahead at the ARIP), plan (the planned time at the Refuel steerpoint),
 * from {x, y, t}: the steerpoint before it (its departure)}.
 * EN ROUTE: the join (ARCT) at the planned time, where the tanker is then (ARCP); the ARIP on the path of the tanker, the gap behind it.
 * ANCHOR: the ARIP the gap behind the anchor on the line of the track; the receiver there when the tanker passes the anchor (the pass nearest to the
 * plan), the join on the first leg.
 * @returns {{mode: string, arct: number, tip: number, arcp: {x: number, y: number, hdg: number}, arip: {x: number, y: number}, anchor: {x: number, y: number},
 *   close: number, shift: number, gs: number | null, warn: [string, boolean][]} | null}
 */
export function rendezvous(o) {
  const T = o.T,
    close = closeSec(o.gap) * 1000,
    warn = [];
  let arct, tip, arcp, arip;
  if (o.mode == 'anchor') {
    const n = Math.max(0, Math.round((o.plan - close - T.t0) / T.per));
    let tp = T.t0 + n * T.per;
    if (tp > T.t1 && n > 0) tp -= T.per;
    tip = tp;
    arct = tp + close;
    const ux = (T.b.x - T.a.x) / (T.leg * KM_NM),
      uy = (T.b.y - T.a.y) / (T.leg * KM_NM);
    arip = { x: T.a.x - ux * o.gap * KM_NM, y: T.a.y - uy * o.gap * KM_NM };
    arcp = tankerAt(T, arct);
    if ((close / 3600000) * T.tas > T.leg)
      warn.push(['The join falls in the turn at the end of the leg: make the gap at the ARIP smaller.', true]);
  } else {
    arct = o.plan;
    tip = arct - close;
    arcp = tankerAt(T, arct);
    const p = tankerAt(T, tip - (o.gap / T.tas) * 3600000);
    arip = p ? { x: p.x, y: p.y } : null;
  }
  if (!arcp || !arip) return null;
  if (arct < T.t0)
    warn.push([
      'The tanker is not on its track yet at the ARCT (on station ' + hm(T.t0) + '): you join it on its way.',
      false,
    ]);
  if (arct > T.t1) warn.push(['The tanker leaves its track at ' + hm(T.t1) + ', before the ARCT.', true]);
  let gs = null;
  if (o.from) {
    const nm = Math.hypot(arip.x - o.from.x, arip.y - o.from.y) / KM_NM,
      h = (tip - o.from.t) / 3600000;
    gs = h > 0 ? nm / h : null;
    if (gs == null || gs > 600)
      warn.push(['Too late for the ARIP from the steerpoint before: push earlier or fly faster.', true]);
    else if (gs < 250)
      warn.push([
        'Early for the ARIP: push at ' + hm(tip - (nm / 400) * 3600000) + ' (400 kt) or hold before it.',
        false,
      ]);
  }
  return {
    mode: o.mode,
    arct,
    tip,
    arcp,
    arip,
    anchor: { ...T.a },
    close,
    shift: arct - o.plan,
    gs,
    warn,
  };
}

// ---- the fuel
/**
 * The fuel at the tanker and what to take. o: {at (lb on board at the join), need (lb needed after the tanker to fly the rest and land with the reserve),
 * full (lb: the tanks full), joker (lb over the need), fill: 'full' | 'joker' | 'amount', amount (lb)}.
 * @returns {{onload: number, after: number, min: number, short: boolean}}
 */
export function onload(o) {
  const up = v => Math.ceil(v / 100 - 1e-9) * 100,
    to =
      o.fill == 'amount'
        ? Math.min(o.full, o.at + Math.max(0, o.amount))
        : o.fill == 'joker'
          ? Math.min(o.full, up(o.need + o.joker))
          : o.full,
    on = Math.max(0, Math.round(to - o.at));
  return { onload: on, after: o.at + on, min: on / RATE, short: o.at + on < o.need };
}

// ---- the procedure (the calls by their names in the menus of the game: each pilot sends them his own way)
export const CALLS = {
  tanker: ['Request Air Flight Refueling', 'Back in Pre-Contact Position', 'Done Refueling', 'Terminate Flight Refuel'],
  awacs: ['Vector to Tanker', 'Vector to Nearest Tanker'],
};
/** the steps of the refuelling: [[when, what]] for the boom or the probe; obs: the observation position of the SOP ('left' | 'right') */
export function procedure(method, obs = 'left') {
  const boom = method != 'probe';
  return [
    ['Before 10 NM', 'Emitters safe or off · Master Arm SAFE · lights as the SOP'],
    ['Call', 'Request Air Flight Refueling (or Element / Individual)'],
    [
      '5 NM',
      boom ? 'AR door OPEN (400 KCAS / M .85 at most to open, 420 / .95 open) · RDY light' : 'Refuelling probe OUT',
    ],
    [
      'Join',
      JOIN_BELOW.toLocaleString('en-US') + ' ft below · overtake 10 kt per 1,000 ft, 10 kt at most inside 1,000 ft',
    ],
    ['Observation', (obs == 'right' ? 'Right' : 'Left') + ' wing of the tanker until your turn'],
    [
      'Pre-contact',
      boom
        ? '50 ft below and behind the boom, 30° down · wait to be cleared to contact'
        : 'Stable behind the basket · then a small closure into it',
    ],
    ['Contact', 'Hold the position · the tanker calls "1000 lbs to go"'],
    ['After', 'Done Refueling · reform on the right wing · the last one: Terminate Flight Refuel'],
  ];
}

/** a nav offset from a steerpoint to a point: {brg (true), rngFt, nm} */
export function offset(from, p) {
  const nm = Math.hypot(p.x - from.x, p.y - from.y) / KM_NM;
  return { brg: Math.round(brg(p.x - from.x, p.y - from.y)) || 360, rngFt: Math.round(nm * FT_NM), nm };
}

// Fuel along the flight plan of a flight (the steerpoints of the Datacard): what has to be on board on arriving at each steerpoint to fly the rest of the plan and
// land with the reserve. Works backwards from the landing. Uses the BMS aircraft tables (airperf.js). Pure maths.
// wps: [{x, y (km), z (altitude / 10 ft), arr, dep (ms), act}] as in the campaign; o: {empty, stores, di, dIsa, reserve, tanker, jokerMargin, loaded, wind}
// o.wind(x, y, timeMs, altFt) -> {spd, hdg, alt} | null: the wind aloft (hdg = where it comes from) of the layer nearest to the altitude. Each leg uses the wind at its middle, at the
// time of its middle and at its mean altitude; the headwind along the track turns the ground speed (from the plan times) into an airspeed.
import * as P from './airperf.js';

const BASIC = [0, 1, 2, 3, 4, 7, 8]; // actions that are not "activity" (nav, take-off, push, split, refuel, land, hold)
const MINGS = 300,
  NM_KM = 0.539957,
  up100 = v => Math.ceil(v / 100 - 1e-9) * 100;

// fuel (lb) burned in a leg: from altitude a0 to a1 (ft) over distNm in tSec; level flight power plus the climb, idle when the thrust needed is lower
function legBurn(ac, W, o, a0, a1, distNm, tSec, hw) {
  if (!(tSec > 0)) return { burn: 0, mach: 0, ab: false };
  // a campaign plan can leave hours between two close steerpoints (the flight waits on the ground or the time is set for the target): that slack is not flown.
  // A leg that would need less than MINGS knots is flown at MINGS; the explicit dwell (arrival -> departure) is counted apart
  if (distNm / (tSec / 3600) < MINGS && distNm > 0) tSec = (distNm / MINGS) * 3600;
  const gs = distNm / (tSec / 3600),
    hm = (a0 + a1) / 2,
    A = P.atmos(hm, o.dIsa || 0),
    M = Math.min(2.2, Math.max(0.3, (gs + (hw || 0)) / A.a)); // airspeed = ground speed + headwind
  const pt = P.point(ac, { W, alt: hm, M, dIsa: o.dIsa || 0, di: o.di || 0 });
  if (pt.stall) return { burn: 0, mach: M, ab: true, stall: true };
  const climb = distNm > 0 ? (a1 - a0) / (distNm * 6076.12) : 0,
    treq = pt.D + W * Math.max(-0.3, Math.min(0.5, climb));
  const pw = P.powerFor(ac, hm, M, treq) || { mode: 'ab', ...P.engine(ac, hm, M, 'ab') },
    ff = pw.ff;
  return { burn: (ff * tSec) / 3600, mach: M, ab: pw.mode == 'ab' && !P.powerFor(ac, hm, M, treq) };
}
// holding / orbiting: at the speed of the leg that brought the aircraft there, but not faster than Mach .85 nor slower than Mach .5
function dwellBurn(ac, W, o, alt, mach, tSec) {
  if (!(tSec > 0)) return 0;
  const M = Math.min(0.85, Math.max(0.5, mach || 0.6)),
    pt = P.point(ac, { W, alt, M, dIsa: o.dIsa || 0, di: o.di || 0 });
  if (pt.stall) return 0;
  const pw = P.powerFor(ac, alt, M, pt.D) || P.engine(ac, alt, M, 'ab');
  return (pw.ff * tSec) / 3600;
}

export function fuelPlan(ac, wps0, o) {
  const end = wps0.findIndex((p, i) => i > 0 && p.act == 7),
    wps = end > 0 ? wps0.slice(0, end + 1) : wps0; // the plan ends at the first landing; what follows (alternate) is not counted
  const n = wps.length,
    empty = o.empty != null ? o.empty : ac.af.emptyLb,
    base = empty + (o.stores || 0),
    reserve = o.reserve == null ? 1500 : o.reserve,
    tanker = o.tanker == null ? 1000 : o.tanker;
  const alt = i => wps[i].z * 10,
    dist = i => Math.hypot(wps[i].x - wps[i - 1].x, wps[i].y - wps[i - 1].y) * NM_KM;
  const leg = [],
    dwell = [];
  let lastMach = 0.7;
  // times: from the departure of the previous point (or its arrival) to the arrival; the dwell is arrival -> departure
  for (let i = 0; i < n; i++) {
    const p = wps[i],
      q = i ? wps[i - 1] : null;
    let t = 0;
    if (q && p.arr && (q.dep || q.arr)) t = (p.arr - (q.dep || q.arr)) / 1000;
    if (q && !(t > 0)) t = (dist(i) / 420) * 3600; // no time in the plan: 420 kt
    leg[i] = q ? { nm: dist(i), t, hw: 0, wind: null } : null;
    if (q && o.wind) {
      const dx = p.x - q.x,
        dy = p.y - q.y,
        t0 = q.dep || q.arr,
        tm = t0 ? t0 + (t > 0 ? t : 0) * 500 : p.arr || null,
        w = dx || dy ? o.wind((p.x + q.x) / 2, (p.y + q.y) / 2, tm, (alt(i - 1) + alt(i)) / 2) : null;
      if (w && w.spd >= 0) {
        leg[i].wind = w;
        leg[i].hw = w.spd * Math.cos((w.hdg * Math.PI) / 180 - Math.atan2(dx, dy));
      }
    }
    dwell[i] = p.dep && p.arr && p.dep > p.arr && i && i < n - 1 ? (p.dep - p.arr) / 1000 : 0;
  }
  const arrive = new Array(n).fill(0),
    mach = new Array(n).fill(0.7),
    burnLeg = new Array(n).fill(0),
    burnDw = new Array(n).fill(0),
    flags = [];
  arrive[n - 1] = reserve;
  for (let i = n - 1; i >= 1; i--) {
    let b = 0,
      m = 0.7,
      dw = 0,
      ab = false;
    const guess = arrive[i];
    for (let k = 0; k < 3; k++) {
      // the weight depends on the fuel: a few passes
      const r = legBurn(ac, base + guess + b / 2, o, alt(i - 1), alt(i), leg[i].nm, leg[i].t, leg[i].hw);
      b = r.burn;
      m = r.mach;
      ab = r.ab;
      dw = dwellBurn(ac, base + guess + b, o, alt(i - 1), m, dwell[i - 1]);
    }
    burnLeg[i] = b;
    mach[i] = m;
    burnDw[i - 1] = dw;
    if (ab) flags.push(i);
    arrive[i - 1] = wps[i - 1].act == 4 && i - 1 > 0 ? tanker : arrive[i] + b + dw; // at the tanker the fuel is taken as `tanker` lb on arrival
  }
  const rows = wps.map((p, i) => ({
    i,
    act: p.act,
    alt: alt(i),
    nm: leg[i] ? leg[i].nm : 0,
    t: leg[i] ? leg[i].t : 0,
    mach: mach[i],
    burn: burnLeg[i],
    dwell: dwell[i],
    min: up100(arrive[i]),
    minExact: arrive[i],
    tanker: wps[i].act == 4 && i > 0,
    hw: leg[i] ? leg[i].hw : 0,
    wind: leg[i] ? leg[i].wind : null,
  }));
  // bingo: the Min.Fuel of the steerpoint after the last activity; without an activity, the one before the landing
  let last = -1;
  wps.forEach((p, i) => {
    if (!BASIC.includes(p.act)) last = i;
  });
  const bi = last >= 0 ? Math.min(n - 1, last + 1) : Math.max(1, n - 2),
    bingo = rows[bi].min,
    joker = up100(bingo + (o.jokerMargin == null ? 1000 : o.jokerMargin));
  const toFuel = rows[0].min;
  wps0
    .slice(n)
    .forEach((p, k) =>
      rows.push({
        i: n + k,
        act: p.act,
        alt: p.z * 10,
        nm: 0,
        t: 0,
        mach: 0,
        burn: 0,
        dwell: 0,
        min: null,
        minExact: null,
        tanker: false,
      })
    );
  return {
    rows,
    toFuel,
    bingo,
    bingoIdx: bi,
    joker,
    reserve,
    flags,
    short: o.loaded != null && toFuel > o.loaded ? toFuel - o.loaded : 0,
  };
}
// the altitude to climb to: the highest steerpoint altitude from the first one to the first activity, at least 15 000 ft (a low-level flight still gets a climb speed)
export function climbAltitude(wps) {
  let h = 0;
  for (let i = 1; i < wps.length; i++) {
    h = Math.max(h, wps[i].z * 10);
    if (!BASIC.includes(wps[i].act)) break;
  }
  return Math.min(45000, Math.max(15000, Math.round(h / 1000) * 1000));
}

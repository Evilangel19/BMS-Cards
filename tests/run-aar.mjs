// Performance > AAR (core/aar.js): the tanker kinds, the racetrack, where the tanker is, the closure, the rendezvous, the fuel. Made-up data, no BMS file.
import {
  methodOf,
  serves,
  tankerKind,
  trackOf,
  onTrack,
  tankerAt,
  closeSec,
  rendezvous,
  onload,
  procedure,
  offset,
  racetrack,
  KM_NM,
} from '../app/js/core/aar.js';
import { prefer } from '../app/js/rules/tankers.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
const near = (a, b, e) => Math.abs(a - b) <= e;

// the method of the receiver and what the tankers give (BMS 4.36+: the KC-135 and the KC-10 have a drogue too)
ok('F-16 takes the boom', methodOf('F-16CM-50') == 'boom');
ok('F/A-18 takes the drogue', methodOf('F/A-18C') == 'probe');
ok('KC-135 serves the probe', serves('KC-135', 'probe') === true);
ok('KC-130 does not serve the boom', serves('KC-130H', 'boom') === false);
ok('KC-10: distance and bearing', tankerKind('KC-10A').tcn == 'brg');
ok('KC-135: distance only', tankerKind('KC-135R').tcn == 'dme');
ok(
  'probe: a KC-130 before a KC-135, which comes before none',
  prefer('KC-130H', 'probe') > prefer('KC-135R', 'probe') && prefer('KC-135R', 'probe') > 0
);
ok('boom: never a KC-130', prefer('KC-130H', 'boom') == 0 && prefer('KC-10A', 'boom') == 2);
ok('an unknown type: not known', serves('XYZ', 'boom') === null);

// a tanker: take-off, nav, the track 50 NM north (two action-24 steerpoints) from 10:00 to 11:30, land
const H = 3600000,
  t0 = 10 * H,
  L = 50 * KM_NM,
  wps = [
    { x: 0, y: -200, z: 0, act: 1, arr: 9 * H, dep: 9 * H },
    { x: 0, y: -100, z: 2200, act: 0, arr: 9.5 * H, dep: 0 },
    { x: 0, y: 0, z: 2200, act: 24, arr: t0, dep: 0 },
    { x: 0, y: L, z: 2200, act: 24, arr: t0 + 0.12 * H, dep: 11.5 * H },
    { x: 0, y: -200, z: 0, act: 7, arr: 12 * H, dep: 0 },
  ],
  T = trackOf(wps);
ok('the track: 50 NM legs, north, 22,000 ft', T && near(T.leg, 50, 0.01) && near(T.hdg, 0, 0.01) && T.alt == 22000);
ok('300 KCAS at 22,000 ft is about 415 KTAS ' + (T && T.tas), T && near(T.tas, 415, 15));
ok('turn radius at 30° of bank about 4.4 NM ' + (T && T.r), T && near(T.r, 4.4, 0.4));
ok('on station 10:00 to 11:30', T && T.t0 == t0 && T.t1 == 11.5 * H);
// along the racetrack: the end of the first leg, the far end of the turn (2 radii to the left: west), back at the anchor after a period
const e1 = onTrack(T, 50, -1),
  e2 = onTrack(T, 50 + Math.PI * T.r, -1),
  e2r = onTrack(T, 50 + Math.PI * T.r, 1),
  e3 = onTrack(T, 2 * 50 + 2 * Math.PI * T.r, -1);
ok('end of the first leg', near(e1.x, 0, 0.01) && near(e1.y, L, 0.01) && near(e1.hdg, 0, 0.5));
ok(
  'after the left turn: west of the track, heading south',
  near(e2.x, -2 * T.r * KM_NM, 0.01) && near(e2.hdg, 180, 0.5)
);
ok('after the right turn: east of the track', near(e2r.x, 2 * T.r * KM_NM, 0.01));
ok('a whole period: back at the anchor', near(e3.x, 0, 0.01) && near(e3.y, 0, 0.01));
const half = onTrack(T, 50 + (Math.PI * T.r) / 2, -1);
ok('middle of the turn: beyond the second point, heading west', half.y > L && near(half.hdg, 270, 0.5));
ok('the racetrack is a closed line', racetrack(T, -1).length == 72);
// the side not known: on the line of the track, a stop of the time of a turn at each end
const m1 = onTrack(T, 50 + 1),
  m2 = onTrack(T, 50 + Math.PI * T.r + 10);
ok('side not known: at the far end during the turn', near(m1.x, 0, 0.001) && near(m1.y, L, 0.01));
ok(
  'side not known: back on the line, heading south',
  near(m2.x, 0, 0.001) && near(m2.y, L - 10 * KM_NM, 0.01) && near(m2.hdg, 180, 0.5)
);
// where the tanker is: on its route before the track, on the track after
const p1 = tankerAt(T, 9.75 * H),
  p2 = tankerAt(T, t0 + (25 / T.tas) * H);
ok('before the track: on its route', p1 && near(p1.y, -50, 0.5));
ok('25 NM along the first leg', p2 && near(p2.y, 25 * KM_NM, 0.01));
ok('after the station: null', tankerAt(T, 13 * H) === null);

// the closure: 100 kt to 10,000 ft, then 10 kt per 1,000 ft, then 10 kt to 50 ft
const c6 = closeSec(6);
ok('closure from 6 NM about 5.8 min ' + (c6 / 60).toFixed(2), near(c6, 349, 10));
ok('a larger gap takes longer', closeSec(10) > c6 && closeSec(1) < c6);

// EN ROUTE: the join at the planned time where the tanker is; the ARIP on its path, the gap behind it
const plan = t0 + 0.115 * H,
  from = { x: 0, y: -150, t: plan - 0.4 * H },
  R = rendezvous({ T, mode: 'enr', gap: 6, plan, from });
ok('en route: the ARCT is the plan', R && R.arct == plan && R.shift == 0);
ok('en route: the ARIP before the join on the track', R && R.arip.y < R.arcp.y && near(R.arcp.x, 0, 0.01));
ok('en route: the tanker 6 NM ahead at the ARIP', R && near((tankerAt(T, R.tip).y - R.arip.y) / KM_NM, 6, 0.05));
ok('en route: a ground speed to the ARIP ' + (R && R.gs), R && R.gs > 200 && R.gs < 600 && !R.warn.some(w => w[1]));
const early = rendezvous({ T, mode: 'enr', gap: 6, plan, from: { x: 0, y: -60, t: plan - 0.5 * H } });
ok('early: a note with the push time', early && early.warn.some(w => !w[1] && /^Early/.test(w[0])));
// ANCHOR: the ARIP 6 NM behind the anchor, the receiver there as the tanker passes the anchor
const A = rendezvous({ T, mode: 'anchor', gap: 6, plan: t0 + 1.0 * H, from: null });
ok('anchor: the ARIP 6 NM behind the anchor', A && near(A.arip.y, -6 * KM_NM, 0.01));
ok(
  'anchor: at the ARIP on a pass of the tanker over the anchor',
  A && near(Math.round((A.tip - t0) / T.per) * T.per, A.tip - t0, 1)
);
ok('anchor: the join on the first leg', A && A.arcp.y > 0 && A.arcp.y < L && near(A.arcp.x, 0, 0.01));
ok('anchor: no warning', A && !A.warn.length);
const A2 = rendezvous({ T, mode: 'anchor', gap: 20, plan: t0 + 1.0 * H, from: null });
ok('anchor: a large gap puts the join in the turn', A2 && A2.warn.some(w => w[1]));
const late = rendezvous({ T, mode: 'enr', gap: 6, plan: 12 * H, from: null });
ok('the tanker gone at the ARCT: null or a red warning', !late || late.warn.some(w => w[1]));

// the fuel: full, to the joker, an amount
const f = { at: 3000, need: 5200, full: 12000, joker: 1000, amount: 4000 };
ok('full: 9000 lb', onload({ ...f, fill: 'full' }).onload == 9000);
ok('joker: to 6200 lb', onload({ ...f, fill: 'joker' }).after == 6200);
ok('amount 4000: after 7000', onload({ ...f, fill: 'amount' }).after == 7000);
ok('too little: short', onload({ ...f, fill: 'amount', amount: 1000 }).short);
ok('the transfer time', onload({ ...f, fill: 'full' }).min == 9);

// the procedure and the offsets
ok(
  'boom: the AR door',
  procedure('boom').some(r => /AR door/.test(r[1]))
);
ok(
  'probe: the probe, no AR door',
  procedure('probe').some(r => /probe OUT/.test(r[1])) && !procedure('probe').some(r => /AR door/.test(r[1]))
);
ok(
  'observation right',
  procedure('boom', 'right').some(r => /^Right wing/.test(r[1]))
);
const o = offset({ x: 0, y: 0 }, { x: 0, y: -6 * KM_NM });
ok('offset 180°, 6 NM ' + JSON.stringify(o), o.brg == 180 && o.rngFt == 36457);

console.log(bad ? `${bad} of ${n} FAILED` : `aar: ${n} checks ok`);
process.exit(bad ? 1 : 0);

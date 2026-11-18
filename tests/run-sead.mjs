// SEAD planning (core/sead.js) on made-up flight plans: the WEZ entry, the impact at 85% of the ring radius, the launch from where the SEAD flight is
// then (impact - time of flight, the time of flight from that range), out of range and its fix, the sort of the shots among the aircraft (Priority,
// Azimuth, by hand, the HARMs of each aircraft), the 9 nm/min rule for a steerpoint without a time.
import { seadPlan, timed, posAt, inside, BACKUP_NM_MIN } from '../app/js/core/sead.js';
let n = 0,
  bad = 0;
const ck = (name, ok, x) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name, x === undefined ? '' : JSON.stringify(x));
  }
};
const KMH = kt => kt * 1.852,
  T0 = 10 * 3600000;
// a straight route north from (x, 0) to (x, 120 km) at kt, starting at t0
const route = (x, kt, t0 = T0, y0 = 0, y1 = 120) => [
  { x, y: y0, z: 2500, arr: t0, dep: 0, act: 0 },
  { x, y: y1, z: 2500, arr: t0 + ((y1 - y0) / KMH(kt)) * 3600000, dep: 0, act: 0 },
];
const viper = route(0, 480),
  sams = [{ id: 'a', x: 5, y: 60, rng: 25, name: 'SA-6', code: 106 }],
  shot =
    (rTh = 25) =>
    () => ({ rTh, rMax: rTh, vm: 0.33 });
const base = (o = {}) =>
  seadPlan({
    prot: [{ key: 'v', name: 'Viper 2', wps: viper }],
    sead: { wps: route(-20, 450, T0 - 120000), n: 2, harms: [2, 2] },
    sams,
    shot: shot(),
    ...o,
  });
const P = base(),
  r = P.rows[0],
  T = (y, kt = 480) => T0 + (y / KMH(kt)) * 3600000;
ck('one SAM crossed, by Viper 2', P.rows.length == 1 && r.flight == 'Viper 2', P.rows.length);
ck(
  'WEZ entry where the route meets the ring (y = 60 - 24.49 km)',
  Math.abs(r.tin - T(60 - Math.sqrt(25 * 25 - 25))) < 300,
  [r.tin, T(35.5)]
);
ck(
  'impact at 85% of the radius (21.25 km from the SAM)',
  Math.abs(r.t85 - T(60 - Math.sqrt(21.25 * 21.25 - 25))) < 300
);
ck('...the impact point is at 85% of the radius', Math.abs(Math.hypot(r.p85.x - 5, r.p85.y - 60) - 21.25) < 0.2);
const L = r.launch,
  sp = posAt(timed(route(-20, 450, T0 - 120000)), L.t);
ck('the launch: the SEAD flight is there at the launch time', sp && Math.hypot(sp.x - L.x, sp.y - L.y) < 0.05);
ck('...the time of flight is the range over the missile speed', Math.abs(L.d / 0.33 - (r.t85 - L.t) / 1000) < 1, [
  L.d,
  L.tof,
]);
ck('...in range, its bearing to the SAM, the seat #1', L.ok && L.brg > 0 && L.brg < 180 && r.seat === 0, [
  L.brg,
  r.seat,
]);
ck('...outside the SAM ring by the margin', Math.abs(L.margin - (L.d - 25 / 1.852)) < 0.01);
// out of range: a fix in time
const F = base({ shot: shot(14), sead: { wps: route(-20, 450, T0 + 120000), n: 2, harms: [2, 2] } }).rows[0].launch;
ck(
  'out of range: flagged, with the nearest launch time that reaches (later: the SEAD flight is behind)',
  !F.ok && F.fix && F.fix.dt > 0,
  F
);
const F2 = base({ shot: shot(8) }).rows[0].launch;
ck('...and no fix when the route never comes within range', !F2.ok && F2.fix === null);
// the sort among the aircraft
const S2 = [
  { id: 'a', x: 5, y: 60, rng: 25, name: 'SA-6' },
  { id: 'b', x: -6, y: 90, rng: 20, name: 'SA-3' },
  { id: 'c', x: 8, y: 100, rng: 12, name: 'SA-8' },
];
const pr = base({ sams: S2 }).rows;
ck(
  'Priority: the first reached to the lead, the next to #2, then the lead again',
  pr.map(z => z.id).join() == 'a,b,c' && pr.map(z => z.seat).join() == '0,1,0',
  pr.map(z => [z.id, z.seat])
);
const az = base({ sams: S2, sort: 'az' }).rows,
  sa = Object.fromEntries(az.map(z => [z.id, z.seat]));
ck('Azimuth: from left to right (SA-3 on the left of the route first)', sa.b === 0, sa);
const hd = base({ sams: S2, seat: { c: 1 } }).rows.find(z => z.id == 'c');
ck('a seat chosen by hand stays', hd.seat === 1 && hd.hand);
const cap = base({ sams: S2, sead: { wps: route(-20, 450, T0 - 120000), n: 2, harms: [1, 1] } }).rows;
ck(
  'one HARM each: the third threat has no HARM left',
  cap[2].seat === null && cap[2].noHarm,
  cap.map(z => z.seat)
);
const sk = base({ sams: S2, skip: { a: true } }).rows;
ck(
  'a threat left out gets no seat and no launch; the others move up',
  !sk[0].launch && sk[0].seat == null && sk[1].seat === 0
);
// the 9 nm/min rule
const w = [
  { x: 0, y: 0, z: 2000, arr: T0, act: 0 },
  { x: 0, y: 18.52, z: 2000, arr: 0, act: 0 },
];
const tw = timed(w);
ck(
  'a steerpoint without a time: 9 nm/min from the last timed one (10 nm: 66.7 s)',
  tw.length == 2 && tw[1].est && Math.abs(tw[1].arr - T0 - (10 / BACKUP_NM_MIN) * 60000) < 1
);
ck('inside(): one interval for a straight crossing', inside(timed(viper), 5, 60, 25).length == 1);
ck(
  'a flight not crossing the ring is not a row',
  base({ sams: [{ id: 'z', x: 80, y: 60, rng: 10, name: 'X' }] }).rows.length == 0
);
console.log(bad ? `run-sead.mjs: ${bad} of ${n} FAILED` : `run-sead.mjs: OK - ${n} checks`);
process.exit(bad ? 1 : 0);

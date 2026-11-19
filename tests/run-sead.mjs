// SEAD planning (core/sead.js) on made-up flight plans: the WEZ entry, the first impact at 85% of the ring radius, the launch from where the SEAD flight
// is then, out of range and its fix, all the HARMs of the flight spread over the time inside the ring (the next one arriving when the cover of the last
// one ends: its glide to the max range; none with no glide), ingress first, 8 s between two launches of one aircraft, the sort (Priority, Azimuth, by
// hand), the task of the protected flight (strike, time on station), POS (a steerpoint: by hand, the PPT on the SAM, the flight plan) and HAD (the SAM),
// the 9 nm/min rule for a steerpoint without a time.
import { seadPlan, timed, posAt, inside, taskOf, BACKUP_NM_MIN, POS_AREA, MIN_GAP_S } from '../app/js/core/sead.js';
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
const route = (x, kt, t0 = T0, y0 = 0, y1 = 120) => [
  { x, y: y0, z: 2500, arr: t0, dep: 0, act: 0 },
  { x, y: y1, z: 2500, arr: t0 + ((y1 - y0) / KMH(kt)) * 3600000, dep: 0, act: 0 },
];
const viper = route(0, 480),
  SA6 = { id: 'a', x: 5, y: 60, rng: 25, name: 'SA-6', code: 106 },
  shot =
    (rTh = 25, rMax = 25) =>
    () => ({ rTh, rMax, vm: 0.33 });
const base = (o = {}) =>
  seadPlan({
    prot: [{ key: 'v', name: 'Viper 2', wps: viper }],
    sead: { wps: route(-20, 450, T0 - 120000), n: 2, harms: [1, 1] },
    sams: [SA6],
    shot: shot(),
    ...o,
  });
const P = base(),
  r = P.rows[0],
  z = r.shots[0],
  T = (y, kt = 480) => T0 + (y / KMH(kt)) * 3600000;
ck('one SAM crossed, by Viper 2', P.rows.length == 1 && r.flight == 'Viper 2', P.rows.length);
ck('WEZ entry where the route meets the ring', Math.abs(r.tin - T(60 - Math.sqrt(25 * 25 - 25))) < 300);
ck(
  'first impact at 85% of the radius',
  Math.abs(z.imp - T(60 - Math.sqrt(21.25 * 21.25 - 25))) < 300 &&
    Math.abs(Math.hypot(r.p85.x - 5, r.p85.y - 60) - 21.25) < 0.2
);
const L = z.launch,
  sp = posAt(timed(route(-20, 450, T0 - 120000)), L.t);
ck('the launch: the SEAD flight is there at the launch time', sp && Math.hypot(sp.x - L.x, sp.y - L.y) < 0.05);
ck('...the time of flight is the range over the missile speed', Math.abs(L.d / 0.33 - (z.imp - L.t) / 1000) < 1);
ck(
  '...in range, the seat #1, outside the ring by the margin',
  L.ok && z.seat === 0 && Math.abs(L.margin - (L.d - 25 / 1.852)) < 0.01
);
ck(
  'the cover of a HARM: to its max range (25 nm at 0.33 nm/s from the launch)',
  Math.abs(z.cover - (L.t + (25 / 0.33) * 1000)) < 1000,
  [z.cover - L.t]
);
const z2 = r.shots[1];
ck(
  'the second HARM: on the same SAM, arriving when the cover of the first ends, from #2',
  z2 && Math.abs(z2.imp - z.cover) < 1000 && z2.seat === 1,
  z2 && [z2.imp - z.cover, z2.seat]
);
ck(
  'two HARMs: what is not covered is listed (the rest of the time inside)',
  r.gaps.length == 1 && Math.abs(r.gaps[0].t0 - z2.cover) < 1000 && Math.abs(r.gaps[0].t1 - r.tout) < 1000
);
const NG = base({ glide: false }).rows[0];
ck(
  'no glide (TI and GI on): a HARM covers its impact only; the next one in the middle of what is left',
  NG.shots.length == 2 &&
    NG.shots[0].cover - NG.shots[0].imp <= 1000 &&
    Math.abs(NG.shots[1].imp - (NG.shots[0].cover + NG.tout) / 2) < 1000,
  NG.shots.map(z => (z.imp - NG.tin) / 1000)
);
const BIG = base({ shot: shot(25, 60), sead: { wps: route(-20, 450, T0 - 120000), n: 2, harms: [2, 2] } }).rows[0];
ck(
  'a long glide covers the whole time inside with fewer HARMs',
  BIG.gaps.length == 0 && BIG.shots.length < 4,
  BIG.shots.length
);
// one aircraft: 8 s between its launches
const one = base({ glide: false, sead: { wps: route(-20, 450, T0 - 120000), n: 1, harms: [4] } }).rows[0],
  tl = one.shots.map(s => s.launch.t).sort((a, b) => a - b);
ck(
  'one aircraft: at least 8 s between two launches',
  tl.every((t, i) => !i || t - tl[i - 1] >= MIN_GAP_S * 1000 - 1),
  tl.map(t => (t - tl[0]) / 1000)
);
// out of range: the fix
const F = base({ shot: shot(14), sead: { wps: route(-20, 450, T0 + 120000), n: 2, harms: [1, 1] } }).rows[0].shots[0]
  .launch;
ck('out of range: flagged, with the nearest launch time that reaches (later)', !F.ok && F.fix && F.fix.dt > 0, F);
const F2 = base({ shot: shot(8) }).rows[0];
ck(
  '...no fix when the route never comes within range; no extra shot then',
  !F2.shots[0].launch.ok && F2.shots[0].launch.fix === null && F2.shots.length == 1
);
// the sort among the aircraft: the first HARM of each SAM
const S2 = [
  { id: 'a', x: 5, y: 60, rng: 25, name: 'SA-6' },
  { id: 'b', x: -6, y: 90, rng: 20, name: 'SA-3' },
  { id: 'c', x: 8, y: 100, rng: 12, name: 'SA-8' },
];
const first = p => Object.fromEntries(p.rows.map(r => [r.id, r.shots[0] ? r.shots[0].seat : null]));
const pr = base({ sams: S2, sead: { wps: route(-20, 450, T0 - 120000), n: 2, harms: [2, 2] } });
ck(
  'Priority: the first reached to the lead, the next to #2, then the lead again',
  JSON.stringify(first(pr)) == '{"a":0,"b":1,"c":0}',
  first(pr)
);
const az = first(base({ sams: S2, sort: 'az', sead: { wps: route(-20, 450, T0 - 120000), n: 2, harms: [2, 2] } }));
ck('Azimuth: from left to right (SA-3 on the left of the route first)', az.b === 0, az);
const hd = base({
  sams: S2,
  seat: { c: 1 },
  sead: { wps: route(-20, 450, T0 - 120000), n: 2, harms: [2, 2] },
}).rows.find(z => z.id == 'c');
ck('a seat chosen by hand stays', hd.shots[0].seat === 1 && hd.shots[0].hand);
const cap = base({ sams: S2, sead: { wps: route(-20, 450, T0 - 120000), n: 2, harms: [1, 1] } }).rows;
ck('one HARM each: the third SAM has none', cap[2].shots.length == 0 && cap[2].noHarm);
const sk = base({ sams: S2, skip: { a: true } }).rows;
ck('a SAM left out gets no shot; the others move up', !sk[0].shots.length && sk[1].shots[0].seat === 0);
// the task of the protected flight: strike, time on station; ingress first
const stk = [
  { x: 0, y: 0, z: 2500, arr: T0, act: 0 },
  { x: 0, y: 60, z: 2500, arr: T(60), act: 17 },
  { x: 0, y: 0, z: 2500, arr: T(120), act: 0 },
];
const tk = taskOf(stk);
ck('the task: the strike steerpoint (STPT 2), no time on station', tk && tk.n == 2 && !tk.loiter && tk.t0 == T(60));
const cas = stk.map((p, i) => (i == 1 ? { ...p, act: 15, dep: p.arr + 15 * 60000 } : p)),
  tc = taskOf(cas);
ck('...CAS with 15 minutes on station: two times', tc.loiter && tc.t1 - tc.t0 == 15 * 60000);
// two SAMs: one met on the way in, one on the way out (the strike at y = 60 going north, back south): one extra HARM goes to the way in
const io = seadPlan({
  prot: [
    {
      key: 'v',
      name: 'Viper 2',
      wps: [
        { x: 0, y: 0, z: 2500, arr: T0, act: 0 },
        { x: 0, y: 100, z: 2500, arr: T(100), act: 17 },
        { x: 40, y: 0, z: 2500, arr: T(100) + (Math.hypot(40, 100) / KMH(480)) * 3600000, act: 0 },
      ],
    },
  ],
  sead: { wps: route(-20, 450, T0 - 120000, 0, 200), n: 1, harms: [3] },
  sams: [
    { id: 'in', x: 3, y: 50, rng: 25, name: 'IN' },
    { id: 'out', x: 25, y: 45, rng: 25, name: 'OUT' },
  ],
  glide: false,
  shot: shot(60),
});
const inR = io.rows.find(r => r.id == 'in'),
  outR = io.rows.find(r => r.id == 'out');
ck('ingress first: the HARM left goes to the SAM met on the way in', inR.shots.length == 2 && outR.shots.length == 1, [
  inR.shots.length,
  outR.shots.length,
]);
ck(
  '...its gaps are marked ingress / egress (the way back through the first ring too)',
  outR.gaps.every(g => !g.ing) && inR.gaps.some(g => !g.ing) && inR.gaps.filter(g => !g.ing).every(g => g.t0 > inR.tEnd)
);
// POS / HAD
const refs = [
  { n: 1, x: -20, y: 0 },
  { n: 2, x: 4.5, y: 61 },
  { n: 3, x: -20, y: 120 },
  { n: 57, x: 5.1, y: 60.1, ppt: true },
];
const pp = base({ mode: 'pos', refs }).rows[0];
ck('POS: the PPT on the SAM is its steerpoint (STPT 57)', pp.ref && pp.ref.n == 57 && pp.ref.inArea);
const pf = base({ mode: 'pos', refs: refs.slice(0, 3), sub: 'EOM' }).rows[0];
ck(
  'POS: no PPT, the nearest flight plan steerpoint that has the SAM in the seeker area (STPT 2, 0.6 nm)',
  pf.ref && pf.ref.n == 2 && pf.ref.inArea,
  pf.ref
);
const pfar = base({ mode: 'pos', refs: [refs[0], refs[2]], sub: 'EOM' }).rows[0];
ck(
  'POS: the nearest steerpoint is too far for EOM (1.4 nm): flagged',
  pfar.ref && !pfar.ref.inArea && POS_AREA.EOM < 1.5
);
const pfPB = base({ mode: 'pos', refs: [refs[0], { n: 9, x: 10, y: 60 }], sub: 'PB' }).rows[0];
ck('POS PB: 2.7 nm away is inside its wider area', pfPB.ref.n == 9 && pfPB.ref.inArea);
const ph = base({ mode: 'pos', refs, ref: { a: 3 } }).rows[0];
ck('POS: a steerpoint chosen by hand stays (flagged out of the area)', ph.ref.n == 3 && ph.ref.hand && !ph.ref.inArea);
const had = base({ mode: 'had', refs }).rows[0];
ck(
  'HAD: no steerpoint, the shot at the SAM',
  had.ref == null &&
    Math.abs(had.shots[0].launch.d - Math.hypot(had.shots[0].launch.x - 5, had.shots[0].launch.y - 60) / 1.852) < 0.01
);
// the 9 nm/min rule
const tw = timed([
  { x: 0, y: 0, z: 2000, arr: T0, act: 0 },
  { x: 0, y: 18.52, z: 2000, arr: 0, act: 0 },
]);
ck(
  'a steerpoint without a time: 9 nm/min from the last timed one',
  tw.length == 2 && tw[1].est && Math.abs(tw[1].arr - T0 - (10 / BACKUP_NM_MIN) * 60000) < 1
);
ck('inside(): one interval for a straight crossing', inside(timed(viper), 5, 60, 25).length == 1);
ck(
  'a flight not crossing the ring is not a row',
  base({ sams: [{ id: 'z', x: 80, y: 60, rng: 10, name: 'X' }] }).rows.length == 0
);
console.log(bad ? `run-sead.mjs: ${bad} of ${n} FAILED` : `run-sead.mjs: OK - ${n} checks`);
process.exit(bad ? 1 : 0);

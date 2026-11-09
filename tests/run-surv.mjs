// AWACS and JSTARS rows of the card when the package has none assigned (rules/support.js: pickSurv, survRows). A small campaign made here, no BMS data.
import { pickSurv, survRows } from '../app/js/rules/support.js';

let n = 0,
  bad = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    bad++;
    console.error('FAIL', m);
  }
};
const H = 3600e3;
// mission names as in the strings of BMS (C.D.S[300 + omis])
const S = { 301: 'BARCAP', 326: 'AEW/ABCCC', 327: 'ELINT', 328: 'AIR REFUEL' };
// a flight: on station from t0 to t1 (hours) at x,y (km)
const fl = (id, omis, owner, t0, t1, x, y) => ({
  kind: 'flight',
  id: { n: id, c: 0 },
  pkg: { n: 900 + id, c: 0 },
  omis,
  owner,
  wps: [
    { act: 1, arr: (t0 - 1) * H, x: 0, y: 0 },
    { act: 20, arr: t0 * H, dep: t1 * H, x, y },
    { act: 7, arr: (t1 + 1) * H, x: 0, y: 0 },
  ],
});
const make = units => {
  const C = { D: { S }, units, byId: {}, stance: null };
  units.forEach(u => (C.byId[u.id.n + ':' + u.id.c] = u));
  return C;
};
// the player's flight (team 2) in its own package, 00:30 - 01:20, around 500,200
const me = {
  ...fl(1, 1, 2, 0.5, 1.33, 500, 200),
  wps: [
    { act: 1, arr: 0.5 * H, x: 480, y: 180 },
    { act: 20, arr: 0.8 * H, dep: 1.2 * H, x: 510, y: 220 },
    { act: 7, arr: 1.33 * H, x: 480, y: 180 },
  ],
};
const pkg = {
  kind: 'pkg',
  id: { n: 901, c: 0 },
  els: [{ n: 1, c: 0 }],
  awacs: { n: 0, c: 0 },
  jstar: { n: 0, c: 0 },
  tanker: { n: 0, c: 0 },
};
const rows = (C, P = pkg) => survRows(C, me, P).map(([u, r, e]) => [u.id.n, r, e]);

{
  // the case of Jackal 2: one RC-135 (ELINT) on station, no AEW/ABCCC flight: it goes to the JSTARS row, the AWACS row stays empty
  const C = make([me, pkg, fl(10, 27, 2, -3, 3, 500, 120), fl(11, 27, 2, 2.5, 8, 490, 360)]);
  ok(
    pickSurv(C, me, 'ELINT')?.id.n === 10,
    'the ELINT flight on station during the package (not the one that comes later)'
  );
  ok(
    JSON.stringify(rows(C)) === JSON.stringify([[10, 3, true]]),
    'a single ELINT flight: JSTARS row, with an asterisk; no AWACS: ' + JSON.stringify(rows(C))
  );
}
{
  // an AEW/ABCCC flight and an ELINT flight: one row each
  const C = make([me, pkg, fl(10, 27, 2, -3, 3, 500, 120), fl(20, 26, 2, 0.1, 4, 450, 260)]);
  ok(
    JSON.stringify(rows(C)) ===
      JSON.stringify([
        [20, 2, true],
        [10, 3, true],
      ]),
    'AEW to the AWACS row, ELINT to the JSTARS row'
  );
}
{
  // two ELINT flights, no AEW: the nearer to the JSTARS row, the other to the AWACS row
  const C = make([me, pkg, fl(10, 27, 2, -3, 3, 500, 120), fl(12, 27, 2, 0.1, 3, 505, 205)]);
  ok(
    JSON.stringify(rows(C)) ===
      JSON.stringify([
        [10, 2, true],
        [12, 3, true],
      ]),
    'two ELINT: the nearer to JSTARS, the other to AWACS: ' + JSON.stringify(rows(C))
  );
}
{
  // the nearest AEW/ABCCC flight; an enemy one, an off-station one and a tanker never
  const C = make([
    me,
    pkg,
    fl(20, 26, 2, 0.1, 4, 450, 600),
    fl(21, 26, 2, 0.1, 4, 520, 230),
    fl(22, 26, 6, 0.1, 4, 505, 205),
    fl(23, 26, 2, 5, 9, 505, 205),
    fl(24, 28, 2, 0.1, 4, 505, 205),
  ]);
  ok(pickSurv(C, me, 'AEW/ABCCC')?.id.n === 21, 'the nearest allied AEW/ABCCC on station');
  ok(pickSurv(C, me, 'AEW/ABCCC', [C.byId['21:0']])?.id.n === 20, 'a flight already on the card is skipped');
}
{
  // assigned by the campaign: used as they are, without asterisk; the fallback only fills the empty row
  const C = make([
    me,
    fl(20, 26, 2, 0.1, 4, 450, 260),
    fl(30, 26, 2, 0.1, 4, 900, 900),
    fl(10, 27, 2, -3, 3, 500, 120),
  ]);
  const P = { ...pkg, awacs: { n: 30, c: 0 } };
  C.units.push(P);
  C.byId['901:0'] = P;
  ok(
    JSON.stringify(rows(C, P)) ===
      JSON.stringify([
        [30, 2, false],
        [10, 3, true],
      ]),
    'the assigned AWACS kept, the JSTARS row filled by the ELINT flight'
  );
  const Q = { ...pkg, awacs: { n: 30, c: 0 }, jstar: { n: 20, c: 0 } };
  ok(
    JSON.stringify(rows(C, Q)) ===
      JSON.stringify([
        [30, 2, false],
        [20, 3, false],
      ]),
    'both assigned: no estimate'
  );
  ok(rows(make([me, pkg])).length === 0, 'nothing on station: the rows stay empty');
}

console.log(bad ? `run-surv.mjs: ${bad} of ${n} FAILED` : `run-surv.mjs: OK - ${n} checks`);
if (bad) process.exit(1);

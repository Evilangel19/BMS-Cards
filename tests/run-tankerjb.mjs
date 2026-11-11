// TANK J/B of the MDC (core/fuelplan.js tankerJB): Joker / Bingo to the tanker, from a plan made here (no aircraft data needed)
import { tankerJB } from '../app/js/core/fuelplan.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
// take-off, nav, strike (act 15), nav, land: legs of 100 km (54 NM), 1000 lb each after the take-off leg
const wp = (x, act) => ({ x, y: 0, act });
const wps = [wp(0, 1), wp(100, 0), wp(200, 15), wp(300, 0), wp(400, 7)];
const rows = wps.map((p, i) => ({ i, act: p.act, nm: i ? 54 : 0, burn: i ? 1000 : 0, min: 5000 - i * 1000 }));
const plan = { rows };
// the tanker track 100 km (54 NM) from the strike steerpoint: 54 NM x 1000 / 54 = 1000 lb + 1000 on arrival = 2000; Joker + 1000
const a = tankerJB(plan, wps, [200, 100], 1000);
ok('to the track: Bingo 2000, Joker 3000 ' + JSON.stringify(a), a && a.bingo == 2000 && a.joker == 3000);
// a Refuel steerpoint (act 4) in the plan: the Min.Fuel of the steerpoint before it
const w2 = [wp(0, 1), wp(100, 0), wp(200, 4), wp(300, 15), wp(400, 7)];
const b = tankerJB(
  { rows: w2.map((p, i) => ({ i, act: p.act, nm: 54, burn: 1000, min: [6000, 3400, 1000, 4000, 1500][i] })) },
  w2,
  [999, 999],
  500
);
ok(
  'with a Refuel steerpoint: the Min.Fuel before it (3400), Joker 3900 ' + JSON.stringify(b),
  b && b.bingo == 3400 && b.joker == 3900
);
ok('no tanker track and no Refuel steerpoint: nothing', tankerJB(plan, wps, null, 1000) === null);
ok('no activity in the plan: nothing', tankerJB(plan, [wp(0, 1), wp(100, 0), wp(200, 7)], [0, 0], 1000) === null);
console.log(bad ? `${bad} of ${n} FAILED` : `OK - ${n} tanker J/B checks`);
process.exit(bad ? 1 : 0);

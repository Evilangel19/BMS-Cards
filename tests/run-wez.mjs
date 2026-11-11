// WEZ exposure time (core/wez.js): when a flight plan is inside the rings of the enemy SAMs. Small plans made here, no BMS file.
import { wezOf, wezText, wezSams, joinIv, wezMin } from '../app/js/core/wez.js';

let n = 0,
  bad = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    bad++;
    console.error('FAIL', m);
  }
};
const M = 60000,
  H = 60 * M;
// a flight east along y = 0 at 10 km a minute: take-off at 12:00 from x = 0, landing at 12:40 at x = 400
const wp = (x, y, min, act = 0, depMin) => ({
  x,
  y,
  arr: 12 * H + min * M,
  dep: depMin ? 12 * H + depMin * M : 0,
  act,
});
const plan = [wp(0, 0, 0, 1), wp(200, 0, 20), wp(400, 0, 40, 7), wp(400, 50, 60)];
const near = (a, b, e = 1500) => Math.abs(a - b) <= e;
{
  // one SAM on the route at x = 100, ring 30 km: inside from x = 70 to 130, 12:07 to 12:13
  const z = wezOf(plan, [{ x: 100, y: 0, rng: 30, name: 'SA-6' }]);
  ok(
    z && near(z.t0, 12 * H + 7 * M) && near(z.t1, 12 * H + 13 * M) && near(z.ms, 6 * M),
    'one ring: 12:07-12:13, 6 minutes'
  );
  ok(
    wezText(z) === "WEZ 12:07-12:13 6' SA-6" && wezText(z, false) === "WEZ 12:07-12:13 6'",
    'the text of the card: ' + wezText(z)
  );
}
{
  // a ring beside the route (40 km north, ring 50): the chord is 2 * 30 km = 6 minutes
  const z = wezOf(plan, [{ x: 100, y: 40, rng: 50, name: 'SA-2' }]);
  ok(z && near(z.ms, 6 * M), 'a ring beside the route: the chord, ' + (z && z.ms / M).toFixed(2) + ' min');
  ok(wezOf(plan, [{ x: 100, y: 60, rng: 50 }]) === null, 'a ring that does not reach the route: nothing');
}
{
  // two rings that overlap (x 70-130 and 110-190) and one further on (x 300-320): window 12:07-12:32, inside 12 + 2 = 14 minutes
  const z = wezOf(plan, [
    { x: 100, y: 0, rng: 30, name: 'SA-6' },
    { x: 150, y: 0, rng: 40, name: 'SA-2' },
    { x: 310, y: 0, rng: 10, name: 'SA-8' },
  ]);
  ok(z && near(z.t0, 12 * H + 7 * M) && near(z.t1, 12 * H + 32 * M), 'the window: first entry to last exit');
  ok(
    z && near(z.ms, 14 * M) && z.iv.length === 2,
    'overlapping rings counted once, the gap not counted: ' + (z && z.ms / M).toFixed(2)
  );
  ok(
    z && z.top === 'SA-2' && z.per.length === 3 && near(z.per[1].ms, 8 * M),
    'the largest ring crossed gives the name; every SAM has its own time'
  );
}
{
  // a wait of 10 minutes at a steerpoint inside a ring (a CAP station): the wait counts
  const cap = [wp(0, 0, 0, 1), wp(100, 0, 10, 20, 20), wp(200, 0, 30), wp(300, 0, 40, 7)];
  const z = wezOf(cap, [{ x: 100, y: 0, rng: 30, name: 'SA-6' }]);
  ok(z && near(z.ms, 16 * M), 'the wait on station inside the ring counts: ' + (z && z.ms / M).toFixed(2) + ' min');
}
{
  // the plan ends at the first landing; steerpoints without a time are skipped
  ok(wezOf(plan, [{ x: 400, y: 50, rng: 5, name: 'X' }]) === null, 'a ring after the landing does not count');
  ok(
    wezOf([wp(0, 0, 0, 1)], [{ x: 0, y: 0, rng: 30 }]) === null && wezOf(plan, []) === null,
    'no plan or no SAM: nothing'
  );
}
ok(
  JSON.stringify(joinIv([[500, 900], [100, 300], [300, 400], null, [800, 1200]])) === '[[100,400],[500,1200]]',
  'intervals joined'
);
ok(wezMin(20000) === 1 && wezMin(9.4 * M) === 9, 'whole minutes, at least one');
{
  const UL = [
    { sam: true, noFcr: false, hostile: true, spotted: true, rng: 30, name: 'SA-6', u: { x: 1, y: 2 } },
    { sam: true, noFcr: true, hostile: true, spotted: true, rng: 30, name: 'SA-3', u: { x: 1, y: 2 } },
    { sam: true, noFcr: false, hostile: false, spotted: true, rng: 30, name: 'Patriot', u: { x: 1, y: 2 } },
    { sam: true, noFcr: false, hostile: true, spotted: false, rng: 30, name: 'SA-2', u: { x: 1, y: 2 } },
    { sam: false, noFcr: false, hostile: true, spotted: true, rng: 0, name: 'T-62', u: { x: 1, y: 2 } },
  ];
  ok(
    wezSams(UL)
      .map(s => s.name)
      .join() === 'SA-6',
    'only enemy SAMs that are spotted and have their radar'
  );
}
console.log(bad ? `run-wez.mjs: ${bad} of ${n} FAILED` : `run-wez.mjs: OK - ${n} checks`);
if (bad) process.exit(1);

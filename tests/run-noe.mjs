// AUTO NOE (core/noe.js): the low part of the flight plan and the walls of its valley; the edge of the friendly SAMs (core/mapdata.js samEdge).
// A made-up valley and made-up units, no BMS file.
import { lowPart, noeSamples, noeWalls, SEARCH_NM } from '../app/js/core/noe.js';
import { samEdge } from '../app/js/core/mapdata.js';

let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const wp = (x, y, altFt, act = 0, i = 0) => ({ x, y, altFt, act, n: i + 1 });
// take-off, climb high, down low into a valley going north (x = 0, y 100 -> 150 km), up, landing
const R = [
  wp(0, 0, 0, 1),
  wp(0, 50, 20000),
  wp(0, 100, 1500),
  wp(0, 125, 1500),
  wp(0, 150, 1500, 17),
  wp(0, 200, 20000),
  wp(0, 250, 0, 7),
].map((p, i) => ({ ...p, n: i + 1 }));
const P = lowPart(R);
ck(
  'the low part: steerpoints 3-5, not the take-off nor the landing',
  P && P.a == 2 && P.b == 4 && Math.abs(P.km - 50) < 1e-9
);
ck('a route all high has none', lowPart([wp(0, 0, 0, 1), wp(0, 50, 20000), wp(0, 99, 0, 7)]) === null);
// two low parts: the longest is taken
const R2 = [
  wp(0, 0, 0, 1),
  wp(0, 10, 1000),
  wp(0, 20, 1000),
  wp(0, 30, 9000),
  wp(0, 40, 1000),
  wp(0, 90, 1000),
  wp(0, 99, 0, 7),
];
const P2 = lowPart(R2);
ck('two low parts: the longest (40 -> 90 km)', P2 && P2.a == 4 && P2.b == 5);

// the valley: 1 000 ft at x = 0, +200 ft for every km aside: at 1 500 ft the walls are 2.5 km either side (the first step of 0.25 NM past it)
const S = noeSamples(R, P),
  H = S.pts.map(q => 1000 + 200 * Math.abs(q.x)),
  W = noeWalls(S, H, 6);
const wall = 0.25 * Math.ceil(2.5 / 1.852 / 0.25) * 1.852;
ck('6 points each side', W.L.length == 6 && W.R.length == 6);
ck(
  'the left wall to the west, the right to the east, ' + wall.toFixed(2) + ' km',
  W.L.every(p => Math.abs(p.x + wall) < 1e-6) && W.R.every(p => Math.abs(p.x - wall) < 1e-6)
);
ck('they run along the valley (100 -> 150 km)', Math.abs(W.L[0].y - 100) < 1e-6 && Math.abs(W.L[5].y - 150) < 1e-6);
ck('no wide part', W.wide === 0);
// flat ground under the route: no wall, the lines at the end of the search, said
const F = noeWalls(
  S,
  S.pts.map(() => 0),
  6
);
ck(
  'a wide valley: the lines at ' + SEARCH_NM + ' NM and said',
  F.wide == 1 && F.L.every(p => Math.abs(p.x + SEARCH_NM * 1.852) < 1e-6)
);
// heights not known (null): no wall there
ck(
  'unknown heights do not make walls',
  noeWalls(
    S,
    S.pts.map(() => null),
    6
  ).wide == 1
);

// the edge of the friendly SAMs: two SAMs on the route, the enemy to the north
const g = (x, y, o) => ({ u: { kind: 'gnd', x, y }, ...o });
const U = [
    g(0, 0, { ally: true, sam: true, rng: 40 }),
    g(100, 10, { ally: true, sam: true, rng: 70 }),
    g(500, 0, { ally: true, sam: true, rng: 40 }),
    g(50, 300, { hostile: true }),
  ],
  E = samEdge(U, [
    { x: -50, y: 0 },
    { x: 150, y: 0 },
  ]);
ck('the edge of the friendly SAMs: 6 points', E && E.length == 6);
ck(
  'the far SAM (500 km away from the route) is left out',
  E.every(p => p.x < 200)
);
ck(
  'the edge reaches the front of the bigger ring (y 80 at x 100)',
  E.some(p => Math.abs(p.x - 100) < 15 && p.y > 75)
);
ck(
  'no friendly SAM or no enemy: none',
  samEdge([g(0, 0, { hostile: true })], [{ x: 0, y: 0 }]) === null && samEdge([U[0]], [{ x: 0, y: 0 }]) === null
);

console.log(bad ? 'FAIL - ' + bad + ' of ' + n : 'OK - ' + n + ' NOE / SAM edge checks');
process.exit(bad ? 1 : 0);

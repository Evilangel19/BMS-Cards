// Target picture (core/tgtdraw.js): the place of a picture on the ground, the targets made from the DTC points, the threats near a target, the kind of a
// building from its name. Small cases made here, no BMS file.
import {
  geoBox,
  geoCorners,
  toUV,
  fromUV,
  geoWidth,
  brgDist,
  brg3,
  groupTargets,
  threatsNear,
  featKind,
  planBox,
} from '../app/js/core/tgtdraw.js';

let n = 0,
  bad = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    bad++;
    console.error('FAIL', m);
  }
};
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// a box 10 km wide, 5 km high, north up, around (600, 700)
const g = geoBox(600, 700, 10, 5);
ok(near(toUV(g, 600, 700)[0], 0.5) && near(toUV(g, 600, 700)[1], 0.5), 'the middle of the box is (0.5, 0.5)');
ok(near(toUV(g, 595, 702.5)[0], 0) && near(toUV(g, 595, 702.5)[1], 0), 'the top left corner is (0, 0)');
ok(near(fromUV(g, 1, 1)[0], 605) && near(fromUV(g, 1, 1)[1], 697.5), 'the bottom right corner is south east');
ok(near(geoWidth(g), 10), 'the width of the box');
// three corners of a turned picture: there and back
const t = geoCorners([0, 10], [8, 16], [6, 2]),
  [u, v] = toUV(t, 3.1, 7.4),
  [x, y] = fromUV(t, u, v);
ok(near(x, 3.1, 1e-9) && near(y, 7.4, 1e-9), 'a turned picture: ground -> picture -> ground');
// bearings: north 0 (written 360), east 090
ok(
  brg3(brgDist([0, 0], [0, 1]).brg) == '360°' && brg3(brgDist([0, 0], [1, 0]).brg) == '090°',
  'bearings north and east'
);
ok(near(brgDist([0, 0], [0, 1.852]).nm, 1), 'distance in NM');
ok(planBox([{ x: 600.2, y: 700 }], [600, 700]).u[0] >= 0.6, 'the plan is at least 600 m wide');

// targets: two TGT steerpoints and a weapon target on the same objective, the target of the flight on it, a point far from every objective
const objs = [
    { id: 1, name: 'Depot #6', x: 600, y: 700, type: 10 },
    { id: 2, name: 'Imsil Bridge', x: 650, y: 650, type: 6 },
  ],
  pts = [
    { kind: 'prec', ref: 'TGT STPT 81', short: 'STPT 81', name: 'Bunker', x: 600.1, y: 700.05, dmpi: true },
    { kind: 'prec', ref: 'TGT STPT 82', short: 'STPT 82', name: 'Bunker', x: 600.15, y: 700.1, dmpi: true },
    { kind: 'wpn', ref: 'WPN TGT 1', short: 'WPN 1', name: 'Tank', x: 599.9, y: 699.95, dmpi: true },
    { kind: 'flight', short: 'FLIGHT', ref: '', name: 'Depot #6', x: 600, y: 700, dmpi: false },
    { kind: 'prec', ref: 'TGT STPT 83', short: 'STPT 83', name: 'Field', x: 700, y: 800, dmpi: true },
  ],
  T = groupTargets(pts, objs);
ok(T.length == 2, 'two targets: the depot and the lone point');
ok(
  T[0].flight && T[0].label == 'FLIGHT' && T[0].name == 'Depot #6' && T[0].objId == 1,
  'the target of the flight comes first, on its objective'
);
ok(T[0].dmpis.map(d => d.ref).join() == 'TGT STPT 81,TGT STPT 82,WPN TGT 1', 'its aim points are the DTC points on it');
ok(T[0].refs.join() == 'STPT 81,STPT 82,WPN 1', 'its steerpoints');
ok(T[1].objId == null && T[1].label == 'STPT 83' && T[1].x == 700, 'a point on no objective is a target of its own');
ok(groupTargets([pts[0], pts[0]], objs)[0].dmpis.length == 1, 'the same point twice is one aim point');

// threats: a ring that covers the target, one far away, a unit near, one far
const th = threatsNear(
  [600, 700],
  [
    { name: 'SA-8', x: 604, y: 696, r: 10 },
    { name: 'SA-2', x: 700, y: 700, r: 40 },
    { name: 'SA-6', x: 600, y: 740, r: 24 },
  ],
  [
    { name: '2nd Tank Battalion', x: 602, y: 701, glyph: 'armor' },
    { name: 'Far Battalion', x: 650, y: 700, glyph: 'inf' },
  ]
);
ok(
  th.sams.map(s => s.name).join() == 'SA-8,SA-6',
  'the SAMs whose ring comes near the target: %s'.replace(
    '%s',
    th.sams.map(s => s.name)
  )
);
ok(th.sams[0].inside && !th.sams[1].inside, 'the target inside the SA-8 ring, outside the SA-6 one');
ok(th.units.length == 1 && th.units[0].name == '2nd Tank Battalion', 'only the units near the target');

// kinds of buildings
ok(
  [
    ['Bunker', 'bunk'],
    ['Hardened Aircraft Shelter', 'bunk'],
    ['Fuel Tank', 'tank'],
    ['Bridge Span 3', 'span'],
    ['Radar', 'rad'],
    ['Warehouse', 'ware'],
    ['Comm Tower', 'tow'],
    ['Runway 1', 'rwy'],
    ['Command Post', 'adm'],
  ].every(([nm, k]) => featKind(nm) == k),
  'the kind of a building from its name'
);

if (bad) {
  console.error(`run-tgtdraw.mjs: ${bad} of ${n} checks FAILED`);
  process.exit(1);
}
console.log(`run-tgtdraw.mjs: OK - ${n} checks`);

import {coverage, radarUnits, neededCells, cellOf} from '../app/js/core/radarcov.js';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const r = {x: 100, y: 100, rng: 100};
const flat = () => 0, rad = p => Math.max(...p.map(q => Math.hypot(q[0] - 100, q[1] - 100))), min = p => Math.min(...p.map(q => Math.hypot(q[0] - 100, q[1] - 100)));
// 5000 ft: radio horizon about 4/3 * 1.23 * sqrt(5000 + 30) = 118 nm > 100 km range: full range on flat terrain
const pf = coverage(r, flat); ok(pf.length == 90 && min(pf) > 99, 'flat terrain: the whole range is covered (' + min(pf).toFixed(0) + ' km)');
// a ridge 4 km east of the radar, 4000 ft high: east is shadowed, west is not
const ridge = (i, j) => (Math.round(104 / 2) == i ? 4000 : 0), pr = coverage(r, ridge);
const east = pr[Math.round(90 / 4)], west = pr[Math.round(90 * 3 / 4)];
ok(Math.hypot(east[0] - 100, east[1] - 100) < 70 && Math.hypot(west[0] - 100, west[1] - 100) > 99, 'ridge: the east side is cut, the west side is free');
// a hill higher than the altitude blocks completely
const wall = (i, j) => (Math.round(104 / 2) == i ? 9000 : 0); ok(Math.hypot(coverage(r, wall)[22][0] - 100, 0) < 6, 'terrain above the altitude: nothing behind it');
// low altitude: the radio horizon limits the range (500 ft: about 4/3*1.23*sqrt(500) = 36 nm = 68 km at most with the antenna height)
ok(rad(coverage({x: 100, y: 100, rng: 200}, flat, 500)) < 80 && rad(coverage({x: 100, y: 100, rng: 200}, flat, 500)) > 55, 'low altitude: the earth curvature limits the range');
// radar selection and cells
const UL = [{det: 60, noFcr: false, slot: 1, u: {x: 1, y: 2}, ally: false, name: 'A', bn: 'a', ll: [0, 0]}, {det: 10, slot: 1, u: {x: 0, y: 0}}, {det: 80, noFcr: true, slot: 1, u: {x: 0, y: 0}}, {det: 80, noFcr: false, slot: -1, u: {x: 0, y: 0}}];
ok(radarUnits(UL).length == 1, 'only the radars alive with a long detection range');
const cs = neededCells([r], 8); ok(cs.length > 8 && new Set(cs.map(c => c.join())).size == cs.length, 'the terrain cells are listed once');
process.exit(bad ? 1 : 0);

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
import {parseFcdRadar, radarFeatures} from '../app/js/core/targets.js';
const fcd = '<FCDRecords><FCD Num="1"><Name>Radar SSR</Name><RadarIdx>32</RadarIdx><Det_LowAir>75.0</Det_LowAir></FCD><FCD Num="2"><Name>Control Tower</Name><RadarIdx>0</RadarIdx><Det_LowAir>40.0</Det_LowAir></FCD><FCD Num="3"><Name>Radar P-12</Name><RadarIdx>45</RadarIdx><Det_LowAir>10.0</Det_LowAir></FCD></FCDRecords>';
const fr = parseFcdRadar(fcd); ok(fr[1][0] == 32 && fr[1][1] == 75 && fr[2][0] == 0, 'FCD: radar index and low-altitude range');
const ct = {7: [0, 0, 0, 0, 1], 8: [0, 0, 0, 0, 2], 9: [0, 0, 0, 0, 3]}, fed = [{ct: 7, dn: 100, de: 200}, {ct: 8, dn: 0, de: 0}, {ct: 9, dn: 0, de: 0}];
const rf = radarFeatures({n: 1000, e: 2000}, fed, ct, fr); ok(rf.length == 1 && rf[0].k == 0 && rf[0].n == 1100 && rf[0].e == 2200 && rf[0].det == 75, 'only the features with a radar and a long range (not towers, not short-range radars)');
process.exit(bad ? 1 : 0);

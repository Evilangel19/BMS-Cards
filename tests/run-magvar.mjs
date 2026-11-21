// Magnetic variation (core/magvar.js): the MagVarMap CSV of a theater (a made-up grid in its format), the value between the nodes and outside, the headings
// as the pilot reads them (magnetic = true - variation, east positive), and the places that use it (legs of the map, bullseye bearing of the datacard).
import { parseMagVar, setMagGrid, magAt, toMag, setMagRef, magRef } from '../app/js/core/magvar.js';
import { legs } from '../app/js/core/mapdata.js';
import { locXY } from '../app/js/rules/geo.js';

let bad = 0,
  n = 0;
const ok = (name, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', name);
  }
};
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
// a grid as BMS writes it: "#year", " y\x, 0, 512, 1024, " then the rows, every line ending with a comma; -6 in the south-west to -10 in the north-east
const csv = [
  '#2021',
  ' y\\x,          0,        512,       1024, ',
  '   0,  -6.000000,  -7.000000,  -8.000000, ',
  ' 512,  -7.000000,  -8.000000,  -9.000000, ',
  '1024,  -8.000000,  -9.000000, -10.000000, ',
  '',
].join('\r\n');
const g = parseMagVar('﻿' + csv);
ok(
  'the CSV: year, axes, values',
  g && g.year === 2021 && g.x.join() === '0,512,1024' && g.y.join() === '0,512,1024' && g.v[2][2] === -10
);
ok('not a grid: null', parseMagVar('x,y\n1,2') === null && parseMagVar('#2021\nfoo, 0, 1,\n0, 1, 2,') === null);
setMagGrid(null);
ok('without the grid: no variation', magAt(100, 100) === 0 && toMag(90) === 90);
setMagGrid(g);
ok('the nodes', magAt(0, 0) === -6 && magAt(1024, 1024) === -10 && magAt(512, 0) === -7);
ok('between the nodes: bilinear', near(magAt(256, 256), -7) && near(magAt(768, 256), -8));
ok('outside: the nearest edge', magAt(-50, -50) === -6 && magAt(2000, 512) === -9);
ok('the middle of the theater is the reference at first', magRef() === -8);
ok('west variation: magnetic = true + 8', toMag(90) === 98 && toMag(355) === 3);
ok('at a place: its own variation', toMag(90, 0, 0) === 96);
setMagRef(1024, 1024);
ok('the reference follows the flight', toMag(90) === 100);
setMagRef();
// the legs of the map: hdg true (it turns the drawings), mhdg magnetic (the texts)
const L = legs([
  { x: 512, y: 500, ll: [0, 0] },
  { x: 512, y: 520, ll: [0, 0] },
]);
ok('legs: true north leg, magnetic 008', near(L[1].hdg, 0) && near(L[1].mhdg, 8, 0.01));
// the bullseye bearing of the datacard: magnetic at the point
const C = { bull: { x: 512, y: 500 } };
ok('bullseye bearing: east of the bullseye reads 098', locXY(C, 532, 500).startsWith('098/'));
setMagGrid(null);
ok('...and 090 without the grid', locXY(C, 532, 500).startsWith('090/'));
console.log(bad ? `${bad} of ${n} magnetic variation checks failed` : `OK - ${n} magnetic variation checks`);
process.exit(bad ? 1 : 0);

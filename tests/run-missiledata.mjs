import fs from 'node:fs';
import { parseMissileDat, parseMisList, parseLoftTable, rmax, loftAngle } from '../app/js/bmsdata/missiledata.js';
let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const D = new URL('./fixtures/misdata/', import.meta.url).pathname,
  rd = f => fs.readFileSync(D + f, 'latin1');
const harm = parseMissileDat(rd('AGM-88.dat')),
  amr = parseMissileDat(rd('AIM-120B.dat')),
  aim9 = parseMissileDat(rd('AIM-9M.dat'));
ck(
  'title and input data of the HARM',
  harm.title.includes('HARM') &&
    harm.params.weight === 515.9 &&
    harm.params.loftBias === 4 &&
    harm.params.seekerType === 2
);
ck(
  'the AMRAAM has its own loft table file and a range table 6 x 3 x 6',
  amr.loftFile === 'AIM120.txt' &&
    amr.range.alts.length === 6 &&
    amr.range.vels.length === 3 &&
    amr.range.tgtAlts.length === 6
);
ck(
  'HARM range table: multiplier .95, 6 altitudes, 4 velocities, 3 values each',
  harm.range.mult === 0.95 &&
    harm.range.alts.length === 6 &&
    harm.range.vels.length === 4 &&
    harm.range.tgtAlts.length === 3
);
ck(
  'a table point is returned as it is (times the multiplier)',
  Math.abs(rmax(harm, 0, 300, 0) - 211252 * 0.95) < 1e-6 &&
    Math.abs(rmax(amr, 10000, 800, 30000) - 136656 * amr.range.mult) < 1e-6
);
ck(
  'between points the range is interpolated and grows with altitude and speed',
  rmax(amr, 5000, 400, 20000) > rmax(amr, 0, 0, 20000) &&
    rmax(amr, 5000, 400, 20000) < rmax(amr, 10000, 800, 20000) &&
    rmax(amr, 40000, 1300, 40000) > rmax(amr, 10000, 800, 40000)
);
ck(
  'outside the table the edge is used',
  rmax(amr, -500, -10, 0) === rmax(amr, 0, 0, 0) && rmax(amr, 99000, 9999, 99000) === rmax(amr, 50000, 1300, 50000)
);
const lt = parseLoftTable(rd('Lofttables/AIM120.txt')),
  lh = parseLoftTable(rd('Lofttables/HARM.txt'));
ck(
  'loft tables parse (AMRAAM 12 altitudes x 3 aspects, HARM 6 x 1)',
  lt.alts.length === 12 && lt.aspects.length === 3 && lh.alts.length === 6 && lh.aspects.length === 1
);
ck(
  'loft angle: table points, interpolation between altitudes and aspects',
  loftAngle(lt, 1000, 0) === 25 &&
    loftAngle(lh, 20000) === 13 &&
    Math.abs(loftAngle(lh, 15000) - 16.5) < 1e-9 &&
    Math.abs(loftAngle(lt, 1000, 45) - 19) < 1e-9
);
ck(
  'a missile without a loft table has an empty file name; RMax type is read',
  aim9.loftFile === '' && aim9.rmaxType === 1
);
ck(
  'list: count lines are skipped',
  parseMisList(rd('MisTypes.lst')).includes('AIM-120B') && parseMisList('3\nA\nB\n').length === 2
);
ck('garbage gives no range table instead of an error', parseMissileDat('hello\n# Range Data\n1 2').range === null);
console.log(bad ? 'missiledata: ' + bad + ' FAILED' : 'missiledata: ' + n + '/' + n + ' checks passed');
process.exit(bad ? 1 : 0);

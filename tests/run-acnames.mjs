// The file of each aircraft of the class table among the Acdata files (names as they are in the installation of BMS 4.38) and the weights under the names of the class table.
import { resolveAcName, aliasAircraft } from '../app/js/bmsdata/bmsdata.js';
let n = 0,
  bad = 0;
const ok = (name, c, info = '') => {
  n++;
  if (!c) bad++;
  console.log((c ? 'ok   ' : 'FAIL ') + name + (c ? '' : '  ' + info));
};
const files = [
  'F-16CM-52',
  'F-16CM-40',
  'F-16C-50 HAF',
  'F-16C-52+ HAF',
  'F-16C-52+ CFT HAF',
  'F-16D-52+ CFT RSAF',
  'F-16I-52+ CFT IAF',
  'F-16I-52+ IAF',
  'F-16C-52 ROKAF',
  'F-15C',
  'F-15I IAF',
  'F-15K ROKAF',
  'F-15CJ JASDF',
  'F-18C',
  'F-18D',
  'F-18A+ AGRS',
  'F-4E ROKAF',
  'AV-8B+',
  'EA-6B',
  'Tornado GR1',
  'EF-2000',
];
const has = k => files.includes(k),
  r = x => resolveAcName(x, has, files);
ok('the same name', r('F-16CM-52') === 'F-16CM-52');
ok('a suffix with no file of its own is dropped', r('F-16CM-52 TB') === 'F-16CM-52' && r('F-15C AGRS') === 'F-15C');
ok('the file that holds all the words', r('F-16D-52+ RSAF') === 'F-16D-52+ CFT RSAF');
ok('the shortest file when there are two', r('F-16I-52+') === 'F-16I-52+ IAF');
ok(
  'F-15 of other air forces',
  r('F-15K') === 'F-15K ROKAF' && r('F-15I') === 'F-15I IAF' && r('F-15CJ') === 'F-15CJ JASDF'
);
ok(
  'the Hellenic Peace Xenia names',
  r('F-16C-50 PXII') === 'F-16C-50 HAF' &&
    r('F-16C-52 PXIII') === 'F-16C-52+ HAF' &&
    r('F-16C-52+ PXIV') === 'F-16C-52+ CFT HAF'
);
ok('F/A-18 is F-18', r('F/A-18C') === 'F-18C' && r('F/A-18D') === 'F-18D' && r('F/A-18A+ AGRS') === 'F-18A+ AGRS');
ok('a shortened air force name', r('F-4E ROK') === 'F-4E ROKAF' && r('F-4E ROKAF') === 'F-4E ROKAF');
ok(
  'the same aircraft written in another way',
  r('Tornado GR.1') === 'Tornado GR1' &&
    r('Typhoon') === 'EF-2000' &&
    r('AV-8B+') === 'AV-8B+' &&
    r('EA-6B') === 'EA-6B'
);
ok('an aircraft with no file stays without', r('Mi-8') === null && r('') === null);
const a = aliasAircraft(
  { ew: { 'F-16CM-52': 19500, 'F-16C-52 ROKAF': 19000 }, fi: { 'F-16CM-52': 7000 }, hp: { 'F-16CM-52': ['1'] } },
  ['F-16CM-52 TB', 'F-16C-52 ROKAF', 'Mi-8']
);
ok(
  'the weights are found under the name of the class table',
  a.ew['F-16CM-52 TB'] === 19500 &&
    a.fi['F-16CM-52 TB'] === 7000 &&
    a.hp['F-16CM-52 TB'][0] === '1' &&
    !('Mi-8' in a.ew),
  JSON.stringify(a.ew)
);
console.log(bad ? `${bad} of ${n} checks failed` : `OK - ${n} aircraft name checks`);
process.exit(bad ? 1 : 0);

import { mdcDerive } from '../app/js/core/mdcfill.js';
import { LAYOUT, SHOT } from '../app/js/core/cardlayout.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
// the layout: measures of the blank MDC
const keys = LAYOUT.fields.map(f => f.k);
ok('every cell has its own key (but the joker/bingo pair)', new Set(keys).size == keys.length);
ok(
  'the cells lie inside the picture',
  LAYOUT.fields.every(f => f.r[0] >= 0 && f.r[2] <= 2048 && f.r[1] >= 150 && f.r[3] <= 2048)
);
ok('a lot of cells are writable (page 1 and page 2)', keys.length > 600);
ok(
  'the screenshot box is the big white box of page 1',
  SHOT[2] - SHOT[0] > 700 && SHOT[3] - SHOT[1] > 480 && SHOT[2] < 1000
);
for (const k of [
  'cs',
  'su0_2',
  'matis',
  'm1',
  'm4',
  'ps9',
  'fl7_5',
  'fp14_11',
  't2_4',
  'u2_4',
  'dl1_dn2',
  'ovw',
  'srv',
  'rc9_7',
  'xAD25',
])
  ok('cell ' + k, keys.includes(k));
// derived cells
const F = {
  cs: 'Cobra 3',
  fl0_1: '1-1',
  fl1_1: '1-2',
  fl2_1: '---',
  fl0_3: '05011 MC 1 FC 3',
  fl1_3: '---',
  ab0_2: '273.525',
  ab0_3: '292.650',
  ab0_7: '257.800',
  ab2_2: '275.800',
  ab2_3: '268.000',
  ab2_7: '254.600',
  pk0_0: 'Viper 2',
  pk1_0: 'Cobra 3',
  pk1_1: '2 F-16C',
  pk1_2: '311.050',
  pk1_7: '17:08 - 17:53',
  su0_2: '330.100',
  su2_2: '290.125',
  pri: 'Hapgang Bridge1',
  ll1: "N 35° 54.040'  E 126° 36.809'",
  sec: '',
  ll2: '',
};
const o = mdcDerive(F);
ok(
  'pilot callsigns follow the flight',
  o.fl0_c == 'Cobra 3-1' && o.fl1_c == 'Cobra 3-2' && o.fl2_c == '' && o.fl4_c == ''
);
ok('STN is the first word of the Link 16 text', o.fl0_s == '05011' && o.fl1_s == '');
ok('presets: GND, TWR, DEP/APR of the departure', o.ps1 == '273.525' && o.ps2 == '257.800' && o.ps3 == '292.650');
ok('presets: CHKN is the UHF of the own flight', o.ps4 == '311.050');
ok(
  'presets: C2, tanker and the alternate airbase',
  o.ps5 == '290.125' && o.ps6 == '330.100' && o.ps7 == '268.000' && o.ps8 == '254.600' && o.ps9 == '275.800'
);
ok(
  'roll call: the flights of the package with their TOT',
  o.rc1_0 == 'Cobra 3' && o.rc1_1 == '2 F-16C' && o.rc1_7 == '17:08 - 17:53'
);
ok(
  'target: steerpoint 99, lat and long split, name',
  o.t0_0 == '99' && o.t0_1 == "N 35° 54.040'" && o.t0_2 == "E 126° 36.809'" && o.t0_4 == 'Hapgang Bridge1'
);
ok('no secondary target: the right cells are empty', o.u0_0 == '' && o.u0_4 == '');
console.log(bad ? `${bad} of ${n} FAILED` : `OK - ${n} MDC checks`);
process.exit(bad ? 1 : 0);

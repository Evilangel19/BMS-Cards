// The corrections of the code review of 2026-11-10 (1.2.0-beta.5): colour code, ATO order, plain letters in the DTC, checks of the DTC page,
// Joker margin, day of the METAR, tankers of the aircraft with a probe. Small data made here, no BMS file.
import { wxColour, atisText } from '../app/js/rules/weather.js';
import { setBase } from '../app/js/rules/ephemerides.js';
import { buildAto, groupPackages } from '../app/js/core/ato.js';
import { toAscii } from '../app/js/core/ascii.js';
import { freqKhz, ilsVal, iffCode } from '../app/js/core/dtcvalid.js';
import { jokerFor } from '../app/js/core/fuelplan.js';
import { pickTankers } from '../app/js/rules/support.js';

let n = 0,
  bad = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    bad++;
    console.error('FAIL', m);
  }
};
const H = 3600e3,
  DAY = 864e5;

// ---- colour code: the base of the lowest cloud of 3/8 or more (SCT counts, FEW does not)
{
  const W = (dens, cu, fogEnd = 99) => ({
    at: () => ({ spd: 5, hdg: 270, t: 15, cond: 1, cu, dens, tcu: 0, fogZ: 0, fogEnd, p: 1013 }),
  });
  const d = ['RKJK', 0, 0, H];
  ok(wxColour(W(5, 800), d, 0) === 'GRN', 'SCT at 800 ft: GRN (was BLU) ' + wxColour(W(5, 800), d, 0));
  ok(wxColour(W(2, 800), d, 0) === 'BLU', 'FEW at 800 ft does not count: BLU');
  ok(wxColour(W(8, 1600), d, 0) === 'WHT', 'BKN at 1600 ft: WHT');
  ok(wxColour(W(5, 200), d, 0) === 'AMB', 'SCT at 200 ft: AMB');
}
// ---- day of the METAR: the day of the month of the mission date (D1); without a date the day of the campaign
{
  const W = {
    at: () => ({ spd: 0, hdg: 0, t: 15, cond: 0, cu: 99999, dens: 0, tcu: 0, fogZ: 0, fogEnd: 99, p: 1013 }),
  };
  setBase(null);
  ok(/^RKJK 021400Z/.test(atisText(W, ['RKJK', 0, 0, DAY + 14 * H], 0)), 'no date: day 2 of the campaign');
  setBase('2026-06-30');
  const t = atisText(W, ['RKJK', 0, 0, DAY + 14 * H], 0);
  ok(/^RKJK 011400Z/.test(t), 'D1 = 30 June, second day: 01 (1 July) ' + t);
  setBase(null);
}
// ---- ATO: in the order of the time of the campaign (day and hour), not of the clock alone
{
  const fl = (id, pkg, t0, campId) => ({
    kind: 'flight',
    id: { n: id, c: 0 },
    pkg: { n: pkg, c: 0 },
    sqd: { n: 0, c: 0 },
    c: { i: 0 },
    csId: 1,
    csNum: id,
    omis: 1,
    owner: 2,
    roster: 1,
    slots: [0],
    pilots: [0],
    campId,
    wps: [
      { act: 1, arr: t0, x: 0, y: 0 },
      { act: 7, arr: t0 + H, x: 0, y: 0 },
    ],
  });
  const units = [fl(1, 10, DAY + 20 * 60e3, 1), fl(2, 11, 23 * H + 40 * 60e3, 2), fl(3, 12, 22 * H, 3)];
  const pk = id => ({
    kind: 'pkg',
    id: { n: id, c: 0 },
    campId: id,
    els: units.filter(u => u.pkg.n == id).map(u => u.id),
  });
  const all = [...units, pk(10), pk(11), pk(12)],
    byId = {};
  all.forEach(u => (byId[u.id.n + ':0'] = u));
  const C = {
    D: { S: { 301: 'BARCAP', 2001: 'Viper' }, ac: ['F-16CM-50'], ob: [], ab: {}, rm: {}, ew: {} },
    units: all,
    byId,
  };
  const L = buildAto(C, null);
  ok(
    L.map(e => e.takeoff).join(' ') === '22:00 23:40 00:20',
    'flights: 22:00, 23:40, then 00:20 of the next day: ' + L.map(e => e.takeoff).join(' ')
  );
  const G = groupPackages(L);
  ok(
    G.map(g => g.takeoff).join(' ') === '22:00 23:40 00:20',
    'packages in the same order: ' + G.map(g => g.takeoff).join(' ')
  );
}
// ---- plain letters in the DTC
ok(
  toAscii('Baške Oštarije Village') === 'Baske Ostarije Village',
  'accents dropped: ' + toAscii('Baške Oštarije Village')
);
ok(
  toAscii('Drežnik Bridge – Straße ’A’') === "Dreznik Bridge - Strasse 'A'",
  'dashes, quotes, ß: ' + toAscii('Drežnik Bridge – Straße ’A’')
);
ok(toAscii('304800') === '304800' && toAscii('  a,b  ') === '  a,b  ', 'plain text unchanged');
// ---- checks of the DTC page
ok(
  freqKhz(304.8) === '304800' && freqKhz(138.05) === '138050' && freqKhz(0) === '0',
  'frequencies of the radios accepted'
);
ok(
  freqKhz(2525) === null && freqKhz(25.25) === null && freqKhz(-1) === null,
  'a frequency outside the radios refused (2525 without the point)'
);
ok(
  ilsVal(110.3) === '11030' && ilsVal(0) === '0' && ilsVal(1103) === null && ilsVal(98) === null,
  'ILS: 108.10-111.95 MHz'
);
ok(
  iffCode('60', 'm1') === '60' &&
    iffCode('3', 'm1') === '03' &&
    iffCode('64', 'm1') === null &&
    iffCode('80', 'm1') === null,
  'IFF Mode 1: two octal digits, the second 0-3'
);
ok(
  iffCode('4730', 'm4') === '4730' &&
    iffCode('17', 'm4') === '0017' &&
    iffCode('4738', 'm4') === null &&
    iffCode('12345', 'm4') === null,
  'IFF Modes 2 and 3: four octal digits'
);
// ---- Joker: the margin of the pilot, up to the next 100 lb (the same rule as the fuel plan)
ok(
  jokerFor(2350, 1000) === 3400 && jokerFor(2000, 1500) === 3500 && jokerFor(2000, null) === 3000,
  'Joker = Bingo + margin, up to 100 lb'
);
// ---- tankers: the aircraft with a probe take the KC-130 first
{
  const fl = (id, ac, wps, owner = 2) => ({
    kind: 'flight',
    id: { n: id, c: 0 },
    pkg: { n: 900 + id, c: 0 },
    c: { i: ac },
    owner,
    wps,
  });
  const st = [
    { act: 24, arr: 1 * H, dep: 4 * H, x: 10, y: 10 },
    { act: 7, arr: 5 * H, x: 0, y: 0 },
  ];
  const ACS = ['Tornado GR.4', 'KC-135R', 'KC-130', 'F-16CM-50', 'Rafale C', 'EA-6B'];
  const mk = me => {
    const units = [me, fl(2, 1, st), fl(3, 2, st)],
      byId = {};
    units.forEach(u => (byId[u.id.n + ':0'] = u));
    me.pkg = { n: 99, c: 0 };
    byId['99:0'] = { kind: 'pkg', id: { n: 99, c: 0 }, els: [me.id] };
    return { D: { ac: ACS, S: {} }, units, byId, stance: null };
  };
  const route = [
    { act: 1, arr: 2 * H, x: 0, y: 0 },
    { act: 7, arr: 3 * H, x: 0, y: 0 },
  ];
  for (const [i, nm] of [
    [0, 'Tornado'],
    [4, 'Rafale'],
    [5, 'EA-6B'],
  ]) {
    const me = fl(1, i, route),
      C = mk(me),
      t = pickTankers(C, me, C.byId['99:0']).map(u => ACS[u.c.i]);
    ok(t[0] === 'KC-130', nm + ': the KC-130 first ' + t.join(', '));
  }
  const me = fl(1, 3, route),
    C = mk(me);
  ok(ACS[pickTankers(C, me, C.byId['99:0'])[0].c.i] === 'KC-135R', 'F-16: the boom (KC-135) first');
}

console.log(bad ? `run-review.mjs: ${bad} of ${n} FAILED` : `run-review.mjs: OK - ${n} checks`);
if (bad) process.exit(1);

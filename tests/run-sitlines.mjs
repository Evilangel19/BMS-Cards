// The F-15 SIT lines of BMS 4.38.2 ([F15_SIT_LINES]): their looks, the points of the lines 6-12, the shifts (insert, break, delete), the campaign file and
// the mission block. No BMS files: a DTC written here in the format of the BMS F-15 SIT Lines Editor.
import { parseDtc } from '../app/js/parsers/dtc.js';
import {
  sitMeta,
  sitMetaRows,
  dtcPoints,
  dtcLines,
  dtcKey,
  dtcValue,
  freeSlot,
  sitShift,
  removePoint,
  campaignIni,
  lineSpec,
  lineNo,
  lineName,
  STPT_RANGE,
} from '../app/js/core/mapdtc.js';
import { dtcShare, applyShare, shareDiff } from '../app/js/core/mission.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
const FT = 3280.84,
  pt = (x, y) => `${(y * FT).toFixed(6)}, ${(x * FT).toFixed(6)}`,
  S6 = [
    [520, 420],
    [540, 430],
    [560, 450],
  ];
const ini = [
  '[STPT]',
  ...Array.from({ length: 24 }, (_, i) => `lineSTPT_${i}=0.000000, 0.000000, 0.000000`),
  '[F15_SIT_LINES]',
  'SITLINE_1_COLORHEX=44e6ee',
  'SITLINE_6_NAME=ECOAST',
  'SITLINE_6_ENABLED=1',
  'SITLINE_6_COLORIDX=0',
  'SITLINE_6_DASHOPT=2',
  ...Array.from({ length: 30 }, (_, i) => `SITLINE_6_${i}=${i < S6.length ? pt(...S6[i]) : '0.000000, 0.000000'}`),
  'SITLINE_7_ENABLED=0',
  'SITLINE_7_DASHOPT=9',
  '',
].join('\r\n');
const lines = parseDtc(ini);

// the looks
const M = sitMeta(lines);
ok(
  'LINE1: its COLORHEX, upper case; the rest the defaults (white, solid, shown)',
  M[1].hex == '44E6EE' && M[1].dash == 0 && M[1].on
);
ok(
  'ECOAST: its name, red from COLORIDX 0, L dash',
  M[6].name == 'ECOAST' && M[6].hex == 'FF0000' && M[6].dash == 2 && M[6].on
);
ok(
  'WCOAST: hidden, a dash out of range is solid, the BMS name',
  !M[7].on && M[7].dash == 0 && lineName(7, M) == 'WCOAST'
);
ok(
  'a line without looks: the name BMS gives it (FEZ, LINE2, PPT)',
  lineName(8, M) == 'FEZ' && lineName(2, M) == 'LINE2' && lineName(5, M) == 'PPT'
);
const rows = sitMetaRows(6, { name: 'East=coast\r\n', on: false, hex: 'ffff00', dash: 7 });
ok(
  'the rows of a change: the name cleaned, ENABLED 0, COLORHEX upper case, DASHOPT kept in 0-4',
  JSON.stringify(rows) ==
    JSON.stringify([
      ['SITLINE_6_NAME', 'East coast'],
      ['SITLINE_6_ENABLED', '0'],
      ['SITLINE_6_COLORHEX', 'FFFF00'],
      ['SITLINE_6_DASHOPT', '4'],
    ])
);
ok('a colour that is not 6 hex digits is not written', sitMetaRows(6, { hex: 'red' }).length == 0);

// the points
const P = dtcPoints(lines);
ok(
  'the SIT points are read from their section (north, east)',
  P.sit.filter(q => !q.empty).length == 3 && Math.abs(P.sit[0].x - 520) < 1e-6 && Math.abs(P.sit[0].y - 420) < 1e-6
);
ok(
  'the keys: SITLINE_<line>_<point>',
  dtcKey('sit', 0) == 'SITLINE_6_0' && dtcKey('sit', 35) == 'SITLINE_7_5' && dtcKey('sit', 209) == 'SITLINE_12_29'
);
ok(
  'a value is "north, east", 6 decimals',
  dtcValue('sit', '', { x: 1, y: 2 }) == (2 * FT).toFixed(6) + ', ' + (1 * FT).toFixed(6)
);
ok(
  'the line of a point and its first slot',
  lineNo({ group: 'sit', slot: 35 }) == 7 && lineSpec(7).a == 30 && lineSpec(7).len == 30 && lineSpec(3).a == 12
);
ok(
  'the next free point of ECOAST is the 4th, of FEZ the 1st',
  freeSlot(P, 'sit', 6) == 3 && freeSlot(P, 'sit', 8) == 60
);
ok('the SIT lines are not steerpoints: no STPT range', STPT_RANGE.sit === undefined && STPT_RANGE.line == '31-54');
const runs = dtcLines(P);
ok('dtcLines: ECOAST as one run of 3 points', runs.length == 1 && runs[0].line == 6 && runs[0].pts.length == 3);

// the shifts: a small DTC in memory
const mem = () => {
  const L = parseDtc(ini);
  const set = (g, slot, p) => {
    const k = dtcKey(g, slot),
      l = L.find(z => z.k == k);
    if (l) l.v = dtcValue(g, l.v, p);
    else L.push({ s: 'F15_SIT_LINES', k, v: dtcValue(g, '', p), raw: '' });
  };
  const clear = (g, slot) => set(g, slot, { x: 0, y: 0 });
  return { L, set, clear, P: () => dtcPoints(L) };
};
let D = mem();
sitShift(D.P(), 0, 1, D.set, D.clear, { x: 530, y: 425 });
let Q = D.P().sit;
ok(
  'insert after point 1: the new point 2, the others down one',
  Math.abs(Q[1].x - 530) < 1e-6 && Math.abs(Q[2].x - 540) < 1e-6 && Math.abs(Q[3].x - 560) < 1e-6
);
sitShift(D.P(), 1, 1, D.set, D.clear);
Q = D.P().sit;
ok(
  'a break after point 2: point 3 empty, the rest down one',
  Q[2].empty && Math.abs(Q[3].x - 540) < 1e-6 && Math.abs(Q[4].x - 560) < 1e-6
);
ok('the break splits the line in two runs', dtcLines(D.P()).filter(r => r.line == 6).length == 2);
removePoint(D.P(), 'sit', 0, D.set, D.clear);
Q = D.P().sit;
ok(
  'delete point 1: the others up one, the break with them',
  Math.abs(Q[0].x - 530) < 1e-6 && Q[1].empty && Math.abs(Q[2].x - 540) < 1e-6 && Q[4].empty
);
D = mem();
for (let i = 3; i < 30; i++) D.set('sit', i, { x: 500, y: 500 });
ok(
  'a full line: no room to insert',
  sitShift(D.P(), 5, 1, D.set, D.clear, { x: 1, y: 1 }) === false && freeSlot(D.P(), 'sit', 6) == -1
);

// the campaign file: the SIT lines of the DTC take the place of those of the file, the other sections stay
const old = '[MISSION]\r\ntitle=C\r\n[STPT]\r\n[F15_SIT_LINES]\r\nSITLINE_9_NAME=OLD\r\n[OTHER]\r\nA=1\r\n';
const out = campaignIni('C', lines, old);
ok(
  'campaign ini: the SIT lines of the DTC, not the old ones; [OTHER] kept',
  out.includes('[F15_SIT_LINES]\r\nSITLINE_1_COLORHEX=44e6ee') &&
    !out.includes('SITLINE_9_NAME=OLD') &&
    out.includes('[OTHER]\r\nA=1') &&
    out.split('[F15_SIT_LINES]').length == 2
);
ok(
  'campaign ini: a DTC without SIT lines keeps those of the file',
  campaignIni('C', parseDtc('[STPT]\r\n'), old).includes('SITLINE_9_NAME=OLD')
);

// the mission block: the SIT lines travel, and a DTC without the section gets it
const blk = dtcShare(lines);
ok(
  'the mission block carries [F15_SIT_LINES]',
  blk.length == 1 && blk[0].items.some(i => i[0] == 'F15_SIT_LINES' && i[1] == 'SITLINE_6_NAME')
);
const recv = parseDtc('[STPT]\r\nlineSTPT_0=0.000000, 0.000000, 0.000000\r\n'),
  wrote = [];
const r = applyShare((s, k, v) => wrote.push([s, k, v]), blk, [blk[0].id], recv);
ok(
  'a DTC without the section: the SIT lines are written (not skipped)',
  r.skipped == 0 && wrote.some(w => w[0] == 'F15_SIT_LINES' && w[1] == 'SITLINE_6_0')
);
ok('...and the section is not listed as missing', !shareDiff(recv, blk[0]).missing.includes('F15_SIT_LINES'));

console.log(bad ? `${bad} FAILED of ${n}` : `OK - ${n} SIT line checks`);
process.exit(bad ? 1 : 0);

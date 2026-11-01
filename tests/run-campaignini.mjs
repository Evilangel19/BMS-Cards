// The campaign / Tactical Engagement .ini that BMS reads: [MISSION] title and the [STPT] data only, as BMS writes it (fixture: tests/fixtures/TE_BMS_06_F-18C_QRA.ini, a file written by BMS; ignored by git).
import fs from 'node:fs';
import { parseDtc } from '../app/js/parsers/dtc.js';
import {
  GROUPS,
  STPT_RANGE,
  freeSlot,
  campaignIni,
  bmsStptKey,
  bmsStptKeys,
  dtcPoints,
  routeRows,
  isRouteKey,
} from '../app/js/core/mapdtc.js';
import { dtcShare } from '../app/js/core/mission.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
ok(
  '15 pre-planned threats (STPT 56-70), 19 precision targets, 24 line points',
  GROUPS.ppt.n === 15 && GROUPS.ppt.first === 56 && GROUPS.prec.n === 19 && GROUPS.line.n === 24
);
ok(
  'keys BMS uses: ppt_14 yes, ppt_15 no; target_23 and target_80 yes, target_24 no',
  bmsStptKey('ppt_14') &&
    !bmsStptKey('ppt_15') &&
    bmsStptKey('target_23') &&
    bmsStptKey('target_80') &&
    !bmsStptKey('target_24') &&
    bmsStptKey('wpntarget_99') &&
    !bmsStptKey('wpntarget_100')
);
ok(
  'the ranges shown on the screen come from GROUPS: 81-99, 56-70, 31-54',
  STPT_RANGE.prec === '81-99' && STPT_RANGE.ppt === '56-70' && STPT_RANGE.line === '31-54'
);
ok('182 STPT keys', bmsStptKeys().length === 24 + 19 + 15 + 24 + 100);
const p = new URL('./fixtures/TE_BMS_06_F-18C_QRA.ini', import.meta.url);
if (fs.existsSync(p)) {
  const text = fs.readFileSync(p, 'utf8');
  ok('the file written by BMS comes back byte for byte', campaignIni('TE_BMS_06_F-18C_QRA', parseDtc(text)) === text);
  const pts = dtcPoints(parseDtc(text));
  ok('the file has no more PPT slots than the program', pts.ppt.length === 15);
} else console.log('(no BMS fixture: byte comparison skipped)');
// a full DTC: only the STPT data go in, with the edits; missing keys are empty
const dtc = parseDtc(
  '[MISSION]\r\ntitle=x\r\n[STPT]\r\ntarget_0=1.000000, 2.000000, 0.000000, 1, A\r\nppt_3=5.000000, 6.000000, 0.000000, 60761.200000, SA-2\r\nppt_20=9.000000, 9.000000, 0.000000, 1000.000000, X\r\n[MFD]\r\nfoo=bar\r\n'
);
const out = campaignIni('Camp', dtc);
ok(
  'title, STPT only, ppt_20 and the MFD section dropped, empty defaults for the rest',
  out.startsWith('[MISSION]\r\ntitle=Camp\r\n[STPT]\r\ntarget_0=1.000000, 2.000000, 0.000000, 1, A\r\n') &&
    out.includes('ppt_3=5.000000, 6.000000, 0.000000, 60761.200000, SA-2') &&
    !out.includes('ppt_20') &&
    !out.includes('MFD') &&
    out.includes('ppt_0=0.000000, 0.000000, 0.000000, 0.000000,\r\n') &&
    out.split('\r\n').length === 186
);
ok(
  'a mission does not carry the keys BMS does not use',
  !dtcShare(dtc)
    .flatMap(g => g.items)
    .some(i => i[1] === 'ppt_20') &&
    dtcShare(dtc)
      .flatMap(g => g.items)
      .some(i => i[1] === 'ppt_3')
);
const q = new URL('./fixtures/ROLLING_FIRE_HARD_campaign.ini', import.meta.url);
if (fs.existsSync(q)) {
  const ct = fs.readFileSync(q, 'latin1');
  ok(
    'a campaign ini written by BMS (add-on theater) has the same short structure and comes back byte for byte',
    campaignIni('ROLLING FIRE HARD', parseDtc(ct)) === ct
  );
}
const r2 = new URL('./fixtures/te/TE_BMS_03_F-16_DEAD.ini', import.meta.url);
if (fs.existsSync(r2)) {
  const tt = fs.readFileSync(r2, 'latin1');
  ok('the second TE ini comes back byte for byte too', campaignIni('TE_BMS_03_F-16_DEAD', parseDtc(tt)) === tt);
}
// the automatic functions (AUTO PPT, free slots) work on GROUPS: 15 PPT at most, ppt_15 and up are not read
const full = parseDtc(
  '[STPT]\r\n' +
    Array.from({ length: 25 }, (_, i) => `ppt_${i}=1000.000000, 2000.000000, 0.000000, 60761.200000, SA-${i}`).join(
      '\r\n'
    ) +
    '\r\n'
);
const fp = dtcPoints(full);
ok(
  'only ppt_0-14 are read, even when the DTC has more',
  fp.ppt.length === 15 && fp.ppt[14].stpt === 70 && freeSlot(fp, 'ppt') === -1
);
const part = dtcPoints(
  parseDtc(
    '[STPT]\r\n' +
      Array.from({ length: 14 }, (_, i) => `ppt_${i}=1.0, 2.0, 0.0, 60761.2, S${i}`).join('\r\n') +
      '\r\nppt_14=0.000000, 0.000000, 0.000000, 0.000000,\r\n'
  )
);
ok('with 14 used the free PPT slot is the 15th (STPT 70)', freeSlot(part, 'ppt') === 14);
// the route of the flight (target_0-24): like BMS writes it, with the altitudes of the flight plan, and the bullseye as STPT 25
{
  const C0 = { bull: { x: 667, y: 217 } },
    f0 = {
      wps: [
        { x: 432, y: 224, z: 0, act: 1 },
        { x: 518, y: 224, z: 2200, act: 0 },
        { x: 432, y: 224, z: 0, act: 7 },
      ],
    },
    r = routeRows(C0, f0);
  ok('route: 25 rows, target_0 to target_24', r.length === 25 && r[0][0] === 'target_0' && r[24][0] === 'target_24');
  ok(
    'route: north, east, -altitude, action and the BMS name',
    r[0][1] === '734908.160000, 1417322.880000, 0.000000, 1, Not set'
  );
  ok(
    'route: the altitude of the plan is written negative (22000 ft)',
    r[1][1] === '734908.160000, 1699475.120000, -22000.000000, 0, Not set'
  );
  ok(
    'route: a row after the last steerpoint is the empty row of BMS',
    r[3][1] === '0.000000, 0.000000, 0.000000, -1, Not set' && r[23][1] === r[3][1]
  );
  ok(
    'route: target_24 is the bullseye (north, east, 0)',
    r[24][1] === (217 * 3280.84).toFixed(6) + ', ' + (667 * 3280.84).toFixed(6) + ', 0.000000, 0, Not set'
  );
  ok('route: no flight plan, no rows', routeRows(C0, { wps: [] }) === null && routeRows(null, f0) === null);
  ok(
    'route keys are target_0 to target_24 only',
    isRouteKey('target_0') &&
      isRouteKey('target_24') &&
      !isRouteKey('target_25') &&
      !isRouteKey('target_80') &&
      !isRouteKey('ppt_1')
  );
  const withRoute = parseDtc('[STPT]\r\n' + r.map(([k, v]) => k + '=' + v).join('\r\n') + '\r\n'),
    out = campaignIni('R', withRoute).split('\r\n'),
    i23 = out.findIndex(l => l.startsWith('target_23=')),
    p80 = out.findIndex(l => l.startsWith('target_80='));
  ok(
    'campaign ini: the route is written as it is, target_24 follows target_23',
    out[i23 + 1] === 'target_24=' + r[24][1] && p80 === i23 + 2 && out[3] === 'target_0=' + r[0][1]
  );
  ok(
    'campaign ini: a DTC without target_24 gives no target_24 row (BMS files stay byte for byte)',
    !campaignIni('R', parseDtc('[STPT]\r\ntarget_0=1, 2, 3, 1, Not set\r\n'))
      .split('\r\n')
      .some(l => l.startsWith('target_24='))
  );
}
console.log(bad ? `${bad} FAILED of ${n}` : `OK - ${n} campaign ini checks`);
process.exit(bad ? 1 : 0);

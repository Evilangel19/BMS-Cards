// Project file: a package taken out of the campaign gives the same datacard as the whole campaign; the DTC edits apply on top of the original text.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { CAM } = await import(new URL('../app/js/core/cam-core.js', import.meta.url));
const P = await import(new URL('../app/js/core/mission.js', import.meta.url));
const { parseLink16 } = await import(new URL('../app/js/parsers/link16.js', import.meta.url));
CAM.setBase('2026-09-30');
let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  } else console.log('ok  ', name);
};

for (const R0 of [0, 60])
  for (const s of [
    { name: 'beartrap', cam: 'PSI_BEAR_TRAP_26.cam' },
    { name: 'evilkorea', cam: 'EvilKorea.cam' },
  ]) {
    const dir = path.join(root, 'tests', 'fixtures', s.name);
    const C = CAM.openCam(new Uint8Array(fs.readFileSync(path.join(dir, s.cam))), CAM.D, s.cam);
    const flights = CAM.listFlights(C);
    let diff = 0,
      sizes = [],
      full = JSON.stringify(C.units).length;
    for (const x of flights) {
      const snap = JSON.parse(JSON.stringify(P.snapshotCampaign(C, x.f, { radiusNm: R0 }))); // through JSON, as in a file
      const R = P.restoreCampaign(snap, C.D),
        f2 = P.snapshotFlight(R, snap);
      sizes.push(JSON.stringify(snap).length);
      if (!f2 || JSON.stringify(CAM.fillCard(C, x.f)) !== JSON.stringify(CAM.fillCard(R, f2))) {
        diff++;
        if (diff < 4) console.log('  differs:', x.label);
      }
    }
    const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length / 1024);
    if (s.name === 'evilkorea') {
      CAM.initialOwners(C, new Uint8Array(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'saves', 'Save1.cam'))));
      const fv = {
          f: C.units.find(u => u.kind === 'flight' && u.wps && u.wps[0] && u.wps[0].x === 773 && u.wps[0].y === 107),
        },
        sn = JSON.parse(JSON.stringify(P.snapshotCampaign(C, fv.f, { radiusNm: R0 }))),
        R = P.restoreCampaign(sn, C.D);
      ck(
        `@${R0} nm: owners and damage of the objectives come back (campaign ids): ${R.objOwn.size} / ${R.objFeat.size}`,
        R.objOwn.size === C.objOwn.size &&
          R.objFeat.size === C.objFeat.size &&
          [...C.objFeat].every(([k, v]) => {
            const w = R.objFeat.get(k);
            return w instanceof Uint8Array && w.length === v.length && w.every((q, i) => q === v[i]);
          })
      );
      ck(
        `@${R0} nm: the ship the flight leaves is still a base after the trip through the file (${CAM.fillCard(R, P.snapshotFlight(R, sn)).ab0_0})`,
        /Vinson/.test(CAM.fillCard(R, P.snapshotFlight(R, sn)).ab0_0 || '')
      );
    }
    ck(
      `${s.name} @${R0} nm: the datacard of every flight (${flights.length}) is the same from the package alone (average ${avg} KB, whole campaign ${Math.round(full / 1024)} KB)`,
      diff === 0
    );
    const a = P.snapshotCampaign(C, flights[0].f, { radiusNm: 20 }),
      b = P.snapshotCampaign(C, flights[0].f, { radiusNm: 120 });
    if (R0 === 0)
      ck(
        `${s.name}: a larger radius takes more units`,
        b.units.length > a.units.length && a.units.some(u => u.kind === 'flight' && u.id.n === flights[0].f.id.n)
      );
  }

// DTC edits
const orig =
  '[STPT]\r\ntarget_1=1.000000, 2.000000, 0.000000, 1, \r\ntarget_2=0, 0, 0, -1, Not set\r\n[MFD]\r\nDisplay1=A\r\n';
const lines = [
  { s: 'STPT', k: 'target_1', v: '5, 6, 0, 1, ', raw: 'target_1=1.000000, 2.000000, 0.000000, 1, ', dirty: 1 },
  { s: 'STPT', k: 'target_9', v: '7, 8, 0, 1, X', dirty: 1 },
  { s: 'MFD', k: 'Display1', v: 'A', raw: 'Display1=A', dirty: 0 },
];
const ed = P.dtcEdits(lines),
  back = P.applyDtcEdits(orig, ed);
ck(
  'DTC edits list only the changed lines, with the value as read',
  ed.length === 2 && ed[0].was === '1.000000, 2.000000, 0.000000, 1,' && ed[1].was === null
);
ck(
  'original + edits gives the changed file (a new key goes at the end of its section, line ends kept)',
  back ===
    '[STPT]\r\ntarget_1=5, 6, 0, 1, \r\ntarget_2=0, 0, 0, -1, Not set\r\ntarget_9=7, 8, 0, 1, X\r\n[MFD]\r\nDisplay1=A\r\n'
);
const ed2 = P.dtcEditsAgainst(
  [
    { s: 'STPT', k: 'target_1', v: '1.000000, 2.000000, 0.000000, 1,' },
    { s: 'MFD', k: 'Display1', v: 'A' },
  ],
  [
    { s: 'STPT', k: 'target_1', v: '5, 6, 0, 1, ' },
    { s: 'STPT', k: 'target_9', v: '7, 8, 0, 1, X' },
    { s: 'MFD', k: 'Display1', v: 'A' },
  ]
);
ck(
  'edits against the original file: changed and new lines only',
  ed2.length === 2 && ed2[1].was === null && ed2[0].k === 'target_1'
);
const pr = P.parseMission(JSON.stringify(P.buildMission({ name: 'x', dtc: { original: orig, edits: ed } })));
ck(
  'a mission is written and read back; a wrong file or a newer version is refused',
  pr.mission &&
    pr.mission.dtc.edits.length === 2 &&
    P.parseMission('{}').error &&
    P.parseMission(JSON.stringify({ format: P.PROJECT_FORMAT, version: 99 })).error
);
ck(
  'the manual changes are the fields that differ from the automatic values',
  JSON.stringify(P.diffFields({ a: '1', b: '2' }, { a: '1', b: '3', c: 'x' })) === '{"b":"3","c":"x"}'
);

// CAS flights: the primary target is the hostile battalion also for pre-planned and on-call CAS; the TOT of a CAS is the time on station
{
  const C = CAM.openCam(
    new Uint8Array(fs.readFileSync(path.join(root, 'tests/fixtures/beartrap/PSI_BEAR_TRAP_26.cam'))),
    CAM.D,
    'x'
  );
  const cas = CAM.listFlights(C, null)
    .filter(x => [20, 21, 22].includes(x.f.omis))
    .map(x => ({ x, F: CAM.fillCard(C, x.f) }));
  ck(
    'pre-planned CAS: a hostile battalion at the attack point is the primary target (not the nearest village or bridge)',
    cas.some(c => c.x.f.omis === 21 && /Battalion/.test(c.F.pri))
  );
  ck(
    'CAS (any kind): the TOT is the time on station, from the first to the last attack point',
    cas.length > 0 &&
      cas.every(c => /^\d\d:\d\d:\d\d( - \d\d:\d\d:\d\d)?$/.test(c.F.d1)) &&
      cas.some(c => / - /.test(c.F.d1))
  );
  const gs = CAM.listFlights(C, null)
    .filter(x => [25, 23].includes(x.f.omis))
    .map(x => CAM.fillCard(C, x.f));
  ck('BAI and SCAR keep a single TOT', gs.length > 0 && gs.every(F => !/^\d\d:\d\d:\d\d - /.test(F.d1)));
}
// sharing: ONE block of the DTC, applied on the receiver's own DTC
{
  const dl = [
    { s: 'STPT', k: 'target_1', v: '1, 2, 0, 1, ' },
    { s: 'MFD', k: 'Display1', v: 'A' },
    { s: 'Radio', k: 'UHF_1', v: '251.0' },
    { s: 'LINK16', k: 'FILE_A_FLIGHT_LEAD', v: '1' },
    { s: 'ICP', k: 'Bingo_Fuel', v: '3300' },
    { s: 'FCC_AGB', k: 'x', v: '1' },
    { s: 'Laser', k: 'y', v: '2' },
    { s: 'NAV OFFSETS', k: 'vip_1', v: '1, 2' },
  ];
  const g = P.dtcShare(dl);
  ck(
    'sharing: one block with steerpoints, nav offsets, FCC, laser and ICP; MFD, radio and Link 16 never travel',
    g.length === 1 && g[0].items.length === 5 && !g[0].items.some(i => ['MFD', 'Radio', 'LINK16'].includes(i[0]))
  );
  const m = P.shareMission(
    P.buildMission({
      name: 'x',
      dtc: { original: '[STPT]\r\ntarget_1=1, 2, 0, 1, \r\n', edits: [], name: 'Mine.ini', author: { uid: 'a' } },
    }),
    g
  );
  ck(
    'a shared mission carries no DTC file, no settings, only the block',
    m.dtc.original === undefined &&
      m.dtc.name === undefined &&
      m.settings === null &&
      m.dtc.share.groups.length === 1 &&
      m.shared
  );
  ck(
    'a mission without DTC data travels without a DTC',
    P.shareMission(P.buildMission({ name: 'x' }), []).dtc === null
  );
  const old = P.shareFromSaved({
    share: {
      groups: [
        { id: 'mfd', items: [['MFD', 'a', '1']] },
        { id: 'stpt', items: [['STPT', 'target_1', '1']] },
      ],
    },
  });
  ck(
    'an old shared mission is reduced to the block (personal sections are dropped)',
    old.length === 1 && old[0].items.length === 1 && old[0].items[0][0] === 'STPT'
  );
  const got = [];
  const r = P.applyShare((a, b, c) => got.push([a, b, c]), m.dtc.share.groups, ['mission']);
  ck(
    'applyShare writes the block into the DTC of the receiver',
    r.n === got.length && got.some(x => x[1] === 'target_1') && !got.some(x => x[0] === 'MFD')
  );
  ck(
    'the file of an old mission still gives its block from original + edits',
    P.shareFromSaved({ original: '[STPT]\r\ntarget_1=1, 2, 0, 1, \r\n[MFD]\r\na=1\r\n', edits: [] })[0].items.length ===
      1
  );
  {
    const ex = [
        { s: 'STPT', k: 'target_1', v: '9, 9, 0, 1, A' },
        { s: 'STPT', k: 'target_5', v: '7, 7, 0, 1, B' },
        { s: 'STPT', k: 'lineSTPT_9', v: '1.0, 2.0, 3.0' },
        { s: 'NAV OFFSETS', k: 'vip_1', v: '1, 2' },
      ],
      gg = {
        id: 'stpt',
        items: [
          ['STPT', 'target_1', '1, 2, 0, 1, '],
          ['STPT', 'target_2', '0, 0, 0, -1, Not set'],
          ['STPT', 'lineSTPT_1', '0.000000, 0.000000, 0.000000'],
          ['STPT', 'target_5', '0, 0, 0, -1, Not set'],
          ['ICP', 'Bingo_Fuel', '3300'],
        ],
      },
      w = [],
      d = P.shareDiff(ex, gg);
    const r2 = P.applyShare((a, b, c) => w.push(a + '|' + b + '=' + c), [gg], ['stpt'], ex);
    ck(
      'the preview counts changed, new, emptied lines and the sections the receiver does not have',
      d.change === 2 && d.add === 2 && d.clear === 1 && d.lost === 1 && d.missing[0] === 'ICP'
    );
    ck(
      'slots of the receiver that the mission does not fill are emptied with the empty pattern of the mission',
      w.includes('STPT|lineSTPT_9=0.000000, 0.000000, 0.000000') && !w.some(x => x.startsWith('NAV OFFSETS'))
    );
    ck(
      'lines of a section the receiver has not are skipped and counted, not written',
      r2.skipped === 1 && !w.some(x => x.startsWith('ICP'))
    );
  }
  ck(
    'DTC name from a mission file: a plain .ini name is kept',
    P.dtcFileName('Evil19.ini') === 'Evil19.ini' && P.dtcFileName('my dtc.INI') === 'my dtc.INI'
  );
  ck(
    'DTC name from a mission file: folders, drives and ".." never get through',
    ['..\\..\\Windows\\evil.ini', 'C:\\Users\\x\\a.ini', '../../a.ini', '/etc/a.ini'].every(
      x => P.dtcFileName(x) === 'a.ini' || P.dtcFileName(x) === 'evil.ini'
    ) &&
      P.dtcFileName('..') === 'DTC.ini' &&
      P.dtcFileName('a/..') === 'DTC.ini'
  );
  ck(
    'DTC name from a mission file: other types, hidden files, empty or odd values become DTC.ini',
    ['evil.exe', 'x.ini.bat', '.ini', '', null, undefined, 42, 'a'.repeat(90) + '.ini', 'a<b>.txt'].every(
      x => P.dtcFileName(x) === 'DTC.ini'
    )
  );
  ck(
    'a mission written now carries no path of this computer',
    !/"path"\s*:/.test(
      fs.readFileSync(path.join(root, 'app/js/app/mission.js'), 'utf8').match(/const dtc =\s*lines\.length\s*\?\s*\{[\s\S]*?\n\s*\}\s*:\s*null/)[0]
    )
  );
  const pk = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
    V = (await import(new URL('../app/js/core/version.js', import.meta.url))).APP_VERSION;
  ck('the version of the program is the same in version.js and package.json', V === pk.version);
}
console.log(bad ? 'mission: ' + bad + ' FAILED' : 'mission: ' + n + '/' + n + ' checks passed');
process.exit(bad ? 1 : 0);

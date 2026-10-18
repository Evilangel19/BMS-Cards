// Project file: a package taken out of the campaign gives the same datacard as the whole campaign; the DTC edits apply on top of the original text.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { CAM } = await import(new URL('../app/js/core/cam-core.js', import.meta.url));
const P = await import(new URL('../app/js/core/mission.js', import.meta.url));
const { parseLink16 } = await import(new URL('../app/js/parsers/link16.js', import.meta.url));
CAM.setBase('2026-09-30');
let n = 0, bad = 0; const ck = (name, ok) => { n++; if (!ok) { bad++; console.log('FAIL', name); } else console.log('ok  ', name); };

for (const R0 of [0, 60]) for (const s of [{ name: 'beartrap', cam: 'PSI_BEAR_TRAP_26.cam' }, { name: 'evilkorea', cam: 'EvilKorea.cam' }]) {
  const dir = path.join(root, 'tests', 'fixtures', s.name);
  const C = CAM.openCam(new Uint8Array(fs.readFileSync(path.join(dir, s.cam))), CAM.D, s.cam);
  const flights = CAM.listFlights(C);
  let diff = 0, sizes = [], full = JSON.stringify(C.units).length;
  for (const x of flights) {
    const snap = JSON.parse(JSON.stringify(P.snapshotCampaign(C, x.f, { radiusNm: R0 })));   // through JSON, as in a file
    const R = P.restoreCampaign(snap, C.D), f2 = P.snapshotFlight(R, snap);
    sizes.push(JSON.stringify(snap).length);
    if (!f2 || JSON.stringify(CAM.fillCard(C, x.f)) !== JSON.stringify(CAM.fillCard(R, f2))) { diff++; if (diff < 4) console.log('  differs:', x.label); }
  }
  const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length / 1024);
  ck(`${s.name} @${R0} nm: the datacard of every flight (${flights.length}) is the same from the package alone (average ${avg} KB, whole campaign ${Math.round(full / 1024)} KB)`, diff === 0);
  const a = P.snapshotCampaign(C, flights[0].f, { radiusNm: 20 }), b = P.snapshotCampaign(C, flights[0].f, { radiusNm: 120 });
  if (R0 === 0) ck(`${s.name}: a larger radius takes more units`, b.units.length > a.units.length && a.units.some(u => u.kind === 'flight' && u.id.n === flights[0].f.id.n));
}

// DTC edits
const orig = '[STPT]\r\ntarget_1=1.000000, 2.000000, 0.000000, 1, \r\ntarget_2=0, 0, 0, -1, Not set\r\n[MFD]\r\nDisplay1=A\r\n';
const lines = [{ s: 'STPT', k: 'target_1', v: '5, 6, 0, 1, ', raw: 'target_1=1.000000, 2.000000, 0.000000, 1, ', dirty: 1 }, { s: 'STPT', k: 'target_9', v: '7, 8, 0, 1, X', dirty: 1 }, { s: 'MFD', k: 'Display1', v: 'A', raw: 'Display1=A', dirty: 0 }];
const ed = P.dtcEdits(lines), back = P.applyDtcEdits(orig, ed);
ck('DTC edits list only the changed lines, with the value as read', ed.length === 2 && ed[0].was === '1.000000, 2.000000, 0.000000, 1,' && ed[1].was === null);
ck('original + edits gives the changed file (a new key goes at the end of its section, line ends kept)', back === '[STPT]\r\ntarget_1=5, 6, 0, 1, \r\ntarget_2=0, 0, 0, -1, Not set\r\ntarget_9=7, 8, 0, 1, X\r\n[MFD]\r\nDisplay1=A\r\n');
const ed2 = P.dtcEditsAgainst([{ s: 'STPT', k: 'target_1', v: '1.000000, 2.000000, 0.000000, 1,' }, { s: 'MFD', k: 'Display1', v: 'A' }], [{ s: 'STPT', k: 'target_1', v: '5, 6, 0, 1, ' }, { s: 'STPT', k: 'target_9', v: '7, 8, 0, 1, X' }, { s: 'MFD', k: 'Display1', v: 'A' }]);
ck('edits against the original file: changed and new lines only', ed2.length === 2 && ed2[1].was === null && ed2[0].k === 'target_1');
const pr = P.parseMission(JSON.stringify(P.buildMission({ name: 'x', dtc: { original: orig, edits: ed } })));
ck('a mission is written and read back; a wrong file or a newer version is refused', pr.mission && pr.mission.dtc.edits.length === 2 && P.parseMission('{}').error && P.parseMission(JSON.stringify({ format: P.PROJECT_FORMAT, version: 99 })).error);
ck('the manual changes are the fields that differ from the automatic values', JSON.stringify(P.diffFields({ a: '1', b: '2' }, { a: '1', b: '3', c: 'x' })) === '{"b":"3","c":"x"}');
console.log(bad ? 'mission: ' + bad + ' FAILED' : 'mission: ' + n + '/' + n + ' checks passed'); process.exit(bad ? 1 : 0);

// Objectives at the start of a scenario (section "obj" of Save0..5.cam) and their merge under the changes of a saved campaign
import fs from 'node:fs';
import { CAM } from '../app/js/core/cam-core.js';
import { camToc, objInitial } from '../app/js/parsers/cam.js';
let ok = true; const ck = (n, c) => { ok &&= !!c; console.log(c ? 'ok  ' : 'FAIL', n); };
const rd = f => new Uint8Array(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url)));
if (!fs.existsSync(new URL('./fixtures/saves/Save3.cam', import.meta.url))) { console.log('skipped (fixtures/saves missing)'); process.exit(0); }
for (const [n, cnt] of [[0, 5999], [1, 5999], [2, 5999], [3, 5999], [4, 5999], [5, 2730]]) {
  const m = objInitial(camToc(rd('saves/Save' + n + '.cam')));
  ck('Save' + n + ': ' + cnt + ' objectives read, the section ends exactly', m && m.size === cnt);
}
const m3 = objInitial(camToc(rd('saves/Save3.cam')));
ck('every owner is a team number (0-7)', [...m3.values()].every(o => o >= 0 && o <= 7));
ck('the scenarios differ in ownership', objInitial(camToc(rd('saves/Save2.cam'))).get(3827) !== undefined && [...m3].some(([k, v]) => objInitial(camToc(rd('saves/Save2.cam'))).get(k) !== v));
const f = 'beartrap/PSI_BEAR_TRAP_26-double.cam';
if (fs.existsSync(new URL('./fixtures/' + f, import.meta.url))) {
  const C = CAM.openCam(rd(f), CAM.D, 'x.cam');
  ck('a saved campaign names the scenario it was started from', C.base === 'save3');
  const delta = C.objOwn.size, d0 = new Map(C.objOwn);
  ck('the changes alone are a small part of the objectives', delta > 100 && delta < 400);
  const n = CAM.initialOwners(C, rd('saves/Save3.cam'));
  ck('the initial owners are merged: every objective has one', n === 5999 && C.objOwn.size === 5999);
  ck('the changes of the campaign win over the initial owners', [...d0].every(([k, v]) => C.objOwn.get(k) === v));
  const sq = C.units.filter(u => u.kind == 'sqd' && u.airbase && C.objOwn.has(u.airbase.n));
  ck('the owner of a base agrees with the squadron based there (same team or an ally of it)', sq.length >= 30 && sq.filter(u => C.objOwn.get(u.airbase.n) === u.owner).length >= sq.length - 2);
  ck('a wrong file leaves the campaign as it was', CAM.initialOwners(C, new Uint8Array(100)) === 0 && C.objOwn.size === 5999);
}
console.log(ok ? 'ALL OK' : 'SOME FAILED'); process.exit(ok ? 0 : 1);

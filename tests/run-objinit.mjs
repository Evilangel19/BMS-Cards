// Objectives at the start of a scenario (section "obj" of Save0..5.cam) and their merge under the changes of a saved campaign
import fs from 'node:fs';
import { CAM } from '../app/js/core/cam-core.js';
import { camToc, objInitial } from '../app/js/parsers/cam.js';
let ok = true;
const ck = (n, c) => {
  ok &&= !!c;
  console.log(c ? 'ok  ' : 'FAIL', n);
};
const rd = f => new Uint8Array(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url)));
if (!fs.existsSync(new URL('./fixtures/saves/Save3.cam', import.meta.url))) {
  console.log('skipped (fixtures/saves missing)');
  process.exit(0);
}
for (const [n, cnt] of [
  [0, 5999],
  [1, 5999],
  [2, 5999],
  [3, 5999],
  [4, 5999],
  [5, 2730],
]) {
  const m = objInitial(camToc(rd('saves/Save' + n + '.cam')));
  ck('Save' + n + ': ' + cnt + ' objectives read, the section ends exactly', m && m.size === cnt);
}
const m3 = objInitial(camToc(rd('saves/Save3.cam')));
ck(
  'every owner is a team number (0-7)',
  [...m3.values()].every(o => o >= 0 && o <= 7)
);
ck(
  'the scenarios differ in ownership',
  objInitial(camToc(rd('saves/Save2.cam'))).get(3827) !== undefined &&
    [...m3].some(([k, v]) => objInitial(camToc(rd('saves/Save2.cam'))).get(k) !== v)
);
const f = 'beartrap/PSI_BEAR_TRAP_26-double.cam';
if (fs.existsSync(new URL('./fixtures/' + f, import.meta.url))) {
  const C = CAM.openCam(rd(f), CAM.D, 'x.cam');
  ck('a saved campaign names the scenario it was started from', C.base === 'save3');
  const raw = new Map(C.objOwnRaw);
  ck('the changes alone are a small part of the objectives', raw.size > 100 && raw.size < 400);
  ck(
    'until the scenario file is read no owner is claimed (the changes use another numbering)',
    C.objOwn.size === 0 && C.objFeat.size === 0
  );
  const m = objInitial(camToc(rd('saves/Save3.cam')));
  ck(
    'the scenario file maps every entity id of the changes to a campaign id',
    [...raw.keys()].every(k => m.vu.has(k))
  );
  const n = CAM.initialOwners(C, rd('saves/Save3.cam'));
  ck('the initial owners are merged: every objective has one, by campaign id', n === 5999 && C.objOwn.size === 5999);
  ck(
    'the changes of the campaign win over the initial owners (turned into campaign ids)',
    [...raw].every(([k, v]) => C.objOwn.get(m.vu.get(k)) === v)
  );
  ck(
    'the feature states follow the same numbering',
    C.objFeat.size === C.objFeatRaw.size && [...C.objFeatRaw].every(([k, v]) => C.objFeat.get(m.vu.get(k)) === v)
  );
  const sq = C.units.filter(
    u => u.kind == 'sqd' && u.airbase && m.vu.has(u.airbase.n) && C.objOwn.has(m.vu.get(u.airbase.n))
  );
  ck(
    'the owner of a base agrees with the squadron based there',
    sq.length >= 30 && sq.filter(u => C.objOwn.get(m.vu.get(u.airbase.n)) === u.owner).length >= sq.length - 2
  );
  ck(
    'a wrong file leaves the campaign as it was',
    CAM.initialOwners(C, new Uint8Array(100)) === 0 && C.objOwn.size === 5999
  );
}
// EvilKorea (started from Save1): objectives named by the theater files (campaign id) get the owner of the place where they are
const g = 'evilkorea/EvilKorea.cam';
if (
  fs.existsSync(new URL('./fixtures/' + g, import.meta.url)) &&
  fs.existsSync(new URL('./fixtures/saves/Save1.cam', import.meta.url))
) {
  const C = CAM.openCam(rd(g), CAM.D, 'x.cam');
  CAM.initialOwners(C, rd('saves/Save1.cam'));
  const name = id => (C.D.ob.find(o => o[0] === id) || [])[1];
  ck('EvilKorea is started from Save1', C.base === 'save1' && name(3297) === 'Yamaguchi-Ube Airport (RJDC)');
  ck('Yamaguchi-Ube Airport (RJDC) is Japanese (team 3), not North Korean', C.objOwn.get(3297) === 3);
  ck(
    'EW Site Gunsan and the Gunsan chemical plant are South Korean (team 2)',
    name(3115) === 'EW Site Gunsan' &&
      C.objOwn.get(3115) === 2 &&
      name(3691) === 'Slovay Gunsan Chemical Plant' &&
      C.objOwn.get(3691) === 2
  );
  // every objective takes the team of the places around it: check by position that the owner of an objective is the most common one among its neighbours within 3 km (a numbering mix-up would break this a lot)
  const ob = C.D.ob.filter(o => C.objOwn.has(o[0])),
    cell = new Map();
  ob.forEach(o => {
    const k = Math.round(o[2] / 3) + ',' + Math.round(o[3] / 3);
    (cell.get(k) || cell.set(k, []).get(k)).push(C.objOwn.get(o[0]));
  });
  let same = 0,
    tot = 0;
  ob.forEach(o => {
    const arr = cell.get(Math.round(o[2] / 3) + ',' + Math.round(o[3] / 3));
    if (arr.length < 3) return;
    tot++;
    const c = {};
    arr.forEach(v => {
      c[v] = (c[v] || 0) + 1;
    });
    if (c[C.objOwn.get(o[0])] >= arr.length / 2) same++;
  });
  ck(
    'owners agree with the neighbourhood for ' + same + ' of ' + tot + ' objectives in crowded cells (at least 95 %)',
    tot > 500 && same / tot >= 0.95
  );
}
console.log(ok ? 'ALL OK' : 'SOME FAILED');
process.exit(ok ? 0 : 1);

// ATO checks: every flight of the campaign is listed, missions are named, team relations are read from the .tea block.
import fs from 'node:fs';
import { CAM } from '../app/js/core/cam-core.js';
import { buildAto, groupPackages } from '../app/js/core/ato.js';
let n = 0, bad = 0;
const ck = (name, ok) => { n++; if (!ok) { bad++; console.log('FAIL', name); } };
for (const f of ['beartrap/PSI_BEAR_TRAP_26.cam', 'evilkorea/EvilKorea.cam']) {
  const C = CAM.openCam(new Uint8Array(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url))), CAM.D, f);
  const flights = C.units.filter(u => u.kind == 'flight' && u.wps.length);
  ck(f + ' file version known to the reader (' + C.ver + ')', C.ver >= 1 && C.ver <= CAM.CAM_VER_MAX);
  const A = buildAto(C, null);
  ck(f + ' every flight listed', A.length === flights.length);
  ck(f + ' every mission named', A.every(e => e.mission && e.mission !== '?'));
  ck(f + ' packages keep all their flights', groupPackages(A).reduce((s, p) => s + p.flights.length, 0) === A.length);
  ck(f + ' team relations read', C.stance && C.stance.length === 8 && C.stance[1][2] === 1);
  ck(f + ' whole unit file read', C.parse.count === C.parse.num && C.parse.end === C.parse.len);
  ck(f + ' OCA STRIKE is Offensive Counter Air', A.filter(e => e.mission === 'OCA STRIKE').every(e => e.cat === 'Offensive Counter Air'));
  if (f.includes('evil')) ck('PRC and DPRK allied', C.stance[5][6] === 1);
}
// accuracy rules
for (const [nm, hi] of [['F-16CM-40', 1], ['F-16C-52 ROKAF', 1], ['F-16AM RNLAF', 1], ['F-15C', 1], ['F-15D', 1], ['F-15C AGRS', 1], ['F-15E-229', 0], ['F-15K', 0], ['F-15I', 0], ['F-15CJ', 0], ['F-15DJ', 0], ['F/A-18C', 0], ['Su-27', 0]]) ck('hi-fi ' + nm, CAM.isHiFi(nm) === !!hi);
for (const [nm, he] of [['UH-60L', 1], ['AH-64D', 1], ['CH-47', 1], ['MD-500', 1], ['Mi-24', 1], ['MV-22', 1], ['F-16CM-40', 0], ['C-130H', 0], ['MiG-31', 0]]) ck('helicopter ' + nm, CAM.isHeli(nm) === !!he);
{ const C = CAM.openCam(new Uint8Array(fs.readFileSync(new URL('./fixtures/evilkorea/EvilKorea.cam', import.meta.url))), CAM.D, 'x');
  const all = CAM.listFlights(C, null), f16 = CAM.listFlights(C);
  ck('all non-helicopter flights listed', all.length > f16.length && all.every(x => !CAM.isHeli(C.D.ac[x.f.c.i])));
  const lo = all.find(x => !CAM.isHiFi(C.D.ac[x.f.c.i]) && !/^(F\/A|E-|KC|RC|C-|An)/.test(C.D.ac[x.f.c.i]));
  const c1 = CAM.fillCard(C, lo.f), c2 = CAM.fillCard(C, f16[0].f);
  ck('non hi-fi aircraft: no weight/fuel/drag', !c1.gw && !c1.fuel && !c1.drag);
  ck('non hi-fi aircraft: no overhead speed on landing', !Object.entries(c1).some(([k, v]) => /^fp\d+_4$/.test(k) && v === '- / 300'));
  ck('hi-fi aircraft keep them', c2.gw && c2.fuel && Object.entries(c2).some(([k, v]) => /^fp\d+_4$/.test(k) && v === '- / 300')); }
// package mission = its first element; categories as in BMS
{ const C = CAM.openCam(new Uint8Array(fs.readFileSync(new URL('./fixtures/evilkorea/EvilKorea.cam', import.meta.url))), CAM.D, 'x');
  const p = groupPackages(buildAto(C, null)).find(x => x.pkgNo === 2249);
  ck('package 2249 is OCA STRIKE (3 flights, US+ROK)', p && p.mission === 'OCA STRIKE' && p.cat === 'Offensive Counter Air' && p.flights.length === 3 && p.teamName === 'U.S. + ROK'); }
{ const { categoryOf } = await import('../app/js/core/ato.js');
  for (const [m, c] of [['RECCE', 'C3I'], ['RECCE PATROL', 'C3I'], ['RELOCATE', 'Other'], ['OCA STRIKE', 'Offensive Counter Air'], ['AIR REFUEL', 'Support']]) ck('category of ' + m, categoryOf(m) === c); }
{ const C = CAM.openCam(new Uint8Array(fs.readFileSync(new URL('./fixtures/evilkorea/EvilKorea.cam', import.meta.url))), CAM.D, 'x');
  ck('squadron names read from the campaign', Object.keys(C.squads).length === 70 && C.squads[6185] !== undefined);
  const ps = C.units.find(u => u.kind == 'sqd' && u.id.n == C.playerSq);
  ck('player squadron named', /FS/.test(C.squads[ps.id.n]));
  ck('ATO shows the campaign squadron name', buildAto(C, null).some(e => e.squadron === '80th FS (F-16C)')); }
console.log(bad ? `${bad} of ${n} ATO checks failed` : `OK - ${n} ATO checks`);
process.exit(bad ? 1 : 0);

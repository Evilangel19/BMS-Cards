// Parser tests: results must equal the ones produced by the original prototype (tests/golden/parsers.json).
import fs from 'node:fs';
import { parseLink16 } from '../app/js/parsers/link16.js';
import { parseIff } from '../app/js/parsers/iff.js';
import { parseTwx } from '../app/js/parsers/twx.js';
import { parseDtc } from '../app/js/parsers/dtc.js';

const fx = n => new URL('./fixtures/' + n, import.meta.url);
const gold = JSON.parse(fs.readFileSync(new URL('./golden/parsers.json', import.meta.url), 'utf8'));
const files = {
  beartrap: { l16: 'PSI_BEAR_TRAP_26.l16.txtpb', iff: 'PSI_BEAR_TRAP_26.iff', twx: 'PSI_BEAR_TRAP_26.twx', dtc: 'Evil19_2_.ini' },
  evilkorea: { l16: 'EvilKorea_l16.txtpb', iff: 'EvilKorea.iff', twx: 'EvilKorea.twx' },
};
const norm = o => JSON.stringify(JSON.parse(JSON.stringify(o)));
let bad = 0, n = 0;
const check = (name, got, want) => { n++; if (norm(got) !== norm(want)) { bad++; console.log('FAIL', name); } };
for (const [set, f] of Object.entries(files)) {
  const read = k => fs.readFileSync(fx(set + '/' + f[k]));
  check(set + ' link16', parseLink16(read('l16').toString('utf8')), gold[set].l16);
  check(set + ' iff', parseIff(read('iff').toString('utf8')), gold[set].iff);
  const b = read('twx'); check(set + ' twx', parseTwx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)).iso, gold[set].twx);
  if (f.dtc) check(set + ' dtc', parseDtc(read('dtc').toString('latin1')), gold[set].dtc);
}
// player faction = owner of the player squadron (cmp block)
{ const { CAM } = await import('../app/js/core/cam-core.js');
  for (const [f, sq] of [['beartrap/PSI_BEAR_TRAP_26.cam', 8687], ['evilkorea/EvilKorea.cam', 6185]]) {
    n++; const c = CAM.openCam(new Uint8Array(fs.readFileSync(fx(f))), CAM.D, f);
    if (c.playerSq !== sq || c.playerTeam !== 1) { bad++; console.log('FAIL player faction', f, c.playerSq, c.playerTeam); } } }
// error handling
for (const [name, fn] of [['twx too short', () => parseTwx(new ArrayBuffer(8))], ['twx bad date', () => parseTwx(new ArrayBuffer(728))]]) {
  n++; try { fn(); bad++; console.log('FAIL', name, '(no error)'); } catch (e) { /* expected */ }
}
console.log(bad ? `${bad} of ${n} parser checks failed` : `OK - ${n} parser checks match the prototype`);
process.exit(bad ? 1 : 0);

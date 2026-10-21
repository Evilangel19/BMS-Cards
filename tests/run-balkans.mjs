// Other theater (Balkans, .cam version 110): the campaign needs the class table OF THAT THEATER; the weather map has another cell layout.
import fs from 'node:fs';
import {CAM} from '../app/js/core/cam-core.js';
import {parseCt, parseTheaterTxt} from '../app/js/bmsdata/bmsdata.js';
import {parseFmap} from '../app/js/parsers/fmap.js';
const dir = new URL('./fixtures/balkans/', import.meta.url);
if (!fs.existsSync(new URL('prova.cam', dir))) { console.log('SKIP - no Balkans fixture'); process.exit(0); }
let n = 0, bad = 0; const ck = (m, c, i = '') => { n++; if (!c) { bad++; console.log('FAIL', m, i); } };
const rd = f => fs.readFileSync(new URL(f, dir));
const D = {...CAM.D, ct: parseCt(rd('FALCON4_CT.xml').toString('latin1'))};
const C = CAM.openCam(new Uint8Array(rd('prova.cam')), D, 'prova.cam');
ck('version 110', C.ver === 110);
ck('every record read, to the last byte', C.parse.num === 2079 && C.parse.count === 2079 && C.parse.end === C.parse.len, JSON.stringify(C.parse));
const k = {}; C.units.forEach(u => k[u.kind] = (k[u.kind] || 0) + 1);
ck('unit kinds', k.gnd > 1000 && k.flight > 100 && k.sqd > 100 && !k.obj, JSON.stringify(k));
// with the Korea table the same file does not read (the numbering of the classes is different)
let korea = true; try { const K = CAM.openCam(new Uint8Array(rd('prova.cam')), CAM.D, 'prova.cam'); korea = K.parse.end === K.parse.len && K.parse.count === 2079; } catch (e) { korea = false; }
ck('the Korea class table does not fit this theater', !korea);
const w = parseFmap(new Uint8Array(rd('10900.fmap')));
ck('fmap version 5: 59 x 59 cells, 5 arrays after the winds', w.X === 59 && w.Y === 59 && w.tail === 5);
const c = w.at(512, 512); ck('fmap cell values are sane', c.p > 950 && c.p < 1060 && c.t > -40 && c.t < 50 && c.cond >= 0 && c.cond <= 3 && c.fogEnd > 0 && c.fogEnd <= 60 && c.dens >= 0 && c.dens <= 13 && c.shower === 0);
const g = parseTheaterTxt(rd('Theater.txt').toString('latin1')); ck('Theater.txt', g && g.name === 'Balkans' && g.sizeKm === 1024);
console.log(bad ? `${bad} of ${n} Balkans checks failed` : `OK - ${n} Balkans checks`);
process.exit(bad ? 1 : 0);

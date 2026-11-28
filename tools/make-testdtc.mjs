// Makes the DTC of the browser tests (tests/fixtures/beartrap/Evil19_2_.ini, gitignored) from a DTC saved by BMS and the campaign it goes with: the
// route of the flight of the player (STPT 1-24 and the bullseye, as Write DTC does: routeRows), three precision targets (STPT 96-98) on the first
// action steerpoint of that route, and four LINEs of 5, 5, 6 and 3 points around it, so the pages that read the DTC (A-G, Map, Data Cartridge) have a
// route, targets and lines whatever the saved DTC holds. The rest of the file (radios, IFF, Link 16, MFD, PPT ...) stays as BMS wrote it.
// Usage: node tools/make-testdtc.mjs <saved DTC .ini> <campaign .cam> [out]
import fs from 'node:fs';
import { CAM } from '../app/js/core/cam-core.js';
import { routeRows } from '../app/js/core/mapdtc.js';
import { playerPick } from '../app/js/core/ato.js';

const [src, cam, out = new URL('../tests/fixtures/beartrap/Evil19_2_.ini', import.meta.url)] = process.argv.slice(2);
if (!src || !cam) {
  console.log('Usage: node tools/make-testdtc.mjs <saved DTC .ini> <campaign .cam> [out]');
  process.exit(1);
}
const C = CAM.openCam(new Uint8Array(fs.readFileSync(cam)), CAM.D, cam);
const fl = C.units.filter(u => u.kind == 'flight' && u.wps && u.wps.length),
  p = playerPick(
    fl.map(f => ({ f })),
    C.now
  );
if (!p) throw new Error('no flight of the player in ' + cam);
const f = p.f,
  FT_KM = 3280.84,
  f6 = v => v.toFixed(6),
  act = f.wps.find((w, i) => i > 0 && ![0, 1, 2, 3, 4, 7, 8].includes(w.act)) || f.wps[Math.min(2, f.wps.length - 1)],
  pt = (dx, dy, alt) => [f6((act.y + dy) * FT_KM), f6((act.x + dx) * FT_KM), f6(-alt)].join(', '),
  set = new Map(routeRows(C, f));
// precision targets: STPT 96, 97, 98 (target_95-97) 1-2 km around the action steerpoint
[
  [0.0, 0.0],
  [1.2, 0.4],
  [-0.8, 1.5],
].forEach(([dx, dy], i) => set.set('target_' + (95 + i), pt(dx, dy, 200 + 20 * i) + ', -1, Test target ' + (i + 1)));
// LINE1-4: 5, 5, 6 and 3 points (lineSTPT_0-23, six a line), a ring of points around the target
const LINE_USED = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20];
for (let i = 0; i < 24; i++) {
  const a = (i / 24) * 2 * Math.PI,
    r = 8 + (i % 6);
  set.set(
    'lineSTPT_' + i,
    LINE_USED.includes(i) ? pt(Math.cos(a) * r, Math.sin(a) * r, 0) : '0.000000, 0.000000, 0.000000'
  );
}
let sec = '';
const text = fs
  .readFileSync(src, 'latin1')
  .split('\r\n')
  .map(l => {
    const s = l.match(/^\[(.*)\]$/);
    if (s) sec = s[1];
    const m = sec == 'STPT' && l.match(/^([^=]+)=/);
    return m && set.has(m[1]) ? m[1] + '=' + set.get(m[1]) : l;
  })
  .join('\r\n');
fs.writeFileSync(out, text, 'latin1');
console.log(
  'test DTC: the route of ' +
    (C.D.S[2000 + f.csId] || '#' + f.csId) +
    ' ' +
    f.csNum +
    ' (' +
    f.wps.length +
    ' steerpoints), 3 targets on STPT ' +
    (f.wps.indexOf(act) + 1) +
    ', 4 lines'
);

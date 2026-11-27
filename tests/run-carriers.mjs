// Aircraft carriers: the objective rows of the ships (position 0,0) are joined to the ship units that carry squadrons; flights that take off from a ship get the ship as their base.
import fs from 'node:fs';
import { CAM } from '../app/js/core/cam-core.js';
import { carriers, carrierRadio, carrierNear, isShipBase } from '../app/js/core/carriers.js';
import { nearAb } from '../app/js/core/flight.js';
import { buildAto } from '../app/js/core/ato.js';
import { mapUnits } from '../app/js/core/mapdata.js';
import { tcnFor } from '../app/js/rules/airbase.js';
let bad = 0;
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) bad++;
};
CAM.setBase('2026-09-30');
// PSIKorea: the Vinson with its flights; KoreaU2: four ships, two of them called Wasp (the hull number picks one). The places are the ones of the file.
const open = f => CAM.openCam(new Uint8Array(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url))), CAM.D, f);
const C = open('psikorea/PSIKorea.cam'),
  C2 = open('koreau2/KoreaU2.cam');
const cv = carriers(C),
  cv2 = carriers(C2),
  by = n => cv.find(r => r[1] == n);
ok(
  cv.length >= 2 && by('USS Carl Vinson') && by('TAKR Kuznetsov') && cv2.some(r => r[1] == 'LHD-1 Wasp'),
  'the ships that carry squadrons are found: ' + cv.map(r => r[1]).join(', ') + ' / ' + cv2.map(r => r[1]).join(', ')
);
const V = by('USS Carl Vinson'),
  vx = V.unit.x,
  vy = V.unit.y;
ok(V[2] == vx && V[3] == vy && vx > 0, 'the row takes the position of the ship, not 0,0');
ok(carrierRadio(C, V).tcn == '10X' && carrierRadio(C, V).uhf == '270.200', 'TACAN 10X and UHF 270.200 of the Vinson');
ok(
  cv2.some(r => r[1] == 'LHD-1 Wasp') && !cv2.some(r => r[1] == 'LHD-2 Wasp'),
  'two ships called Wasp: the hull number picks LHD-1'
);
const A = buildAto(C, null),
  fromV = A.filter(e => e.base == 'USS Carl Vinson');
ok(fromV.length >= 10, 'ATO: flights that leave the Vinson name it as their base (' + fromV.length + ')');
ok(
  carrierNear(C, vx + 10, vy + 5).row === V && carrierNear(C, vx + 60, vy + 60) === null,
  'a ship counts as a base within 25 km only'
);
const a = nearAb(C, vx + 10, vy + 5);
ok(
  a === V && tcnFor(C, a, C.D.ab[a[0]]) == '10 X',
  'the datacard side: same row every time, TACAN from the airbase row'
);
ok(
  isShipBase(a) &&
    isShipBase(cv2.find(r => r[1] == 'LHD-1 Wasp')) &&
    !isShipBase(['1', 'Osan AB']) &&
    !isShipBase(null),
  'a ship base is told from an airfield (no refusal speed from a ship)'
);
const F = CAM.fillCard(C, fromV[0].f);
ok(
  String(F.ab0_0).includes('Vinson') && /^10/.test(F.ab0_1),
  'fill card: departure is the ship with its TACAN (' + F.ab0_0 + ' ' + F.ab0_1 + ')'
);
ok(
  mapUnits(C, 1).filter(m => m.carrier).length == cv.length,
  'the map units mark the ships (name, TACAN, UHF for the tooltip)'
);
process.exit(bad ? 1 : 0);

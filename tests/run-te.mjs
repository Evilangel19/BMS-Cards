// Tactical Engagement (.tac): a campaign file with one more section ("te"); read like a campaign.
import fs from 'node:fs';
import { CAM } from '../app/js/core/cam-core.js';
import { buildAto } from '../app/js/core/ato.js';
import { teTeams } from '../app/js/parsers/cam.js';
import { parseTwx } from '../app/js/parsers/twx.js';
import { parseIff } from '../app/js/parsers/iff.js';
import { parseLink16 } from '../app/js/parsers/link16.js';
const dir = new URL('./fixtures/te/', import.meta.url);
if (!fs.existsSync(new URL('TE_BMS_03_F-16_DEAD.tac', dir))) {
  console.log('SKIP - no Tactical Engagement fixture');
  process.exit(0);
}
let n = 0,
  bad = 0;
const ck = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
const C = CAM.openCam(
  new Uint8Array(fs.readFileSync(new URL('TE_BMS_03_F-16_DEAD.tac', dir))),
  CAM.D,
  'TE_BMS_03_F-16_DEAD.tac'
);
ck('reads to the last byte', C.parse.end === C.parse.len);
ck('is a TE, the name has no extension', C.isTe === true && C.name === 'TE_BMS_03_F-16_DEAD');
ck('version known', C.ver <= CAM.CAM_VER_MAX);
const fl = CAM.listFlights(C, null);
ck('5 flights', fl.length === 5);
ck('the player side comes from the TE teams (team 1)', C.playerTeam === 1);
ck(
  'teTeams: only the named teams',
  JSON.stringify(
    teTeams(
      new TextEncoder().encode(
        ':Teams\n7\n:Team\n1 66 26\n:TeamName\nPILOTS\n:TeamFlag\n1\n:Team\n2 0 0\n:TeamName\n---\n:TeamFlag\n2\n'
      )
    )
  ) === '[{"n":1,"name":"PILOTS"}]'
);
const A = buildAto(C, null);
ck('ATO lists every flight', A.length === 5);
ck(
  'the F-16 DEAD flight is there',
  fl.some(x => /F-16/.test(x.label) && /DEAD/.test(x.label))
);
ck(
  'a campaign file is not a TE',
  !CAM.openCam(
    new Uint8Array(fs.readFileSync(new URL('./fixtures/beartrap/PSI_BEAR_TRAP_26.cam', import.meta.url))),
    CAM.D,
    'x.cam'
  ).isTe
);
const t = fs.readFileSync(new URL('TE_BMS_03_F-16_DEAD.twx', dir));
ck('date file read', /^\d{4}-\d\d-\d\d$/.test(parseTwx(new Uint8Array(t).buffer).iso));
ck(
  'IFF file read',
  Object.keys(parseIff(fs.readFileSync(new URL('TE_BMS_03_F-16_DEAD.iff', dir), 'latin1'))).length > 0
);
ck(
  'Link16 file read',
  Object.keys(parseLink16(fs.readFileSync(new URL('TE_BMS_03_F-16_DEAD.l16.txtpb', dir), 'latin1'))).length > 0
);
console.log(bad ? `${bad} of ${n} TE checks failed` : `OK - ${n} TE checks`);
process.exit(bad ? 1 : 0);

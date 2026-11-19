// DEAD planning (core/dead.js) on a made-up flight plan: the altitude blocks of the manual, the HARM standoff (the launch outside the WEZ, the turn at
// the arc radius, the impact on the arc, the orbit side), the Hunter-Killer (the anchors outside the arc either side of the way in, the hunter's arc, the
// defence back to its anchor, the killer's attack, the nav offsets of the anchors), the roles.
import { deadPlan, altRating, defaultRoles, partnerRole, rolesOf, at } from '../app/js/core/dead.js';
let n = 0,
  bad = 0;
const ck = (name, ok, x) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name, x === undefined ? '' : JSON.stringify(x));
  }
};
const T0 = 10 * 3600000,
  KMH = kt => kt * 1.852,
  SAM = { x: 100, y: 0, rng: 24 * 1.852, det: 40 * 1.852, name: 'SA-2' };
// from the west at 450 kt, 20 000 ft, the task (17) on the SAM
const wps = [
  { x: 0, y: 0, z: 2000, arr: T0, act: 0 },
  { x: 100, y: 0, z: 2000, arr: T0 + (100 / KMH(450)) * 3600000, act: 17 },
  { x: 0, y: 20, z: 2000, arr: T0 + (200 / KMH(450)) * 3600000, act: 0 },
];
const nm = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / 1.852;
ck(
  'altitude: 35 000 optimal, 20 000 good, 10 000 bad, 200 ft optimal',
  altRating(35000).ok && altRating(20000).r == 'GOOD' && altRating(10000).r == 'BAD' && altRating(200).ok
);
ck(
  'the default roles: shooter and cover; killer, hunter, the element cover; the partner of a pair swapped',
  defaultRoles('hs', 2).join() == 'shooter,cover' &&
    defaultRoles('hk', 4).join() == 'killer,hunter,cover,cover' &&
    partnerRole('hk', 'killer') == 'hunter' &&
    partnerRole('hs', 'cover') == 'shooter' &&
    rolesOf('hk', 0).join() == 'hunter,killer' &&
    rolesOf('bomb', 3).includes('cover')
);
const shot = () => ({ rTh: 40, vm: 0.36 });
const H = deadPlan({ sam: SAM, wps, tactic: 'hs', roles: ['shooter', 'shooter'], shot });
ck(
  'HARM standoff: from the west (bearing 270 from the SAM), 450 kt, 20 000 ft',
  Math.abs(H.th - 270) < 0.5 && H.gs == 450 && H.alt == 20000 && H.rating.r == 'GOOD'
);
ck(
  '...the launch outside the WEZ, up to 12 nm before the turn, in range',
  H.dL > H.Ra && H.dL <= H.Ra + 12 && H.dL <= 40 && Math.abs(nm(H.L, SAM) - H.dL) < 0.01
);
ck('...the turn at the WEZ + 2 nm', Math.abs(H.Ra - 26) < 0.01 && Math.abs(nm(H.turn, SAM) - 26) < 0.01);
ck(
  '...the impact on the arc (after the turn), the time of flight from the range',
  H.tImp > H.tTurn && Math.abs(H.tof - H.dL / 0.36) < 0.5 && !H.warn.length,
  H.warn
);
ck(
  '...the arc round the SAM at its radius',
  H.arc.every(p => Math.abs(nm(p, SAM) - 26) < 0.01)
);
ck('...SAM on the right: clockwise from the west goes north', H.arc[H.arc.length - 1].y > 10);
const HL = deadPlan({ sam: SAM, wps, tactic: 'hs', side: 'L', roles: ['shooter'], shot });
ck('...SAM on the left: south', HL.arc[HL.arc.length - 1].y < -10);
ck('...two shooters 8 s apart', H.seats.length == 2 && H.seats[1].tl - H.seats[0].tl == 8000);
const HF = deadPlan({ sam: SAM, wps, tactic: 'hs', roles: ['shooter'], shot: () => ({ rTh: 20, vm: 0.36 }) });
ck(
  '...a HARM that cannot reach from outside the WEZ: flagged',
  HF.warn.some(w => /Out of range/.test(w))
);
const far = deadPlan({ sam: { ...SAM, det: 20 * 1.852 }, wps, tactic: 'hs', roles: ['shooter'], shot });
ck(
  '...an arc outside the search radar: flagged',
  far.warn.some(w => /search radar/.test(w))
);
const K = deadPlan({ sam: SAM, wps, tactic: 'hk', roles: ['killer', 'hunter'], shot });
ck(
  'Hunter-Killer: the anchors 8 nm outside the arc, either side of the way in',
  Math.abs(nm(K.A, SAM) - 34) < 0.01 && Math.abs(nm(K.B, SAM) - 34) < 0.01 && K.A.y > 0 && K.B.y < 0,
  [K.A, K.B]
);
ck(
  '...the hunter: the bait arc 90 degrees inside the WEZ, on the WEZ with ECM on, then back to its anchor',
  K.arc.every(p => Math.abs(nm(p, SAM) - K.Recm) < 0.01) &&
    K.Rb < K.R &&
    nm(K.def[K.def.length - 1], K.A) < 0.01 &&
    K.tArc0 < K.tArc1 &&
    K.tArc1 < K.tBack
);
ck(
  '...the killer attacks from its anchor towards the SAM after the reset',
  nm(K.atk[0], K.B) < 0.01 && nm(K.atk[2], SAM) < 4.1 && K.tAtk > K.tBack
);
ck(
  '...the nav offsets of the anchors from the task steerpoint (STPT 2)',
  K.oa &&
    K.oa.n == 2 &&
    Math.abs(K.oa.oa1.nm - 34) < 0.01 &&
    K.oa.oa1.rngFt > 200000 &&
    K.oa.oa1.brg > 270 &&
    K.oa.oa2.brg < 270
);
const K0 = deadPlan({ sam: SAM, wps, tactic: 'hk', roles: ['killer', 'killer'], shot });
ck(
  '...no hunter: flagged',
  K0.warn.some(w => /No hunter/.test(w))
);
ck('at(): 10 nm north', Math.abs(at({ x: 0, y: 0 }, 360, 10).y - 18.52) < 1e-9);
console.log(bad ? `run-dead.mjs: ${bad} of ${n} FAILED` : `run-dead.mjs: OK - ${n} checks`);
process.exit(bad ? 1 : 0);

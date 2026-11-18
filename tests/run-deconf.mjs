// Lead and element (or wingman) attacks of one flight (core/deconf.js): the path of an attack with its altitudes and times, the fragment zone of its
// bombs, the conflict of two attacks and the least spacing after the lead. Pop-ups computed here on one target; no fixtures.
import { computePopup, project } from '../app/js/core/popup.js';
import { envelope } from '../app/js/core/lethal.js';
import { attackTrack, fragZone, deconflict, SEP } from '../app/js/core/deconf.js';

let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const T = { n: 0, e: 0 },
  R = { n: -30000, e: 0 },
  env = envelope(500);
// the drawing of a pop-up, as the Weapons page makes it (phases in feet)
const segsOf = r => [
  ['ingress', [r.vrp, r.pup]],
  ['climb', [r.climbStart, r.pdp]],
  ['pull', r.arc],
  ['dive', [r.map, r.release]],
  ['fall', [r.release, r.target]],
  ['egress', [r.target, r.oa]],
];
const pop = (inp, tgt = T) => {
  const r = computePopup(tgt, R, { heading: 360, side: 'right', ...inp });
  return { r, trk: attackTrack(segsOf(r), r.v, 'popup'), zone: fragZone(r, env) };
};

// ---- the path
const A = pop({});
ck('the path has points', A.trk.length > 20);
const rel = A.trk.reduce((b, p) => (Math.abs(p.t) < Math.abs(b.t) ? p : b));
ck('time 0 at the release point', Math.hypot(rel.n - A.r.release.n, rel.e - A.r.release.e) < 300);
ck('before the release the times are negative, after it positive', A.trk[0].t < -10 && A.trk[A.trk.length - 1].t > 5);
ck('the ingress at the ingress altitude', Math.abs(A.trk[0].alt - A.r.v.ingressAltitude) < 1);
ck('the release at the release altitude', Math.abs(rel.alt - A.r.v.releaseAltitude) < 50);
ck('the top of the climb at the apex', Math.abs(Math.max(...A.trk.map(p => p.alt)) - A.r.v.apexAltitude) < 1);
ck(
  'times rise along the path',
  A.trk.every((p, i) => !i || p.t >= A.trk[i - 1].t - 1e-6)
);

// ---- the fragment zone
ck(
  'the zone: the lethal radius and height around the impacts, from the impact while the fragments fall',
  A.zone.out == 3600 &&
    A.zone.up == 2450 &&
    Math.abs(A.zone.t0 - A.r.v.timeOfFall) < 0.01 &&
    Math.abs(A.zone.t1 - A.zone.t0 - 25) < 0.01
);
ck('no bomb envelope, no zone', fragZone(A.r, null) === null);

// ---- two attacks
const same = deconflict(A, pop({}));
ck('the same attack twice: a conflict (fragments and the same path)', same.conflict && same.frag && !!same.close);
ck('the same attack twice: the spacing covers the fragments', same.spacing >= 25);
const far = deconflict(A, pop({}, project(T, 90, 12 * 6076)));
ck('another target 12 nm away: no conflict, no spacing', !far.conflict && far.spacing === 0 && far.zones);
// the split attack: the same ingress, the turn to the other side, the attack heading mirrored about the climb heading
const I = A.r.v.pullHeading,
  M = pop({ side: 'left', heading: (2 * I - 360 + 720) % 360 });
ck('the mirrored attack keeps the climb heading', Math.abs(M.r.v.pullHeading - I) < 0.5);
const mir = deconflict(A, M);
ck(
  'the mirrored attack: the release points apart',
  Math.hypot(M.r.release.n - A.r.release.n, M.r.release.e - A.r.release.e) > SEP
);
ck('the mirrored attack on the same target still needs a spacing', mir.frag && mir.spacing > 0);
// a high release above the fragments, egress high: the paths keep out of the zone
const hi = { releaseAltitude: 6000, diveAngle: 30, egressAltitude: 6000, ingressAltitude: 500 },
  H1 = pop(hi),
  H2 = pop({ ...hi, side: 'left', heading: (2 * H1.r.v.pullHeading - 360 + 720) % 360 });
const hd = deconflict(H1, H2);
ck('a release above the fragments, mirrored: the fragments are kept out of ' + JSON.stringify(hd), !hd.frag);

console.log(bad ? `run-deconf.mjs: ${bad} of ${n} FAILED` : `run-deconf.mjs: OK - ${n} checks`);
if (bad) process.exit(1);

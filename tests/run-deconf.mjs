// Lead and element (or wingman) attacks of one flight (core/deconf.js): the path of an attack with its altitudes and times, the fragment zone of its
// bombs, the conflict of two attacks and the least spacing after the lead. Pop-ups computed here on one target; no fixtures.
import { computePopup, project } from '../app/js/core/popup.js';
import { envelope } from '../app/js/core/lethal.js';
import { attackTrack, fragZone, deconflict, fromSplit, SEP } from '../app/js/core/deconf.js';

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
ck('the same attack twice: the fragments, the spacing covers them', same.frag && same.spacing >= 25);
ck('the same attack twice with that spacing: not together in the air', !same.close);
const B0 = pop({}),
  nofrag = deconflict({ trk: A.trk, zone: null }, { trk: B0.trk, zone: null });
ck(
  'the same attack twice without fragments: together at the same time, a spacing keeps them apart ' + nofrag.spacing,
  nofrag.met && !nofrag.close && nofrag.spacing > 0 && nofrag.spacing <= 5
);
// head on along one line for a long way: no spacing (up to MAX_DT) keeps them apart, a conflict of the attacks
const line = (n0, dn) =>
    Array.from({ length: 400 }, (_, i) => ({ n: n0 + dn * i * 250, e: 0, alt: 1000, t: i * 0.5, s: 2000 + i * 250 })),
  head = deconflict({ trk: line(0, 1), zone: null }, { trk: line(99750, -1), zone: null });
ck('head on along one line: no spacing clears it', !!head.close && head.conflict);
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

// ---- the split point: before it the two fly together; times from it
const S = fromSplit(A.trk, A.zone, A.r.pup),
  tp = A.trk.reduce((b, p) =>
    Math.hypot(p.n - A.r.pup.n, p.e - A.r.pup.e) < Math.hypot(b.n - A.r.pup.n, b.e - A.r.pup.e) ? p : b
  ).t;
ck(
  'from the split: the path starts at the PUP at time 0',
  Math.hypot(S.trk[0].n - A.r.pup.n, S.trk[0].e - A.r.pup.e) < 300 && S.trk[0].t === 0
);
ck('from the split: no ingress before the PUP', S.trk.length < A.trk.length);
ck(
  'from the split: the fragment times move with it',
  Math.abs(S.zone.t0 - (A.zone.t0 - tp)) < 1e-6 && Math.abs(S.zone.t1 - (A.zone.t1 - tp)) < 1e-6
);
ck('no split point: the whole path', fromSplit(A.trk, A.zone, null).trk === A.trk);
// two attacks on one ingress line (in trail): from the PUP on, not before
const far2 = pop({}, project(T, 90, 12 * 6076)),
  shared = deconflict(fromSplit(A.trk, A.zone, A.r.pup), fromSplit(far2.trk, far2.zone, far2.r.pup));
ck('apart after their split points: no conflict', !shared.conflict);
// leaving the same split point together is not a close approach
const T1a = computePopup(T, R, { heading: 360, side: 'right', profileType: 1 }),
  T1b = computePopup(T, R, { heading: (2 * T1a.v.approachHeading - 360 + 720) % 360, side: 'left', profileType: 1 }),
  sd = r => fromSplit(attackTrack(segsOf(r), r.v, 'popup'), fragZone(r, env), r.pup),
  tog = deconflict(sd(T1a), sd(T1b));
ck('Type 1 and its mirror from the same PUP: not too close ' + JSON.stringify(tog.close), !tog.close);
ck('from the split: the distance flown', sd(T1a).trk[0].s === 0 && sd(T1a).trk.at(-1).s > 10000);
// the Type 1 mirror about the approach: the same approach and the same PUP
const T1 = computePopup(T, R, { heading: 360, side: 'right', profileType: 1 }),
  h1 = T1.v.approachHeading,
  T1m = computePopup(T, R, { heading: (2 * h1 - 360 + 720) % 360, side: 'left', profileType: 1 });
ck(
  'Type 1 mirrored about the approach: the same approach heading and PUP ' + [h1, T1m.v && T1m.v.approachHeading],
  !T1m.error &&
    Math.abs(((T1m.v.approachHeading - h1 + 540) % 360) - 180) < 1 &&
    Math.hypot(T1m.pup.n - T1.pup.n, T1m.pup.e - T1.pup.e) < 200
);

console.log(bad ? `run-deconf.mjs: ${bad} of ${n} FAILED` : `run-deconf.mjs: OK - ${n} checks`);
if (bad) process.exit(1);

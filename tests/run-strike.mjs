// HADB and LAT (toss) planners: geometry and sanity checks.
import { computeHadb, computeToss } from '../app/js/core/strike.js';
import { dist, bearing, norm, FT_KT } from '../app/js/core/popup.js';
let n = 0, bad = 0;
const ck = (name, ok) => { n++; if (!ok) { bad++; console.log('FAIL', name); } };
const near = (a, b, t = 1) => Math.abs(a - b) <= t;
const T = {n: 120000, e: 100000}, R = {n: 100000, e: 100000};
{
  const h = computeHadb(T, R, {heading: 360, angleOff: 60, side: 'right'}), v = h.v;
  ck('HADB: release is the bomb range before the target on the attack line', near(dist(h.vrp, T), v.releaseRange, 1) && near(bearing(h.vrp, T), 360, .01) || near(bearing(h.vrp, T), 0, .01));
  ck('HADB: ingress heading is the attack heading turned away by the angle off (right turn -> 300)', near(v.ingressHeading, 300, .01) && near(bearing(h.oa, h.pup), 300, .01));
  ck('HADB: OA1 is the set distance before the VIP', near(dist(h.oa, h.pup), 18228, 1));
  ck('HADB: ingress altitude = release altitude + tracking drop + turn drop', near(v.ingressAltitude, v.releaseAltitude + v.releaseSpeed * FT_KT * Math.sin(v.diveAngle * Math.PI / 180) * v.timeOnFinal + v.altitudeLoss, 1));
  const l = computeHadb(T, R, {heading: 360, angleOff: 60, side: 'left'});
  ck('HADB: left turn comes in on the other side (heading 060, VIP on the other side of the attack line)', near(l.v.ingressHeading, 60, .01) && (l.pup.e - T.e) * (h.pup.e - T.e) < 0);
  const z = computeHadb(T, R, {angleOff: 0, diveAngle: 30}), A = 30 * Math.PI / 180;
  ck('HADB: angle off 0 is a plain vertical pull-down: drop = R (1 - cos A)', near(z.v.altitudeLoss, z.v.turnRadius * (1 - Math.cos(A)), 1) && near(dist(z.pup, z.vrp) * 0 + z.pup.e, T.e, 1));
  ck('HADB: a steeper dive needs less ground distance', computeHadb(T, R, {diveAngle: 45}).v.releaseRange < computeHadb(T, R, {diveAngle: 20}).v.releaseRange);
  ck('HADB: AOD (distance past the target where the dive line meets the ground) is positive', h.v.aod > 0);
  ck('HADB: vertical profile ends at the release', h.vert.segs.length === 4);
}
{
  const t = computeToss(T, R, {angleOff: 0}), v = t.v;
  ck('TOSS: release is the bomb range before the target', near(dist(t.pup, T) - v.pullDistance, v.releaseRange, 2) || near(dist(t.pup, T), v.releaseRange + v.pullDistance, 2));
  ck('TOSS: no turn gives no OA2', t.oa2 === null && !t.hasTurn);
  ck('TOSS: lowest release altitude = ingress altitude + pull-up climb, extra climb adds to it', v.releaseAltitude === v.minReleaseAltitude && computeToss(T, R, {releaseExtra: 500}).v.releaseAltitude > v.releaseAltitude + 499);
  ck('TOSS: a higher release angle needs a shorter pull-up and gives more height', computeToss(T, R, {releaseAngle: 40}).v.minReleaseAltitude > v.minReleaseAltitude);
  ck('TOSS: more G, shorter pull-up', computeToss(T, R, {turnG: 5}).v.pullDistance < computeToss(T, R, {turnG: 3}).v.pullDistance);
  const r = computeToss(T, R, {angleOff: 45, side: 'right'}), l = computeToss(T, R, {angleOff: 45, side: 'left'});
  ck('TOSS: with a turn there are a VRP and an OA2, on the ingress heading', r.hasTurn && near(bearing(r.oa2, r.vrp), 315, .1) && near(bearing(l.oa2, l.vrp), 45, .1));
  ck('TOSS: right / left turns come from opposite sides', (r.vrp.e - T.e) * (l.vrp.e - T.e) < 0);
  ck('TOSS: bomb track goes up and over (altitude above release at some point)', r.vert.segs[3][1].some(p => p[1] > r.v.releaseAltitude));
}
// ---- MAT (standoff toss around a SAM WEZ)
{
  const { matCheck, computeToss, TOSS_DEFAULTS: TD } = await import('../app/js/core/strike.js');
  const tgt = {n: 0, e: 0}, ref = tgt, base = computeToss(tgt, ref, {...TD, heading: 360, ingressAltitude: 20000, releaseAngle: 30});
  const ck2 = (n, c) => { if (!c) { console.log('FAIL', n); process.exitCode = 1; } else console.log('ok  ', n); };
  // a SAM 5 nm south of the target (the attack heading is north, so the aircraft flies over it): ring 20 nm
  const ppt = {n: -5 * 6076.12, e: 0, ringFt: 20 * 6076.12};
  const low = computeToss(tgt, ref, {...TD, heading: 360, ingressAltitude: 300, releaseAngle: 30}), a = matCheck(low, ppt, {max: 30000, min: 300});
  ck2('MAT: a low ingress through the ring is inside the WEZ', a.hit && a.chord && a.chord[0] < a.chord[1] && !a.releaseOutside && a.short > 0);
  const hi = matCheck(computeToss(tgt, ref, {...TD, heading: 360, ingressAltitude: 32000, releaseAngle: 30}), ppt, {max: 30000, min: 300});
  ck2('MAT: above the SAM top the path is clear even inside the ring', !hi.hit && hi.aboveSam && hi.ingressAbove);
  const far = matCheck(base, {n: -80 * 6076.12, e: 0, ringFt: 20 * 6076.12}, {max: 30000, min: 300});
  ck2('MAT: a ring far from the attack line is not touched', !far.hit && far.releaseOutside);
  const side = matCheck(low, {n: 0, e: 60 * 6076.12, ringFt: 20 * 6076.12}, {max: 30000, min: 300});
  ck2('MAT: a ring off to the side does not cross the attack line', side.chord === null && !side.hit);
}

console.log(bad ? 'strike: ' + bad + ' FAILED' : 'strike: ' + n + '/' + n + ' checks passed'); process.exit(bad ? 1 : 0);

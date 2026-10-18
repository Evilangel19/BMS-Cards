// Air-to-air and anti-radiation missile shots from the BMS missile tables (bmsdata/missiledata.js). General estimates, not BMS code:
// the table gives the maximum range for a launch altitude, ownship speed and target altitude; here it is extended with the target's speed and aspect
// and with a mean missile speed, to get the time of flight and where to shoot. Distances in feet, speeds in knots, altitudes in ft, angles in degrees.
import { rmax, loftAngle } from '../bmsdata/missiledata.js';
import { project, dist, bearing, norm } from './popup.js';

const KT = 1.68781;                                  // ft/s per knot
export const NM = 6076.12;
// speed of sound (ft/s) at an altitude, ISA up to the tropopause then constant
export const soundSpeed = alt => 65.7673 * Math.sqrt(Math.max(216.65, 288.15 - 0.0019812 * Math.min(alt, 36089)));
const MEAN_MACH = {harm: 2.2, aam: 2.5};             // mean missile speed over the flight, in Mach (assumption)

// maximum range against a target of given speed and aspect (0 = head-on, 180 = tail chase): R(a) = Rhead (Vm + Vt cos a) / (Vm + Vt)
export function bvrShot(m, o) {
  const v = {alt: 25000, speed: 450, tgtAlt: 25000, tgtSpeed: 450, aspect: 0, shotPct: 100, kind: 'aam', ...o};
  const rHead = rmax(m, v.alt, v.speed * KT, v.tgtAlt); if (rHead == null) return {error: 'This missile has no range table.'};
  const vm = MEAN_MACH[v.kind] * soundSpeed((v.alt + v.tgtAlt) / 2), vt = v.tgtSpeed * KT;
  const at = a => rHead * (vm + vt * Math.cos(a * Math.PI / 180)) / (vm + vt);
  const rMax = at(v.aspect), shot = rMax * v.shotPct / 100;
  // time of flight to a shot at `shot` ft: the target moves away at -Vt cos(a) along the line, so the missile covers shot / (1 - away/vm)
  const tgtDia = {small: 'SmallFighterPitbull', fighter: 'FighterPitbull', bomber: 'BomberPitbull'}[v.tgtSize || 'fighter'], pitbullNm = m.extra && m.extra[tgtDia];
  const away = -vt * Math.cos(v.aspect * Math.PI / 180), rangeAt = t => shot - (v.speed * KT) * t + away * t, flight = shot / (vm - away);
  const tp = pitbullNm ? pitbullNm * NM / (vm - away) : null, tActive = tp !== null ? Math.max(0, flight - tp) : null;
  // DLZ cues (manual 4.3.2.5.1.1): RAERO = the range at this aspect, RTR = the same for a target turned to tail aspect; A-pole / F-pole = range own aircraft to target when the seeker goes active (pitbull range of the data file) / at impact
  const dlz = {raero: rMax, rtr: at(180), aPole: tActive === null ? null : rangeAt(tActive), fPole: rangeAt(flight), pitbullNm: pitbullNm || null, timeToActive: tActive, closure: (v.speed * KT - away) / KT};
  return {v, rHead, rMax, shot, flight, vm, dlz, loft: null, curve: Array.from({length: 19}, (_, i) => [i * 10, at(i * 10)])};
}

// ---------- HARM ----------
// Position-known submodes (TO 1F-16CMAM-34-1-1 BMS, 4.2.5.1.4.1): where the seeker is switched on, measured from the steerpoint, and its field of view
export const HARM_SUB = {EOM: {on: 8, fov: 'narrow'}, PB: {on: 13, fov: 'wide'}, RUK: {on: 30, fov: 'wide'}};
// the HARM footprint (white outline on the HTS pod's HAD page), read from the manual's figure: range as a share of Rmax by bearing off the nose.
// EOM and RUK: a "heart" wide to both sides and closed behind the 90 deg lines; PB: a narrow wedge (about +-11 deg in the figure; the text says 5 deg to the target)
const HEART = [[0, 1], [30, 1], [43, .97], [55, .76], [67, .62], [77, .41], [90, .10]], HEART_MIN = .075, WEDGE = 11;
const off180 = a => { a = ((a % 360) + 540) % 360 - 180; return Math.abs(a); };
export function footprintFactor(sub, off) {
  const a = off180(off); if (sub === 'PB') return a <= WEDGE ? 1 : 0; if (a > 90) return 0;
  for (let i = 1; i < HEART.length; i++) if (a <= HEART[i][0]) { const [x0, y0] = HEART[i - 1], [x1, y1] = HEART[i]; return y0 + (y1 - y0) * (a - x0) / (x1 - x0); }
  return 0;
}
// outline around the launching aircraft: points {n, e}
export function harmFootprint(sub, rMax, heading, own) {
  const pt = (th, f) => project(own, norm(heading + th), f * rMax), P = [];
  if (sub === 'PB') { P.push(own); for (let t = -WEDGE; t <= WEDGE; t += 2.75) P.push(pt(t, 1)); P.push(own); return P; }
  for (let t = -90; t <= 90; t += 5) P.push(pt(t, footprintFactor('EOM', t)));
  P.push(pt(0, HEART_MIN)); P.push(P[0]); return P;
}
const HAS_FOV = 60;   // HAS: the seeker sees 120 deg in all (manual 4.2.5.1.6)

// HARM shot at an emitter: maximum range for the launch (BMS table), the range along the line to the emitter at the bearing off the nose chosen
// (footprint of the submode in POS / HAD; HAS has its seeker limit), the launch point, the margin to the emitter's own ring and the loft angle
export function harmShot(m, tab, o) {
  const v = {alt: 25000, speed: 450, tgtAlt: 0, heading: 360, shotPct: 90, ringNm: 0, mode: 'pos', sub: 'EOM', offNose: 0, ti: 'off', lotg: 0, eomg: 0, ...o}, emitter = o.emitter;
  const rMax = rmax(m, v.alt, v.speed * KT, v.tgtAlt); if (rMax == null) return {error: 'This missile has no range table.'};
  const has = v.mode === 'has', f = has ? (off180(v.offNose) <= HAS_FOV ? 1 : 0) : footprintFactor(v.sub, v.offNose), rTh = rMax * f, shot = rTh * v.shotPct / 100;
  const bearingTo = norm(v.heading + v.offNose), launch = project(emitter, bearingTo + 180, shot), ring = v.ringNm * NM;
  const vm = MEAN_MACH.harm * soundSpeed(v.alt / 2), loft = loftAngle(tab, v.alt, 0), sub = HARM_SUB[v.sub];
  return {v, rMax, rTh, factor: f, shot, launch, margin: ring ? shot - ring : null, outside: ring ? shot > ring : null, flight: shot / vm, loft, gimbal: HAS_FOV,
    seekerOk: f > 0, seekerOn: has ? null : {ft: sub.on * NM, nm: sub.on, fov: sub.fov}, line: [launch, emitter], ringFt: ring, foot: has ? null : harmFootprint(v.sub, rMax, v.heading, launch), has, bearingTo};
}

// ---------- MAR: minimum abort range (the BVR1 paper: turn-and-run, the missile beaten when it falls to the stall speed) ----------
// stall speed as true airspeed: 400 KIAS at the altitude (about 600 KTAS at 25 000 ft); a target faster than that is the speed to beat
export const stallTas = alt => 400 / Math.sqrt(Math.pow(Math.max(0.05, 1 - 6.8756e-6 * Math.min(alt, 36089)), 4.2559) * (alt > 36089 ? Math.exp(-(alt - 36089) / 20806) * 0.2971 / Math.pow(1 - 6.8756e-6 * 36089, 4.2559) : 1));
// speeds in knots, distances in nm. mor = maximum operational range, vt = the aborting aircraft's speed
// Case I, uniform deceleration: a = (vStall^2 - vMax^2) / (2 mor), the missile runs until it falls to the stall speed (600 or the target speed if higher)
export function marUniform({vMax, mor, vt, vStall = 600}) {
  const a = (vStall * vStall - vMax * vMax) / (2 * mor), vs = Math.max(vStall, vt), t = (vs - vMax) / a, d = vMax * t + 0.5 * a * t * t;
  return {mar: d - vt * t, missileDist: d, time: t * 3600, decel: a / 3600};
}
// Case II, deceleration growing with the square of the speed (the flight ends at the stall speed or at the maximum operational range, whichever comes first): a = aMax ((v - vStall) / (vMax - vStall))^2, in 1 s steps (aMax in kt/s)
export function marVariable({vMax, aMax, vt, mor = Infinity, vStall = 600}) {
  const vs = Math.max(vStall, vt); let v = vMax, d = 0, dt = 0, t = 0;
  while (v > vs && d < mor && t < 600) { d += v / 3600; dt += vt / 3600; v += -aMax * Math.pow((v - vStall) / (vMax - vStall), 2); t++; }
  return {mar: d - dt, missileDist: d, time: t};
}
// the paper's maximum speed (KTAS) and measured maximum deceleration (kt/s) for the missiles it covers, keyed by BMS file name
export const MAR_MISSILE = {'AIM-120C': {vMax: 2408, aMax: 49}, 'AIM-120B': {vMax: 2408, aMax: 68}, 'AIM-7M': {vMax: 2408, aMax: 27}, 'AIM-7': {vMax: 2408, aMax: 27}, 'AA-10C': {vMax: 2709, aMax: 77}, 'AA-12': {vMax: 2408, aMax: 77}, 'AIM-54C': {vMax: 3010, aMax: 55}};
export function marShot(name, rHeadFt, tgtSpeed, tgtAlt) {
  const mor = rHeadFt / NM, k = MAR_MISSILE[name], vMax = k ? k.vMax : 2408, vStall = stallTas(tgtAlt), u = marUniform({vMax, mor, vt: tgtSpeed, vStall});
  const w = k ? marVariable({vMax, aMax: k.aMax, vt: tgtSpeed, mor, vStall}) : null;
  return {mor, vMax, known: !!k, uniform: u.mar, variable: w ? w.mar : null, stall: Math.max(vStall, tgtSpeed), vStall};
}
export { dist, bearing };

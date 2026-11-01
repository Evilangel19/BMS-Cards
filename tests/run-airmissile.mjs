import { MISSILE_FALLBACK as F } from '../app/js/data/local/missilefallback.js';
import {
  bvrShot,
  harmShot,
  footprintFactor,
  HARM_SUB,
  soundSpeed,
  NM,
  marUniform,
  marVariable,
  marShot,
  stallTas,
} from '../app/js/core/airmissile.js';
import { dist, bearing } from '../app/js/core/popup.js';
let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const amr = F['AIM-120B'],
  harm = F['AGM-88'],
  near = (a, b, t) => Math.abs(a - b) <= t;
ck(
  'speed of sound: 1116 ft/s at sea level, 968 above the tropopause',
  near(soundSpeed(0), 1116.4, 1) && near(soundSpeed(40000), 968.1, 1)
);
const head = bvrShot(amr, { alt: 25000, speed: 450, tgtAlt: 25000, tgtSpeed: 450, aspect: 0 }),
  tail = bvrShot(amr, { alt: 25000, speed: 450, tgtAlt: 25000, tgtSpeed: 450, aspect: 180 }),
  beam = bvrShot(amr, { alt: 25000, speed: 450, tgtAlt: 25000, tgtSpeed: 450, aspect: 90 });
ck(
  'head-on is the table range; tail chase is much shorter, beam in between',
  near(head.rMax, head.rHead, 1) && tail.rMax < beam.rMax && beam.rMax < head.rMax && tail.rMax > 0
);
ck(
  'the tail range follows (Vm - Vt)/(Vm + Vt) of the head-on one',
  near(tail.rMax / head.rMax, (head.vm - 450 * 1.68781) / (head.vm + 450 * 1.68781), 1e-6)
);
ck(
  'a faster target shortens the tail shot and lengthens nothing head-on',
  bvrShot(amr, { aspect: 180, tgtSpeed: 600 }).rMax < tail.rMax &&
    near(bvrShot(amr, { aspect: 0, tgtSpeed: 600 }).rMax, bvrShot(amr, { aspect: 0, tgtSpeed: 450 }).rMax, 1)
);
ck(
  'higher launch altitude and speed give a longer shot',
  bvrShot(amr, { alt: 35000, tgtAlt: 35000 }).rMax > head.rMax &&
    bvrShot(amr, { speed: 650 }).rMax > bvrShot(amr, { speed: 300 }).rMax
);
ck(
  'time of flight grows with the shot range; a smaller share of Rmax is a shorter flight',
  bvrShot(amr, { shotPct: 50 }).flight < head.flight && head.flight > 20 && head.flight < 200
);
const dz = head.dlz;
ck(
  'DLZ: RAERO is the range at this aspect, RTR the tail-chase range; the poles follow the pitbull range of the data file',
  near(dz.raero, head.rMax, 1) &&
    near(dz.rtr, tail.rMax, 1) &&
    dz.rtr < dz.raero &&
    dz.pitbullNm === 8 &&
    dz.fPole < dz.aPole &&
    dz.aPole < head.shot &&
    dz.timeToActive > 0 &&
    dz.timeToActive < head.flight
);
ck(
  'DLZ: head-on the aircraft close, so F-pole is below the shot range by (own + target speed) x flight time; the pitbull range of a bomber is larger',
  near(head.shot - dz.fPole, (450 + 450) * 1.68781 * head.flight, 1) &&
    bvrShot(amr, { tgtSize: 'bomber' }).dlz.pitbullNm === 12 &&
    bvrShot(amr, { tgtSize: 'small' }).dlz.pitbullNm === 6
);
ck('the curve covers 0-180 degrees and falls', head.curve.length === 19 && head.curve[0][1] > head.curve[18][1]);
const E = { n: 0, e: 0 },
  h = harmShot(harm, F['AGM-88'].loft, {
    emitter: E,
    ringNm: 20,
    heading: 90,
    alt: 25000,
    speed: 450,
    shotPct: 90,
    tgtAlt: 0,
  });
ck(
  'HARM: shot range is the share of the table range and the launch point lies on the opposite heading',
  near(h.shot, h.rMax * 0.9, 1e-6) && near(dist(h.launch, E), h.shot, 1) && near(bearing(E, h.launch), 270, 0.01)
);
ck(
  'HARM margin to the SAM ring: outside when the shot is longer than the ring',
  h.outside === true &&
    near(h.margin, h.shot - 20 * NM, 1e-6) &&
    harmShot(harm, null, { emitter: E, ringNm: 200, alt: 25000 }).outside === false
);
ck(
  'HARM loft angle comes from the table (13 deg at 20 000 ft, 10 at 30 000)',
  near(harmShot(harm, harm.loft, { emitter: E, alt: 20000 }).loft, 13, 1e-9) &&
    near(harmShot(harm, harm.loft, { emitter: E, alt: 30000 }).loft, 10, 1e-9)
);
ck(
  'HAS needs the emitter inside the +-60 deg of the seeker (120 deg in all)',
  harmShot(harm, null, { emitter: E, mode: 'has', offNose: 120 }).seekerOk === false &&
    harmShot(harm, null, { emitter: E, mode: 'has', offNose: 40 }).seekerOk === true &&
    harmShot(harm, null, { emitter: E, mode: 'has', offNose: 61 }).seekerOk === false
);
ck(
  'seeker switch-on distances of the submodes: EOM 8, PB 13, RUK 30 nm',
  HARM_SUB.EOM.on === 8 &&
    HARM_SUB.PB.on === 13 &&
    HARM_SUB.RUK.on === 30 &&
    harmShot(harm, null, { emitter: E, sub: 'RUK' }).seekerOn.nm === 30
);
ck(
  'footprint (heart of EOM / RUK): full ahead, smaller to the sides, nothing behind the 90 degree lines',
  footprintFactor('EOM', 0) === 1 &&
    footprintFactor('EOM', 60) < 0.8 &&
    footprintFactor('EOM', 60) > 0.5 &&
    footprintFactor('EOM', 91) === 0 &&
    footprintFactor('EOM', -60) === footprintFactor('EOM', 60) &&
    footprintFactor('RUK', 60) === footprintFactor('EOM', 60)
);
ck(
  'PB footprint is a narrow wedge: nothing beyond about 11 degrees',
  footprintFactor('PB', 5) === 1 &&
    footprintFactor('PB', 20) === 0 &&
    harmShot(harm, null, { emitter: E, sub: 'PB', offNose: 30 }).seekerOk === false &&
    harmShot(harm, null, { emitter: E, sub: 'EOM', offNose: 30 }).seekerOk === true
);
const hs = harmShot(harm, null, { emitter: E, sub: 'EOM', heading: 90, alt: 25000, shotPct: 100 }),
  fp = hs.foot,
  far = Math.max(...fp.map(p => dist(p, hs.launch)));
ck(
  'footprint outline: around the launch point, reaching Rmax ahead, and the emitter (on the nose) is inside it',
  fp.length > 30 && near(far, hs.rMax, hs.rMax * 0.02) && near(dist(hs.launch, E), hs.shot, 1)
);
ck(
  'the shot range shrinks with the bearing off the nose (the heart) and the launch point follows the line to the emitter',
  harmShot(harm, null, { emitter: E, sub: 'EOM', offNose: 60 }).shot < hs.shot &&
    near(bearing(E, harmShot(harm, null, { emitter: E, heading: 90, offNose: 20 }).launch), 270 + 20, 0.01)
);
ck(
  'a missile without a range table gives an error, not NaN',
  bvrShot({ range: null }, {}).error && harmShot({ range: null }, null, { emitter: E }).error
);
// MAR: the numbers of the BVR1 paper (Tables 2 and 4); rounding and its own program differ a little, so a few nm of tolerance
const T = {
    'AIM-120C': [2408, 60, 49, [39, 35, 30, 23, 12], [36, 32, 26, 17, 8]],
    'AIM-120B': [2408, 40, 68, [27, 24, 21, 16, 8], [25, 22, 18, 13, 6]],
    'AIM-54': [3010, 100, 55, [73, 67, 61, 51, 38], [64, 57, 48, 35, 19]],
  },
  V = [500, 602, 722, 903, 1204];
for (const [k, [vm, mor, am, u, w]] of Object.entries(T)) {
  ck(
    k + ': uniform MAR within 4 nm of the paper at every target speed',
    V.every((vt, i) => near(marUniform({ vMax: vm, mor, vt }).mar, u[i], 4))
  );
  ck(
    k + ': variable MAR within 2 nm of the paper at every target speed',
    V.every((vt, i) => near(marVariable({ vMax: vm, aMax: am, vt, mor }).mar, w[i], 2))
  );
}
ck(
  'MAR falls as the aborting aircraft goes faster, and a missile with less deceleration has the longer MAR',
  marUniform({ vMax: 2408, mor: 40, vt: 900 }).mar < marUniform({ vMax: 2408, mor: 40, vt: 500 }).mar &&
    marUniform({ vMax: 3010, mor: 100, vt: 600 }).mar > marUniform({ vMax: 2408, mor: 40, vt: 600 }).mar
);
ck(
  'stall speed: about 600 KTAS at 25 000 ft (400 KIAS) and 400 at sea level',
  near(stallTas(25000), 600, 5) && near(stallTas(0), 400, 0.5)
);
const ms = marShot('AIM-120B', 40 * NM, 500, 25000),
  mo = marShot('AIM-9X-none', 40 * NM, 500, 25000);
ck(
  'marShot: known missile gives both cases, an unknown one only the uniform case',
  ms.known && ms.variable !== null && ms.uniform > 20 && !mo.known && mo.variable === null && mo.uniform > 0
);
import { timeline, CLASSES, STD } from '../app/js/core/bvrtimeline.js';
const tl = timeline('F-16C', { 'AIM-120B': amr }, STD),
  tg = timeline('Su-27', { 'AIM-120B': amr }, STD);
ck(
  'timeline: DR = MAR + closure x T notch and DOR = DR + closure x T recommit',
  near(tl.dr, tl.mar + (tl.vc * STD.tNotch) / 3600, 1e-9) && near(tl.dor, tl.dr + (tl.vc * STD.tRecommit) / 3600, 1e-9)
);
ck(
  'timeline: a class whose missile is in the data uses the model, otherwise the Threat Guide MAR',
  tl.src.startsWith('model') && tg.src === 'Threat Guide' && tg.mar === 15
);
ck(
  'timeline: the model MAR for the AIM-120B at 25 000 ft / Mach 0.9 is close to the guide value for the F-16 (17)',
  near(tl.mar, 17, 3) && CLASSES.length > 10
);
ck(
  'timeline: the order is MTR > TR > DOR > DR > MAR > STERN WEZ for every class',
  CLASSES.every(c => {
    const r = timeline(c.n, { 'AIM-120B': amr }, STD);
    return r.mtr > r.tr && r.tr > r.dor && r.dor > r.dr && r.dr > r.mar && r.mar > r.stern && r.stern > 0 && r.fr > 0;
  })
);
const sel = timeline('F-16CM', { 'AIM-120B': amr, 'AIM-7M': amr }, STD, 'AIM-120B'),
  own = timeline('F-16CM', { 'AIM-120B': amr }, STD),
  ru = timeline('Mig-29A', { 'AIM-120B': amr }, STD, 'AIM-120B');
ck(
  'timeline: the selected missile replaces the best one of a class that carries it, and leaves the others alone',
  sel.msl === 'AIM-120B' && sel.picked && own.msl === null && ru.src === 'Threat Guide' && !ru.picked
);
console.log(bad ? 'airmissile: ' + bad + ' FAILED' : 'airmissile: ' + n + '/' + n + ' checks passed');
process.exit(bad ? 1 : 0);

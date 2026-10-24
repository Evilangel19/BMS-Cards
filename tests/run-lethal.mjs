// Lethality, minimum acceptable release altitude and safe escape (core/lethal.js): the envelope classes, the bomb names, the three MRAs, the escape check.
import { computePopup } from '../app/js/core/popup.js';
import { computeHadb, computeToss } from '../app/js/core/strike.js';
import { analyse, envelope, bombClass, pickBomb, maneuvers, recoveryMra, escapePath } from '../app/js/core/lethal.js';
let n = 0, bad = 0;
const ck = (name, ok) => { n++; if (!ok) { bad++; console.log('FAIL', name); } };
const near = (a, b, t = 1) => Math.abs(a - b) <= t;
const T = {n: 0, e: 0}, R = {n: -30000, e: 0};
// envelope: the two graph classes exactly, 1 000 lb interpolated and flagged
const e5 = envelope(500), e10 = envelope(1000), e20 = envelope(2000);
ck('500 lb: 3 600 ft out, 2 450 ft up, 25 s', e5.out === 3600 && e5.up === 2450 && e5.t === 25 && !e5.approx);
ck('2000 lb: 3 700 ft out, 2 500 ft up, 27 s', e20.out === 3700 && e20.up === 2500 && e20.t === 27 && !e20.approx);
ck('1000 lb lies between the two and is approximate', e10.out > 3600 && e10.out < 3700 && e10.t > 25 && e10.t < 27 && e10.approx);
ck('weights outside the classes stay on the nearest class', envelope(250).out === 3600 && envelope(4000).out === 3700 && envelope(0) === null);
// bomb names from the loadout
ck('MK-82 / GBU-12 / GBU-38 are 500 lb', [bombClass('Mk-82'), bombClass('GBU-12'), bombClass('GBU-38')].every(c => c && c.lb === 500));
ck('the BMS names with suffixes are recognised (GBU-12B/B /HE, Mk-82 AIR, GBU-31(v)1/B /HE, GBU-10C)', bombClass('GBU-12B/B /HE').lb === 500 && bombClass('Mk-82 AIR').lb === 500 && bombClass('GBU-31(v)1/B /HE').lb === 2000 && bombClass('GBU-10C/B').lb === 2000 && bombClass('GBU-100') === null);
ck('MK-83 and GBU-32 are 1000 lb, MK-84 and GBU-31 2000 lb', bombClass('Mk-83').lb === 1000 && bombClass('GBU-32').lb === 1000 && bombClass('Mk-84 AIR').lb === 2000 && bombClass('GBU-31(V)1').lb === 2000);
ck('cluster, incendiary, armour-piercing, missiles and unknown weapons are not covered', ['CBU-87', 'CBU-105', 'Mk-77', 'BLU-109', 'GBU-24', 'AGM-65', 'JSOW', 'Mk-20 Rockeye', 'Fuel tank'].every(w => bombClass(w) === null));
ck('a mixed loadout picks the heaviest covered bomb and lists the others as skipped', (() => { const p = pickBomb([{name: 'Mk-82'}, {name: 'Mk-84'}, {name: 'AIM-9M'}]); return p.lb === 2000 && p.name === 'Mk-84' && p.skipped.join() === 'AIM-9M'; })() && pickBomb([{name: 'CBU-87'}]) === null);
ck('manoeuvres by dive angle: turning to 20, level turning to 25, CLM to 60, none above', maneuvers(15).length === 3 && maneuvers(22).length === 2 && maneuvers(40).length === 1 && maneuvers(61).length === 0);
// pop-up: the three MRAs and the escape check
const r = computePopup(T, R, {releaseAltitude: 2000, diveAngle: 15, ad1: 4, ad2: 6});
ck('recovery MRA equals the engine MRA of the pop-up', near(recoveryMra(r.v), r.v.mra, 1));
const a = analyse(r, e5, [4, 6]);
ck('the MRA is the highest of the three', a.mra.value === Math.max(a.mra.frag, a.mra.recovery, a.mra.arming) && a.mra.frag > 0);
ck('2000 ft is below the MRA of a 15 deg MK-82 drop: the aircraft is inside the zone at the first impact and the release altitude is red', a.below && a.viol && a.viol.bomb === 1 && a.flags.releaseAltitude);
const hi = analyse(computePopup(T, R, {releaseAltitude: a.mra.value + 200, diveAngle: 15, ad1: 1, ad2: 2}), e5, [1, 2]);
ck('above the MRA the path is clear and nothing is red', !hi.below && hi.viol === null && Object.keys(hi.flags).length === 0);
ck('the MRA does not depend on the altitude chosen (a floor, the same value at 2 000 and 6 000 ft)', analyse(computePopup(T, R, {releaseAltitude: 6000, diveAngle: 15, ad1: 1, ad2: 2}), e5, [1, 2]).mra.value === analyse(computePopup(T, R, {releaseAltitude: 2000, diveAngle: 15, ad1: 1, ad2: 2}), e5, [1, 2]).mra.value);
ck('a longer arming delay than the fall time turns the AD slider red', analyse(r, e5, [4, 9]).flags.ad1 && !analyse(r, e5, [1, 2]).flags.ad0);
ck('a steeper dive costs more altitude in the recovery', recoveryMra(computePopup(T, R, {diveAngle: 40, releaseAltitude: 5000}).v) > recoveryMra(computePopup(T, R, {diveAngle: 20, releaseAltitude: 5000}).v));
ck('a dive release below the recovery altitude turns dive angle, speed and altitude red', (() => { const q = analyse(computePopup(T, R, {releaseAltitude: 300, diveAngle: 30}), e5, [0, 0]); return q.flags.releaseAltitude && q.flags.diveAngle && q.flags.releaseSpeed; })());
ck('without an envelope (bomb not covered) only the recovery and arming limits remain', (() => { const q = analyse(r, null, [4, 6]); return q.mra.frag === null && q.viol === undefined && q.mra.value === Math.max(q.mra.recovery, q.mra.arming); })());
ck('a heavier bomb needs at least as much altitude as the 500 lb one', analyse(r, e20, [4, 6]).mra.frag >= a.mra.frag);
ck('a stick (4 bombs, 100 ft) is checked against the last impact too: its MRA is not lower than the single bomb', analyse(computePopup(T, R, {releaseAltitude: 3000, diveAngle: 30, ripplePulses: 4, stickSpacing: 100}), e5, [1]).mra.frag >= analyse(computePopup(T, R, {releaseAltitude: 3000, diveAngle: 30}), e5, [1]).mra.frag - 100);
ck('the lethal window runs from the first impact to the lethality time after the last', (() => { const q = analyse(computePopup(T, R, {releaseAltitude: 5000, diveAngle: 30, ripplePulses: 4, stickSpacing: 100}), e5, [1]); return q.window.from > 0 && q.window.to > q.window.from + 25; })());
const p = escapePath({alt: 3000, speedKt: 500, diveDeg: 20, stickDur: 0, x0: -8000}, 12);
ck('the escape path dives for 2 s, then pulls through level and climbs to 30 deg', p[0].g < 0 && near(p[10].g, p[0].g, 1e-9) && p[p.length - 1].g > .5 && near(p[p.length - 1].g, 30 * Math.PI / 180, .01));
// HADB and toss
const h = analyse(computeHadb(T, R, {}), e5, [4, 6]);
ck('HADB: a high release has its own MRA, well under the release altitude', h.mra.value > 0 && h.mra.value < 12000 && !h.below);
const t = analyse(computeToss(T, R, {}), e5, [4, 6]);
ck('TOSS: the aircraft is far outside the radius; the toss has no MRA', t.far.ok && t.mra.value === null);
console.log(`${n - bad}/${n} lethal checks passed`);
process.exit(bad ? 1 : 0);

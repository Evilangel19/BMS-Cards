// Aircraft performance: the txtpb reader, the BMS tables of the built-in aircraft and the maths of airperf.js (sanity of the results, not a copy of the simulator).
import fs from 'fs'; import path from 'path';
import { parseTxtpb, parseAcPerf } from '../app/js/bmsdata/acperf.js';
import { AC_FALLBACK } from '../app/js/data/local/acfallback.js';
import * as P from '../app/js/core/airperf.js';
let n = 0, f = 0; const ok = (c, m) => { n++; if (!c) { f++; console.log('FAIL', m); } else console.log('ok  ', m); };

const o = parseTxtpb('a: 1\nb { c: "x" # note\n d: [1, 2.5, -3]\n e: FOO }\nr { v: 1 }\nr { v: 2 }\nflag: true');
ok(o.a === 1 && o.b.c === 'x' && o.b.d.join() == '1,2.5,-3' && o.b.e === 'FOO' && o.r.length === 2 && o.r[1].v === 2 && o.flag === true, 'txtpb reader: values, lists, enums, repeated blocks');

const ac = AC_FALLBACK['F-16CM-50'];
ok(ac && ac.af.area === 300 && ac.af.emptyLb === 19900 && ac.cl.z.length === ac.cl.x.length && ac.thrust.ab.z[0].length === ac.thrust.ab.y.length, 'F-16CM-50 tables are complete');

// the whole Acdata folder, when it is there (BMS_ACDATA or tests/fixtures/acdata)
const dir = process.env.BMS_ACDATA || path.join(process.env.BMS_DATA || '', 'Acdata');
if (dir && fs.existsSync(dir)) { const fl = fs.readdirSync(dir).filter(x => x.endsWith('.txtpb')); let bad = fl.filter(x => !parseAcPerf(fs.readFileSync(path.join(dir, x), 'utf8'), x)); ok(fl.length > 100 && !bad.length, 'every Acdata file is read (' + fl.length + ' files)' + (bad.length ? ' bad: ' + bad.join(', ') : '')); }
else console.log('note: no Acdata folder found, the full-folder check is skipped');

const W = 28000, base = {W, alt: 15000};
// atmosphere
const a0 = P.atmos(0); ok(Math.abs(a0.rho - .0023769) < 2e-5 && Math.abs(a0.a - 661.5) < 1, 'ISA sea level: density and speed of sound');
ok(Math.abs(P.cas(.9, P.atmos(0)) - .9 * 661.5) < 12, 'CAS at sea level is about TAS');
// turn
const tc = P.turnCurve(ac, base);
ok(tc.corner && Math.abs(tc.corner.cas - ac.af.cornerKt) < 50, 'corner speed (' + (tc.corner && tc.corner.cas.toFixed(0)) + ' KCAS) is near the BMS value ' + ac.af.cornerKt);
const r8 = tc.rows.find(r => Math.abs(r.M - .8) < .011);
ok(r8.gI > r8.gA && r8.gA > r8.gM && r8.gM > 1, 'instantaneous > sustained AB > sustained MIL at Mach .8 (' + [r8.gI, r8.gA, r8.gM].map(v => v.toFixed(1)).join(' / ') + ' g)');
ok(tc.rows.every(r => r.gI <= ac.af.maxG + 1e-6), 'never more than the structural g');
const heavy = P.turnCurve(ac, {...base, W: 36000, di: 80}).rows.find(r => Math.abs(r.M - .8) < .011);
ok(heavy.gA < r8.gA && heavy.gM < r8.gM, 'more weight and drag, less sustained g');
// energy
const p1 = P.point(ac, {...base, M: .9}); ok(p1.psAb > p1.psMil && p1.psMil > 0, 'Ps: afterburner > military > 0 at Mach .9, 15 000 ft (' + p1.psMil.toFixed(0) + ' / ' + p1.psAb.toFixed(0) + ' ft/s)');
const hi = P.point(ac, {W, alt: 55000, M: 1.2}); ok(hi.stall || hi.psAb < p1.psAb, 'Ps falls with altitude');
// cruise
const cc = P.cruiseCurve(ac, {W: 25000, alt: 30000});
ok(cc.range && cc.range.M > .6 && cc.range.M < .95 && cc.range.ff > 1500 && cc.range.ff < 4500, 'best range at 30 000 ft: Mach ' + cc.range.M.toFixed(2) + ', ' + cc.range.ff.toFixed(0) + ' lb/h');
ok(cc.endur.ff < cc.range.ff && cc.endur.M < cc.range.M, 'best endurance is slower and burns less than best range');
const leg = P.cruiseLeg(ac, {W: 25000, alt: 30000, M: .8, fuel: 4000}); ok(leg.nm > 450 && leg.nm < 900 && Math.abs(leg.fuel - 4000) < 5, 'cruise leg with 4 000 lb: ' + leg.nm.toFixed(0) + ' nm');
const lo = P.cruiseCurve(ac, {W: 25000, alt: 5000}).range, hi2 = P.cruiseCurve(ac, {W: 25000, alt: 35000}).range; ok(hi2.sr > lo.sr, 'range per pound is better at altitude');
// field
const t = P.takeoff(ac, {W, power: 'ab'}); ok(t.roll > 1000 && t.roll < 3500 && t.vlof > 140 && t.vlof < 200, 'take-off, afterburner, 28 000 lb: ' + t.roll.toFixed(0) + ' ft, lift-off ' + t.vlof.toFixed(0) + ' kt');
{ const t37 = P.takeoff(ac, {W: 37265, elev: 22, di: 129, power: 'ab'}); ok(t37.vr > 155 && t37.vr < 168, 'rotation at 37 265 lb is about 161 kt (WDP; seen in flight 160-170): ' + t37.vr.toFixed(0)); const t48 = P.takeoff(ac, {W: 48000, elev: 22, di: 129, power: 'ab'}); ok(t48.vr > t37.vr + 12 && t48.vr < 195, 'heavier: faster rotation (' + t48.vr.toFixed(0) + ' kt at 48 000 lb)'); }
const th = P.takeoff(ac, {W: W + 4000, power: 'ab', elev: 5000, dIsa: 20}); ok(th.roll > t.roll * 1.3, 'heavy, hot and high: a longer roll');
ok(P.takeoff(ac, {W, power: 'ab', hw: 20}).roll < t.roll, 'headwind shortens the roll');
ok(P.takeoff(ac, {W, power: 'mil'}).roll > t.roll, 'military power: longer than afterburner');
const l = P.landing(ac, {W: 22000}); ok(l.vapp > 125 && l.vapp < 175 && l.rollBrakes > 1500 && l.rollBrakes < 4000 && l.rollNoBrakes > l.rollBrakes, 'landing: approach ' + l.vapp.toFixed(0) + ' kt, roll ' + l.rollBrakes.toFixed(0) + ' ft');

// ---- fuel along the flight plan, climb schedule, refusal speed
import { fuelPlan, climbAltitude } from '../app/js/core/fuelplan.js';
const H = 3600000, wp = (x, y, z, arr, dep, act) => ({x, y, z, arr, dep: dep || arr, act});   // km, km, ft/10, ms
const plan = [wp(0, 0, 0, 0, 0, 1), wp(0, 80, 2200, 10 * 60000, 0, 0), wp(0, 160, 2200, 20 * 60000, 30 * 60000, 17), wp(0, 80, 2200, 40 * 60000, 0, 0), wp(0, 0, 0, 55 * 60000, 0, 7)];
const fp = fuelPlan(ac, plan, {stores: 2500, di: 30, reserve: 1500, jokerMargin: 500});
ok(fp.rows.length === 5 && fp.rows[4].min === 1500, 'fuel plan: the landing steerpoint holds the reserve (' + fp.rows[4].min + ' lb)');
ok(fp.rows[0].min > fp.rows[1].min && fp.rows[1].min > fp.rows[2].min && fp.rows[2].min > fp.rows[3].min && fp.rows[3].min > fp.rows[4].min, 'Min.Fuel falls steerpoint after steerpoint: ' + fp.rows.map(r => r.min).join(' > '));
ok(fp.toFuel === fp.rows[0].min && fp.toFuel > 3000 && fp.toFuel < 12000, 'TO Fuel is the first Min.Fuel (' + fp.toFuel + ' lb)');
ok(fp.bingoIdx === 3 && fp.bingo === fp.rows[3].min, 'bingo: the Min.Fuel of the steerpoint after the last activity');
ok(fp.joker === Math.ceil((fp.bingo + 500) / 100) * 100, 'joker = bingo + margin');
ok(fp.rows.every(r => r.min % 100 === 0), 'values rounded up to 100 lb');
const fp2 = fuelPlan(ac, plan, {stores: 2500, di: 30, reserve: 3000}); ok(fp2.toFuel > fp.toFuel + 1200, 'a bigger reserve needs more fuel at take-off');
const fp3 = fuelPlan(ac, plan, {stores: 2500, di: 30, reserve: 1500, loaded: 5000}); ok(fp3.short === Math.max(0, fp3.toFuel - 5000), 'short of fuel: the difference is reported');
const tk = plan.map(p => ({...p})); tk[1] = {...tk[1], act: 4}; const fp4 = fuelPlan(ac, tk, {stores: 2500, di: 30, reserve: 1500}); ok(fp4.rows[1].min === 1000 && fp4.toFuel < fp.toFuel, 'tanker: 1000 lb on arrival, and the take-off fuel needed drops');
const two = [...plan, wp(0, 40, 1000, 70 * 60000, 0, 4), wp(0, 0, 0, 80 * 60000, 0, 7)]; const fp5 = fuelPlan(ac, two, {stores: 2500, di: 30, reserve: 1500}); ok(fp5.rows[4].min === 1500 && fp5.rows[5].min === null, 'the plan ends at the first landing');
ok(climbAltitude(plan) === 22000 && climbAltitude([wp(0, 0, 0, 0, 0, 1), wp(0, 50, 50, 1e6, 0, 0)]) === 15000, 'climb altitude: highest steerpoint before the activity, at least 15 000 ft');
const cs = P.climbSchedule(ac, {W: 33000, di: 20, to: 25000}); ok(cs && cs.cas >= 300 && cs.cas <= 450 && cs.mach >= .7 && cs.mach <= .9 && cs.minutes > 1 && cs.minutes < 6 && cs.fuel > 150 && cs.fuel < 900, 'climb schedule to 25 000 ft: ' + cs.cas + ' / .' + Math.round(cs.mach * 100) + ', ' + cs.minutes.toFixed(1) + ' min, ' + cs.fuel.toFixed(0) + ' lb');
ok(P.milRpm(AC_FALLBACK['F-16CM-52']) === 97 && P.milRpm(ac) === 108, 'military power rpm from the engine charts (F100-229: 97 %, F110-129: 108 %)');
const r9 = P.refusal(ac, {W: 33000, rwy: 9000, di: 20, power: 'ab'}), r5 = P.refusal(ac, {W: 33000, rwy: 5000, di: 20, power: 'ab'}), r1 = P.refusal(ac, {W: 33000, rwy: 2500, di: 20, power: 'ab'});
ok(r9 > r5 && r5 > r1 && r9 <= 225 && P.refusal(ac, {W: 33000, di: 20}) === null, 'refusal speed grows with the runway (' + [r1, r5, r9].map(v => v.toFixed(0)).join(' / ') + ' kt) and needs its length');
const slow = [wp(0, 0, 0, 0, 0, 1), wp(0, 28, 2100, 10 * 60000, 0, 0), wp(0, 56, 2100, 3.5 * H, 3.5 * H + 20 * 60000, 17), wp(0, 0, 0, 3.5 * H + 50 * 60000, 0, 7)];
const fp6 = fuelPlan(ac, slow, {stores: 2500, di: 30, reserve: 1500}); ok(fp6.toFuel < 14000 && fp6.rows[1].min <= fp6.toFuel, 'a leg with hours of slack in the plan is not flown at 5 kt (to-fuel ' + fp6.toFuel + ' lb)');
// wind aloft: the headwind of each leg turns the planned ground speed into an airspeed
{ let asked = []; const wnd = (x, y, t, a) => { asked.push(a); return {spd: 60, hdg: 0, alt: Math.round(a / 1000) * 1000}; };   // 60 kt from the north
  const fw = fuelPlan(ac, plan, {stores: 2500, di: 30, reserve: 1500, jokerMargin: 500, wind: wnd});
  ok(Math.abs(fw.rows[1].hw - 60) < 1e-6 && Math.abs(fw.rows[3].hw + 60) < 1e-6 && fw.rows[0].hw === 0, 'wind: headwind going north (+60), tailwind coming back (-60), nothing on the first point');
  ok(fw.rows[1].wind && fw.rows[1].wind.spd === 60, 'wind: the wind used by the leg is reported');
  ok(asked[0] === (0 + 22000) / 2, 'wind: the leg asks for the wind at its mean altitude (' + asked[0] + ' ft)');
  ok(fw.rows[1].mach > fp.rows[1].mach && fw.rows[3].mach < fp.rows[3].mach, 'wind: the same ground speed is a higher Mach into the wind and a lower one with the tail wind');
  const nw = fuelPlan(ac, plan, {stores: 2500, di: 30, reserve: 1500, jokerMargin: 500, wind: () => null}); ok(nw.toFuel === fp.toFuel, 'wind: no wind data leaves the plan as it was'); }
console.log(`airperf: ${n - f}/${n} checks passed`); process.exit(f ? 1 : 0);

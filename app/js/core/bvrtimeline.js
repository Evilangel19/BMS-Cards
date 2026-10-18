// BVR timeline numbers for the datacard and the scheme (Flow charts of the BVR timeline: MTR > TR > DOR > DR > MAR > STERN WEZ).
// MAR: the BVR1 paper model (airmissile.marShot) with the enemy's missile at standard conditions; when the missile is not in the data files, the Threat Guide's MAR is used.
// DR  = MAR + Vc x Tnotch            (formule_bvr.docx)
// DOR = DR + Vc x Trecommit          (formule_bvr.docx: "5-8 nm" on top of DR)
// STERN WEZ = the enemy missile's range against a target running away (tail-chase range of the model), kept below the MAR
// TR, MTR and FR are arbitrary values: they depend on the kind of enemy (its missile class), see CAT.
import { bvrShot, marShot, soundSpeed } from './airmissile.js';

// enemy classes: the Threat Guide's MAR (nm, fixed) and the best radar missile it carries (BMS file name)
export const CLASSES = [
  {n: 'Mig-21bis', g: 8, m: 'AA-2B', ms: ['AA-2B']}, {n: 'Mig-23ML', g: 12, m: 'AA-7A', ms: ['AA-7A']}, {n: 'Mig-25', g: 12, m: 'AA-6A', ms: ['AA-6A']},
  {n: 'Mig-29A', g: 12, m: 'AA-10A', ms: ['AA-10A']}, {n: 'Mig-29S', g: 15, m: 'AA-12', ms: ['AA-12', 'AA-10C', 'AA-10A']}, {n: 'Mig-31', g: 20, m: 'AA-9', ms: ['AA-9', 'AA-12']},
  {n: 'Su-27', g: 15, m: 'AA-10C', ms: ['AA-10C', 'AA-10A']}, {n: 'Su-30MKK', g: 15, m: 'AA-12', ms: ['AA-12', 'AA-10C']}, {n: 'Su-35', g: 15, m: 'AA-12', ms: ['AA-12', 'AA-10C']}, {n: 'J-11', g: 15, m: 'AA-10C', ms: ['AA-10C']},
  {n: 'J-16', g: 17, m: null, ms: []}, {n: 'J-20', g: 17, m: null, ms: []},
  {n: 'F-16C', g: 17, m: 'AIM-120B', ms: ['AIM-120B', 'AIM-7M']}, {n: 'F-16CM', g: 17, m: 'AIM-120C', ms: ['AIM-120C', 'AIM-120B', 'AIM-7M']}, {n: 'F/A-18C', g: 17, m: 'AIM-120C', ms: ['AIM-120C', 'AIM-120B', 'AIM-7M']},
  {n: 'F-15C', g: 20, m: 'AIM-120C', ms: ['AIM-120C', 'AIM-120B', 'AIM-7M']}, {n: 'F-14D', g: 40, m: 'AIM-54C', ms: ['AIM-54C', 'AIM-7M']}, {n: 'Rafale C', g: 56, m: null, ms: []}, {n: 'Eurofighter', g: 56, m: null, ms: []}
];
// ms: the radar missiles the class can carry; the missile chosen on the page (sel) replaces the class's own best one when the class carries it
export const STD = {alt: 25000, mach: 0.9, tNotch: 15, tRecommit: 20};
// arbitrary margins by the kind of enemy (the enemy MAR tells it): TR = DOR + tr, MTR = TR + mtr, FR as given (nm)
export const CAT = [{max: 10, name: 'short range', tr: 4, mtr: 8, fr: 10}, {max: 20, name: 'medium range', tr: 5, mtr: 12, fr: 15}, {max: 1e9, name: 'long range', tr: 8, mtr: 20, fr: 25}];

// DB: {missile name: parsed data}
export function timeline(cls, DB, std = STD, sel = null) {
  const c = CLASSES.find(x => x.n === cls); if (!c) return null;
  const kt = std.mach * soundSpeed(std.alt) / 1.68781, vc = 2 * kt, out = {cls: c.n, vc, tas: kt, guide: c.g};
  const mn = sel && c.ms.includes(sel) && DB[sel] ? sel : c.m, m = mn && DB[mn];
  let rh = m && m.range ? bvrShot(m, {alt: std.alt, speed: kt, tgtAlt: std.alt, tgtSpeed: kt}).rHead : null;
  if (rh != null) { const s = marShot(mn, rh, kt, std.alt); out.mar = Math.max(0, s.variable !== null ? s.variable : s.uniform); out.src = 'model ' + mn; out.msl = mn; out.picked = mn === sel; }
  else { out.mar = c.g; out.src = 'Threat Guide'; out.msl = null; }
  out.dr = out.mar + vc * std.tNotch / 3600;
  out.dor = out.dr + vc * std.tRecommit / 3600;
  const k = CAT.find(x => out.mar <= x.max); out.cat = k.name;
  out.tr = out.dor + k.tr; out.mtr = out.tr + k.mtr; out.fr = k.fr;
  const st = m && m.range ? bvrShot(m, {alt: std.alt, speed: kt, tgtAlt: std.alt, tgtSpeed: kt}).dlz.rtr / 6076.12 : null;
  out.stern = Math.min(st == null ? out.mar * 0.5 : st, out.mar * 0.9);
  return out;
}

// BVR timeline numbers for the datacard and the scheme (Flow charts of the BVR timeline: MTR > TR > DOR > DR > MAR > STERN WEZ).
// MAR: the model of "Beyond Visual Range Chronicles - Minimum Abort Range" v. 3 by Adrian Chitan, cases I and II (airmissile.marShot) with the enemy's missile launched from the enemy's altitude and speed at the target (you); when the missile is not in the data files, the Threat Guide's MAR is used.
// Conditions: yours (std) and, if given, the enemy's (en: altitude and Mach); without them the enemy flies like you. Head-on: closure Vc = your speed + the enemy's.
// DR  = MAR + Vc x Tnotch
// DOR = DR + Vc x Trecommit
// STERN WEZ = the enemy missile's range against a target running away (tail-chase range of the model), kept below the MAR
// TR, MTR and FR are arbitrary values: they depend on the kind of enemy (its missile class), see CAT.
import { bvrShot, marShot, soundSpeed } from './airmissile.js';

// the name the pilots use for a missile file in the menus (the game calls the AIM-7 file "AIM-7M Sparrow"); the data keep the file name
const MSL_NAME = { 'AIM-7': 'AIM-7M', MICA_EM: 'MICA EM' };
export const mslName = n => MSL_NAME[n] || n;
// knots (true airspeed) of a Mach number at an altitude, and the other way round
export const toKt = (mach, alt) => (mach * soundSpeed(alt)) / 1.68781;
export const toMach = (kt, alt) => (kt * 1.68781) / soundSpeed(alt);

// enemy classes (the Threat Guide): its fixed MAR (nm), the best radar missile it carries (BMS file name) and all the radar missiles it carries
export const CLASSES = [
  { n: 'Mig-21bis', g: 8, m: 'AA-2B', ms: ['AA-2B'] },
  { n: 'Mig-23ML', g: 12, m: 'AA-7A', ms: ['AA-7A', 'AA-2B'] },
  { n: 'Mig-25', g: 12, m: 'AA-6A', ms: ['AA-6A', 'AA-7A'] },
  { n: 'Mig-29A', g: 12, m: 'AA-10A', ms: ['AA-10A'] },
  { n: 'Mig-29S', g: 15, m: 'AA-12', ms: ['AA-12', 'AA-10A'] },
  { n: 'Mig-31', g: 20, m: 'AA-9', ms: ['AA-9', 'AA-10C'] },
  { n: 'Su-27', g: 15, m: 'AA-10C', ms: ['AA-10C', 'AA-12', 'AA-10A'] },
  { n: 'Su-30MKK', g: 15, m: 'AA-12', ms: ['AA-12', 'AA-10C', 'AA-10A'] },
  { n: 'Su-35', g: 15, m: 'AA-12', ms: ['AA-12', 'AA-10C', 'AA-10A'] },
  { n: 'Su-39', g: 15, m: 'AA-12', ms: ['AA-12', 'AA-2B'] },
  { n: 'J-11', g: 15, m: 'AA-10C', ms: ['AA-10C', 'AA-12', 'AA-10A'] },
  { n: 'J-15', g: 17, m: 'PL-12', ms: ['PL-12'] },
  { n: 'J-16', g: 17, m: 'PL-15', ms: ['PL-15', 'PL-12', 'PL-17'] },
  { n: 'J-20', g: 17, m: 'PL-15', ms: ['PL-15', 'PL-12'] },
  { n: 'F-16C', g: 17, m: 'AIM-120B', ms: ['AIM-120B', 'AIM-7'] },
  { n: 'F-16CM', g: 17, m: 'AIM-120C', ms: ['AIM-120C', 'AIM-120B'] },
  { n: 'F/A-18C', g: 17, m: 'AIM-120C', ms: ['AIM-120C', 'AIM-120B', 'AIM-7'] },
  { n: 'F-15C', g: 20, m: 'AIM-120C', ms: ['AIM-120C', 'AIM-120B', 'AIM-7'] },
  { n: 'F-14D', g: 40, m: 'AIM-54C', ms: ['AIM-54C', 'AIM-7'] },
  { n: 'Rafale C', g: 56, m: 'Meteor', ms: ['Meteor', 'MICA_EM'] },
  { n: 'Eurofighter', g: 56, m: 'Meteor', ms: ['Meteor', 'AIM-120C'] },
];
// ms: the radar missiles the class can carry; the missile chosen for a row of the page (sel) replaces the class's own best one when the class carries it
export const STD = { alt: 25000, mach: 0.9, tNotch: 15, tRecommit: 20 };
// arbitrary margins by the kind of enemy (the enemy MAR tells it): TR = DOR + tr, MTR = TR + mtr, FR as given (nm)
export const CAT = [
  { max: 10, name: 'short range', tr: 4, mtr: 8, fr: 10 },
  { max: 20, name: 'medium range', tr: 5, mtr: 12, fr: 15 },
  { max: 1e9, name: 'long range', tr: 8, mtr: 20, fr: 25 },
];

// DB: {missile name: parsed data}
export function timeline(cls, DB, std = STD, sel = null, en = null) {
  const c = CLASSES.find(x => x.n === cls);
  if (!c) return null;
  const e = en || std,
    kt = toKt(std.mach, std.alt),
    ke = toKt(e.mach, e.alt),
    vc = kt + ke,
    out = {
      cls: c.n,
      vc,
      tas: kt,
      guide: c.g,
      me: { alt: std.alt, mach: std.mach, kt },
      en: { alt: e.alt, mach: e.mach, kt: ke },
    };
  const mn = sel && c.ms.includes(sel) && DB[sel] ? sel : c.m,
    m = mn && DB[mn],
    b = m && m.range ? bvrShot(m, { alt: e.alt, speed: ke, tgtAlt: std.alt, tgtSpeed: kt }) : null,
    rh = b ? b.rHead : null;
  if (rh != null) {
    const s = marShot(mn, rh, kt, std.alt);
    out.mar = Math.max(0, s.variable !== null ? s.variable : s.uniform);
    out.src = 'model ' + mslName(mn);
    out.msl = mn;
    out.picked = mn === sel;
  } else {
    out.mar = c.g;
    out.src = 'Threat Guide';
    out.msl = null;
  }
  out.dr = out.mar + (vc * std.tNotch) / 3600;
  out.dor = out.dr + (vc * std.tRecommit) / 3600;
  const k = CAT.find(x => out.mar <= x.max);
  out.cat = k.name;
  out.tr = out.dor + k.tr;
  out.mtr = out.tr + k.mtr;
  out.fr = k.fr;
  const st = b && b.dlz ? b.dlz.rtr / 6076.12 : null;
  out.stern = Math.min(st == null ? out.mar * 0.5 : st, out.mar * 0.9);
  return out;
}

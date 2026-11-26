// @ts-check
// The AGM-65 Maverick in A-G > Pop-up and HADB (core/weaponspage.js): the launch on the dive line at a slant range, the limits of the Dash-34
// (TO 1F-16CMAM-34-1-1 BMS 4.2.4.1, Change 4.38.2), two launches on one pass, the AUTO PWR steerpoint and the boresight point. Pure maths, no DOM.
// Units: ft, kt, s, NM where named. The ranges of BMS: its Misdata (the caller gives Rmax at the launch altitude and speed); the rest are estimates.

export const FT_NM = 6076.12;
export const MAV_RMIN_NM = 1, // the nearest launch (an estimate: the Misdata of BMS gives 0)
  MAV_KT = 850, // the mean speed of the missile to the target (an estimate, for the time of flight)
  CARRY_KIAS = 600, // 4.2.4.1.1: the most with the AGM-65 carried
  CARRY_MACH = 0.95,
  LAUNCH_MACH = 1.2, // the most at the launch
  MAX_DIVE = 60,
  MAX_BANK = 30, // at the lock-on and the handoff
  G_MIN = 0.5, // the load factor at the launch
  G_MAX = 3,
  SPIN_MIN = 3, // the gyros: 3 minutes before the uncage
  PWR_MIN = 60, // the power on a mission
  VIDEO_MIN = 30, // the video on a mission
  AUTO_PWR_NM = 2, // CNTL: AUTO PWR within 2 NM north, east, south or west of the steerpoint
  MLE_NM = 15; // the HUD range scale is available within 15 NM (horizontal) and ±30° of the nose
/** the HUD range scale of the type (4.2.4.1.7.8): A/B 10, D 15, G 20 NM */
export const scaleNm = name => (/65[AB]/i.test(name) ? 10 : /65[GL]/i.test(name) ? 20 : 15);
/** an AGM-65 of the load (its name of the weapon table) */
export const isMav = name => /AGM-?65|Maverick/i.test(String(name || ''));
/** the name of its Misdata file ("AGM-65D Maverick" -> AGM-65D) */
export const mavKey = name => {
  const m = String(name || '').match(/AGM-?65([A-Z])/i);
  return m ? 'AGM-65' + m[1].toUpperCase() : 'AGM-65D';
};
/** the laser Maverick: no TGP handoff, a laser on the target for the whole flight */
export const isLaserMav = name => /AGM-?65L/i.test(String(name || ''));
/** the defaults of the page: the launch altitude (ft) and slant range (NM) */
export const MAV_DEF = { popup: { mAlt: 5000, mRange: 7 }, hadb: { mAlt: 15000, mRange: 9 } };
/** the dive angle (°) of the line from the launch point to the target */
export const diveFor = (altFt, rangeNm) =>
  (Math.asin(Math.max(0, Math.min(1, altFt / Math.max(1, rangeNm * FT_NM)))) * 180) / Math.PI;
/** the time of flight (s) from a slant range */
export const tofOf = rangeNm => (rangeNm / MAV_KT) * 3600;
/** the speed of sound (kt) at an altitude (standard day) */
const soundKt = altFt => 661.47 * Math.sqrt(Math.max(0.75, 1 - 6.8756e-6 * Math.min(altFt, 36089)));

/**
 * The launch(es) and their checks. o: {name, alt (ft AGL), range (NM slant), speed (kt), rmax (NM, the Misdata at the launch; null when unknown), n (1 | 2),
 * gap (s between the launches), mra (ft AGL: the lowest the recovery allows, or null)}
 * @returns {{dive: number, horiz: number, tof: number, second: {alt: number, range: number, tof: number} | null, mach: number,
 *   flags: Record<string, string>, list: [string, boolean][]}}
 */
export function mavShot(o) {
  const dive = diveFor(o.alt, o.range),
    horiz = Math.sqrt(Math.max(0, o.range ** 2 - (o.alt / FT_NM) ** 2)),
    vFps = o.speed * 1.68781,
    mach = o.speed / soundKt(o.alt),
    /** @type {Record<string, string>} */
    flags = {},
    list = [];
  const bad = (k, t, red = true) => {
    if (red && k && !flags[k]) flags[k] = t;
    list.push([t, red]);
  };
  let second = null;
  if (o.n > 1) {
    const d = (vFps * o.gap) / FT_NM, // flown on the dive line between the two launches
      r2 = o.range - d,
      a2 = o.alt - vFps * o.gap * Math.sin((dive * Math.PI) / 180);
    second = { alt: a2, range: r2, tof: tofOf(Math.max(0, r2)) };
  }
  if (o.rmax != null && o.range > o.rmax)
    bad(
      'mRange',
      'Beyond the range of the ' +
        mavKey(o.name) +
        ': ' +
        o.rmax.toFixed(1) +
        ' NM at this altitude and speed (Misdata).'
    );
  if (o.range < MAV_RMIN_NM)
    bad('mRange', 'Nearer than ' + MAV_RMIN_NM + ' NM: too close for the missile to guide (an estimate).');
  if (dive > MAX_DIVE)
    bad('mAlt', 'A dive of ' + Math.round(dive) + '°: more than the ' + MAX_DIVE + '° of the AGM-65 (Dash-34).');
  if (o.speed > CARRY_KIAS || mach > CARRY_MACH)
    bad(
      'releaseSpeed',
      'Over ' +
        CARRY_KIAS +
        ' KIAS or Mach ' +
        CARRY_MACH +
        ' with the AGM-65 carried (Mach ' +
        mach.toFixed(2) +
        '; the launch: Mach ' +
        LAUNCH_MACH +
        ' at most).'
    );
  if (horiz > MLE_NM) bad('', 'More than ' + MLE_NM + ' NM from the target: no HUD range scale (MLE) yet.', false);
  if (second) {
    if (second.range < MAV_RMIN_NM)
      bad(
        'mGap',
        'The second launch is only ' +
          second.range.toFixed(1) +
          ' NM from the target: a shorter interval or a farther first launch.'
      );
    else if (o.mra != null && second.alt < o.mra)
      bad(
        'mGap',
        'The second launch is at ' +
          Math.round(second.alt) +
          ' ft AGL, under the minimum altitude (' +
          Math.round(o.mra) +
          ' ft).'
      );
  }
  return { dive, horiz, tof: tofOf(o.range), second, mach, flags, list };
}

/** the vertical flight of the missile for the engines (popup.js, strike.js): a straight line from the launch to the target, its time */
export function mavFall(altFt, diveDeg, rangeNm) {
  const horiz = altFt / Math.tan((Math.max(0.5, diveDeg) * Math.PI) / 180),
    tof = tofOf(rangeNm || Math.hypot(horiz, altFt) / FT_NM);
  return {
    range: horiz,
    time: tof,
    track: [
      { t: 0, x: 0, alt: altFt },
      { t: tof, x: horiz, alt: 0 },
    ],
  };
}

const card = b => ['NORTH', 'EAST', 'SOUTH', 'WEST'][Math.round((((b % 360) + 360) % 360) / 90) % 4];
/**
 * AUTO PWR (4.2.4.1.5): the steerpoint of the route that the aircraft passes at least 3 minutes before the launch (the last one), and the side it
 * comes from (NORTH, EAST, SOUTH or WEST: within 2 NM of it the missiles power on). R: [{n (number), x, y (km or ft: one unit), t (ms) | null}] in the
 * order of the route; tLaunch (ms)
 * @returns {{n: number, side: string, t: number} | null}
 */
export function autoPwr(R, tLaunch) {
  const ok = R.filter((p, i) => i > 0 && p.t != null && p.t <= tLaunch - SPIN_MIN * 60000);
  const p = ok[ok.length - 1];
  if (!p) return null;
  const q = R[R.indexOf(p) - 1],
    b = (Math.atan2(q.x - p.x, q.y - p.y) * 180) / Math.PI; // from the steerpoint toward the one before: where the aircraft comes from
  return { n: p.n, side: card(b), t: p.t };
}

/** the boresight point: from a steerpoint {n, e} (ft), a true bearing (°) and a range (NM) */
export const boresightAt = (p, brg, nm) => ({
  n: p.n + Math.cos((brg * Math.PI) / 180) * nm * FT_NM,
  e: p.e + Math.sin((brg * Math.PI) / 180) * nm * FT_NM,
});

// ---- buddy lasing (the AGM-65L of the lead, the laser of the element: Dash-34 4.2.4.1.10; the limits are estimates of common practice)
export const LASE_BASKET = 60, // the designator within 60° of the attack heading of the shooter (behind it, not across or ahead)
  LASE_NM = 10, // the slant range of the laser of the TGP
  LASE_PAD = 5; // s of laser after the impact
/**
 * The designator: o: {leadHdg, elemHdg (° the attack headings), slant (NM: the element at its laser point), tof (s: the flight of the lead's missile),
 * n (missiles of the lead), gap (s)}
 * @returns {{off: number, hold: number, flags: Record<string, string>, list: [string, boolean][]}}
 */
export function laseCheck(o) {
  const d = Math.abs(((((o.elemHdg - o.leadHdg) % 360) + 540) % 360) - 180),
    hold = Math.ceil((o.tof || 0) + (o.n > 1 ? o.gap : 0) + LASE_PAD),
    /** @type {Record<string, string>} */
    flags = {},
    /** @type {[string, boolean][]} */
    list = [];
  if (d > LASE_BASKET) {
    const t =
      'The laser comes ' +
      Math.round(d) +
      '° off the attack heading of the lead: keep within ' +
      LASE_BASKET +
      '° (an estimate).';
    flags.heading = t;
    list.push([t, true]);
  }
  if (o.slant > LASE_NM) {
    const t =
      'The laser point is ' +
      o.slant.toFixed(1) +
      ' NM from the target: within ' +
      LASE_NM +
      ' NM for the TGP laser (an estimate).';
    flags.mRange = t;
    list.push([t, true]);
  }
  return { off: d, hold, flags, list };
}

// @ts-check
// A-G > TASMO: the attack of a ship with an anti-ship missile (core/tasmopage.js). Pure maths, no DOM. Units: km of the theater (x east, y north),
// times in ms, speeds in kt, altitudes in ft, distances in NM unless named.
// The ship: where the campaign has it, inside an area of uncertainty (the fog of war: small when our side spotted it, large when not). Its SAM: the ring
// of its class, and the ring against low targets (under 5,000 ft). Its radar: the detection range of its class and the radar horizon (an antenna taken
// 100 ft above the sea). The missile: the range of its Misdata at the launch altitude (else the range of the campaign), a speed taken by its kind.
// The Harpoon (TO 1F-16CMAM-34-1-1 BMS 4.2.6.1): RBL on a known position (the search area LARGE grows with the range; MED and SMALL are fixed, for a
// ship of a group or near land), BOL on a bearing (the seeker turns on at the enable range, no search area), LOS.

export const KM_NM = 1.852;
export const SPOT_NM = 3, // the uncertainty of a ship spotted by our side
  BLIND_NM = 40, // ... not spotted
  ANT_FT = 100, // the radar antenna of a ship above the sea
  LOW_FT = 5000, // under it the low ring and the low detection of the class count
  MANPADS_FT = 15000, // the patrol boats: a MANPADS ring under this altitude
  MARGIN_NM = 5;

/** the radar horizon (NM) between an aircraft at hAc ft and an antenna at hAnt ft (4/3 earth) */
export const horizonNm = (hAc, hAnt = ANT_FT) => 1.23 * (Math.sqrt(Math.max(0, hAc)) + Math.sqrt(Math.max(0, hAnt)));
/** the altitude (ft) from which an antenna at hAnt ft is above the horizon at nm NM */
export const altForHorizon = (nm, hAnt = ANT_FT) => Math.max(0, nm / 1.23 - Math.sqrt(hAnt)) ** 2;

/** an anti-ship missile of the weapon table: guided (radar, IR or both), made against ships, a range of 15 km or more */
export const isAntiShip = w => !!w && [4, 16, 68].includes(+w.guid) && +w.naval >= 35 && +w.rngKm >= 15;
/** the name of its Misdata file from the name of the weapon table ("AGM-84A Harpoon" -> AGM-84A, "AS.34 Kormoran" -> AS-34) */
export const misKey = name =>
  String(name || '')
    .split(/[ (]/)[0]
    .replace(/\./g, '-');
/** the speed of the missile (kt, an estimate): the supersonic ones, the others high subsonic */
export const missileKt = name => (/Kh-31|YJ-12|ASM-3|Kh-41|BrahMos|SS-N-22/i.test(String(name || '')) ? 1500 : 500);
/** a Harpoon: the options of its WPN page */
export const isHarpoon = name => /AGM-84|HF-2/i.test(String(name || ''));
/** a patrol boat: no SAM ring of its class, a ring against low targets (its MANPADS) */
export const patrolBoat = c => !!c && !(+c.rng > 0) && +c.low > 0;

const unit = (a, b) => {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};
const along = (p, u, nm) => ({ x: p.x + u.x * nm * KM_NM, y: p.y + u.y * nm * KM_NM });

/**
 * The attack. o: {ship {x, y, rng, low, det, detAir (km), spotted}, from {x, y} (where the attack comes from: the steerpoint before the task),
 * cruise (ft), alt (ft: the launch altitude), dist (NM: the launch distance from the ship), rmax (NM at the launch altitude), radar (NM: the
 * detection range of the radar of the aircraft), tot (ms: the impact, the time of the task steerpoint), gs (kt), mslKt, n (missiles)}
 * @returns {{U: number, axis: {x: number, y: number}, launch: {x: number, y: number}, ring: number, ringLow: boolean, margin: number,
 *   seen: number, hidden: boolean, reach: number, covers: boolean, desc: {x: number, y: number, nm: number} | null, acq: {x: number, y: number,
 *   nm: number, alt: number} | null, mode: string, enable: number, destruct: number, tof: number, tLaunch: number, tDesc: number | null,
 *   tAcq: number | null, warn: [string, boolean][]}}
 */
export function tasmoPlan(o) {
  const s = o.ship,
    U = s.spotted ? SPOT_NM : BLIND_NM,
    axis = unit(s, o.from),
    low = o.alt < LOW_FT,
    ring = (low && s.low > 0 ? s.low : s.rng) / KM_NM,
    launch = along(s, axis, o.dist),
    // the ship may be U NM nearer than where the campaign has it
    margin = o.dist - U - ring,
    seen = Math.min(((low ? s.det : s.detAir) || s.det || 0) / KM_NM, horizonNm(o.alt)),
    hidden = o.dist - U > seen,
    reach = o.rmax - o.dist,
    covers = reach >= (s.spotted ? 0 : U),
    // the descent: before the ship sees you at the cruise altitude
    dDesc = Math.min((s.detAir || s.det || 0) / KM_NM, horizonNm(o.cruise)) + U + MARGIN_NM,
    desc = o.cruise > o.alt && dDesc > o.dist ? { ...along(s, axis, dDesc), nm: dDesc } : null,
    // not spotted: where the radar of the aircraft reaches the centre of the area (its range, under the horizon of the altitude of that point)
    acqAlt = desc ? o.alt : o.cruise,
    aNm = Math.min(o.radar || 0, horizonNm(acqAlt)),
    acq = !s.spotted && aNm > 0 ? { ...along(s, axis, aNm), nm: aNm, alt: acqAlt } : null,
    mode = s.spotted || (acq && aNm >= o.dist) ? 'rbl' : 'bol',
    tof = (o.dist / (o.mslKt || 500)) * 3600000,
    tLaunch = o.tot - tof,
    gs = o.gs || 480,
    back = nm => tLaunch - ((nm - o.dist) / gs) * 3600000,
    warn = [];
  if (!(o.rmax > 0)) warn.push(['No range for this missile.', true]);
  else if (reach < 0)
    warn.push(['The launch is beyond the range of the missile (' + o.rmax.toFixed(0) + ' NM).', true]);
  else if (!covers)
    warn.push([
      'The missile does not reach the far side of the area of the ship (±' + U + ' NM): launch nearer.',
      false,
    ]);
  if (margin < 0)
    warn.push([
      'The launch is inside the SAM ring of the ship' +
        (U ? ' (taking the ship ' + U + ' NM nearer, the fog of war)' : '') +
        ': launch farther.',
      true,
    ]);
  if (!hidden)
    warn.push([
      'The ship can see you at the launch (' +
        seen.toFixed(0) +
        ' NM at ' +
        Math.round(o.alt).toLocaleString('en-US') +
        ' ft): fly lower or launch farther.',
      false,
    ]);
  if (!s.spotted && mode == 'bol')
    warn.push([
      'Not spotted: your radar finds the ship at about ' +
        aNm.toFixed(0) +
        ' NM, nearer than the launch: BOL on the bearing of the area.',
      false,
    ]);
  return {
    U,
    axis,
    launch,
    ring,
    ringLow: low && s.low > 0,
    margin,
    seen,
    hidden,
    reach,
    covers,
    desc,
    acq,
    mode,
    enable: Math.max(1, Math.round(o.dist - U - 2)),
    destruct: Math.round(o.dist + U + MARGIN_NM),
    tof,
    tLaunch,
    tDesc: desc ? back(desc.nm) : null,
    tAcq: acq && acq.nm > o.dist ? back(acq.nm) : null,
    warn,
  };
}

// ---- the flight of the missile (an estimate: the Dash-34 gives the logic, not the numbers)
export const SKIM_FT = 100, // the cruise of the missile over the sea
  POP_FT = 1500, // the top of the terminal pop-up
  POP_NM = 2, // where the pop-up starts before the ship
  HIGH_NM = 10; // HIGH fly-out: the missile stays at the launch altitude to 10 NM (or the enable range in BOL), then descends
/** where the seeker turns on, NM from the ship: RBL at the edge of its search area, BOL at the enable range from the launch, LOS near the ship */
export function seekerNm(mode, dist, area, enable) {
  return mode == 'bol' ? Math.max(0, dist - enable) : mode == 'los' ? Math.min(dist, 10) : Math.min(dist, area + 2);
}
/** the radius of the search area (NM, an estimate): LARGE grows with the range (and covers the area of the ship), MED and SMALL are fixed */
export const areaNm = (size, dist, U) =>
  size == 'SMALL' ? 3 : size == 'MED' ? 6 : Math.max(U, Math.round(dist * 0.15));
/** the vertical flight of the missile: [[NM from the ship, ft]] from the launch to the impact; o: {dist, alt, fly: 'LOW' | 'HIGH', term: 'POP' | 'SKIM',
 * mode, enable} */
export function missilePath(o) {
  const hi = o.fly == 'HIGH' ? Math.min(HIGH_NM, o.mode == 'bol' ? o.enable : HIGH_NM, o.dist - 3) : 0,
    // a 30° descent: about 1 NM a 3,500 ft
    drop = a => Math.max(0.3, (a - SKIM_FT) / 3500),
    P = [[o.dist, o.alt]];
  if (hi > 0) P.push([o.dist - hi, o.alt]);
  const d0 = o.dist - hi;
  if (o.alt > SKIM_FT) P.push([Math.max(POP_NM + 0.5, d0 - drop(o.alt)), SKIM_FT]);
  if (o.term == 'POP') P.push([POP_NM, SKIM_FT], [POP_NM / 2, POP_FT], [0, 0]);
  else P.push([0, 30]);
  return P;
}

/** the launch distance to start with: outside the ring (the ship U NM nearer) with a margin, inside the range; null when there is no room */
export function defaultDist(ship, alt, rmax) {
  const U = ship.spotted ? SPOT_NM : BLIND_NM,
    ring = (alt < LOW_FT && ship.low > 0 ? ship.low : ship.rng) / KM_NM,
    lo = ring + U + MARGIN_NM,
    hi = rmax - (ship.spotted ? 2 : U);
  if (!(rmax > 0)) return Math.round(lo);
  return Math.round(Math.max(Math.min(hi, Math.max(lo, rmax * 0.85)), Math.min(lo, rmax * 0.9)));
}

/** the steps of the Harpoon (Dash-34 4.2.6.1) or of another missile; opt: {mode, area, prio, fly, term}; at: the launch (point, altitude) */
export function tasmoSteps(name, opt, P, at) {
  const hpn = isHarpoon(name);
  return [
    ...(hpn ? [['Before take-off', 'SMS: AG84 PWR ON and BIT (power for 20 minutes at most)']] : []),
    ...(hpn
      ? [
          [
            'Before the descent',
            'WPN: ' +
              opt.mode.toUpperCase() +
              (opt.mode == 'rbl'
                ? ' · ' + opt.area + ' · ' + opt.prio
                : ' · enable ' + P.enable + ' NM · destruct ' + P.destruct + ' NM') +
              ' · ' +
              opt.fly +
              ' · ' +
              opt.term,
          ],
        ]
      : []),
    ...(P.desc ? [['Descent', 'To the launch altitude ' + P.desc.nm.toFixed(0) + ' NM from the ship (OA2)']] : []),
    ...(P.acq && P.acq.nm > 0
      ? [['Radar', 'SEA mode: the ship within about ' + P.acq.nm.toFixed(0) + ' NM, in an area of ±' + P.U + ' NM']]
      : []),
    [
      'Target',
      opt.mode == 'bol'
        ? 'The bearing to the centre of the area (STPT 90)'
        : 'STPT 90 (HPN TGT), or the SPI from the radar or the pod',
    ],
    ['Launch', (hpn ? 'PWR ON (ready in 15 s) · ' : '') + 'MASTER ARM · in range · ' + at],
    [
      'Release',
      hpn
        ? 'Hold the release 1-2 s (up to 6 s) until the separation · the next missile'
        : 'The release · the next missile',
    ],
    ['After', 'Turn away to the egress · the time of the impact'],
  ];
}

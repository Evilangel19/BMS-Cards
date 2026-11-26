// A-G > TASMO (core/tasmo.js): the radar horizon, the anti-ship missiles, the patrol boats, the plan of the attack, the steps. Made-up data, no BMS file.
import {
  horizonNm,
  altForHorizon,
  isAntiShip,
  misKey,
  missileKt,
  isHarpoon,
  patrolBoat,
  tasmoPlan,
  defaultDist,
  tasmoSteps,
  KM_NM,
  SPOT_NM,
  BLIND_NM,
  seekerNm,
  areaNm,
  missilePath,
  POP_FT,
  hpnWpt,
  defaultWpt,
  bolWarn,
  inTheWay,
  minNm,
} from '../app/js/core/tasmo.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
const near = (a, b, e) => Math.abs(a - b) <= e;

// the radar horizon (4/3 earth): 500 ft against an antenna 100 ft up, about 40 NM
ok('horizon at 500 ft about 40 NM ' + horizonNm(500).toFixed(1), near(horizonNm(500), 39.8, 0.3));
ok('higher: farther', horizonNm(20000) > 180);
ok('the altitude for a horizon, back', near(altForHorizon(horizonNm(3000)), 3000, 1));

// the weapons
ok('AGM-84A: anti-ship', isAntiShip({ guid: 68, naval: 50, rngKm: 185 }));
ok('AGM-88: not (anti-radiation)', !isAntiShip({ guid: 1, naval: 35, rngKm: 50 }));
ok('a camera: not', !isAntiShip({ guid: 0, naval: 50, rngKm: 18 }));
ok(
  'Misdata names',
  misKey('AGM-84A Harpoon') == 'AGM-84A' && misKey('AS.34 Kormoran') == 'AS-34' && misKey('AS-17A (Kh-31A)') == 'AS-17A'
);
ok('Kh-31A supersonic, Harpoon subsonic', missileKt('AS-17A (Kh-31A)') > 1000 && missileKt('AGM-84A Harpoon') == 500);
ok('Harpoon options', isHarpoon('AGM-84A Harpoon') && !isHarpoon('AS-20 (Kh-35)'));
ok(
  'patrol boat: no SAM ring, a low ring',
  patrolBoat({ rng: 0, low: 4 }) && !patrolBoat({ rng: 80, low: 67 }) && !patrolBoat({ rng: 0, low: 0 })
);

// a carrier group (a SAM of 80 km, 67 km against low targets; radar 92 / 115 km) north of the flight; the attack from the south
const H = 3600000,
  ship = { x: 0, y: 0, rng: 80, low: 67, det: 92, detAir: 115, spotted: true },
  from = { x: 0, y: -300 },
  base = { ship, from, cruise: 22000, alt: 500, dist: 60, rmax: 67, radar: 35, tot: 14 * H, gs: 480, mslKt: 500 };
const P = tasmoPlan(base);
ok('spotted: ±3 NM', P.U == SPOT_NM);
ok('the launch 60 NM south on the axis', near(P.launch.x, 0, 1e-6) && near(P.launch.y, -60 * KM_NM, 1e-6));
ok('under 5,000 ft: the low ring (36 NM)', P.ringLow && near(P.ring, 67 / KM_NM, 1e-6));
ok(
  'outside the ring with the uncertainty: margin ' + P.margin.toFixed(1),
  near(P.margin, 60 - 3 - 67 / KM_NM, 1e-6) && P.margin > 0
);
ok('hidden under the horizon at 500 ft', P.hidden && near(P.seen, horizonNm(500), 1e-6));
ok('in range, RBL', P.covers && P.mode == 'rbl');
ok(
  'the descent before the ship sees you at FL220: 62 + 3 + 5 NM',
  P.desc && near(P.desc.nm, 115 / KM_NM + 3 + 5, 1e-6)
);
ok('no red warning', !P.warn.some(w => w[1]));
ok('time of flight 60 NM at 500 kt: 7.2 min', near(P.tof / 60000, 7.2, 0.01) && P.tLaunch == 14 * H - P.tof);
ok('the descent before the launch', P.tDesc < P.tLaunch);
// inside the ring, beyond the range
const In = tasmoPlan({ ...base, dist: 35 });
ok('35 NM: inside the ring (red)', In.margin < 0 && In.warn.some(w => w[1] && /SAM ring/.test(w[0])));
const Far = tasmoPlan({ ...base, dist: 70 });
ok('70 NM: beyond the range (red)', Far.reach < 0 && Far.warn.some(w => w[1] && /OUT OF RANGE/.test(w[0])));
// high: the normal ring, seen
const Hi = tasmoPlan({ ...base, alt: 22000 });
ok(
  '22,000 ft (the cruise): the ring of 80 km, seen',
  !Hi.ringLow && near(Hi.ring, 80 / KM_NM, 1e-6) && !Hi.hidden && !Hi.desc
);
// not spotted: ±40 NM, the radar finds it at 35 NM (nearer than the launch): BOL
const B = tasmoPlan({ ...base, ship: { ...ship, spotted: false } });
ok('not spotted: ±40 NM', B.U == BLIND_NM);
ok('not spotted: inside the ring with the fog of war (red)', B.margin < 0);
ok('not spotted: the radar acquisition 35 NM, BOL', B.acq && near(B.acq.nm, 35, 1e-6) && B.mode == 'bol');
ok(
  'BOL: the enable range before the area, the destruct after (99 NM at most)',
  B.enable == 60 - 40 - 2 && B.destruct == 99
);
const B2 = tasmoPlan({ ...base, ship: { ...ship, spotted: false }, radar: 80, alt: 500 });
ok('a radar of 80 NM but low: the horizon limits it (40 NM)', near(B2.acq.nm, horizonNm(500), 1e-6));

// the distance to start with
const d = defaultDist(ship, 500, 67);
ok('default: outside the ring with a margin, inside the range ' + d, d > 67 / KM_NM + 3 && d <= 65);
ok(
  'default without a range: the edge of the ring with the margin',
  defaultDist(ship, 500, 0) == Math.round(67 / KM_NM + 3 + 5)
);

// the steps
const S = tasmoSteps(
  'AGM-84A Harpoon',
  { mode: 'rbl', area: 'LARGE', prio: 'NORM', fly: 'LOW', term: 'POP' },
  P,
  '60 NM · 500 ft'
);
ok(
  'Harpoon steps: the power, the WPN options, the launch',
  S[0][1].includes('PWR ON') &&
    S[1][1].includes('RBL · LARGE · NORM · LOW · POP') &&
    S.some(r => r[0] == 'Launch' && r[1].includes('60 NM'))
);
const S2 = tasmoSteps('AS-20 (Kh-35)', { mode: 'rbl' }, P, '60 NM');
ok('another missile: no Harpoon pages', !S2.some(r => /AG84|WPN/.test(r[1])));
const S3 = tasmoSteps('AGM-84A Harpoon', { mode: 'bol', fly: 'LOW', term: 'SKIM' }, B, '60 NM');
ok('BOL: the enable and destruct ranges', S3[1][1].includes('ENBL 18 NM · DSTR 99 NM'));

// the flight of the missile
const lowPop = missilePath({ dist: 60, alt: 500, fly: 'LOW', term: 'POP', mode: 'rbl', enable: 0 });
ok(
  'LOW fly-out: down at once, the pop-up at the end',
  lowPop[0][0] == 60 &&
    lowPop[1][1] == 100 &&
    lowPop[1][0] > 59 &&
    lowPop.some(p => p[1] == POP_FT) &&
    lowPop[lowPop.length - 1][1] == 0
);
const hiSkim = missilePath({ dist: 60, alt: 20000, fly: 'HIGH', term: 'SKIM', mode: 'rbl', enable: 0 });
ok(
  'HIGH fly-out: 10 NM at the launch altitude, then down; SKIM to the end',
  hiSkim[1][0] == 50 && hiSkim[1][1] == 20000 && !hiSkim.some(p => p[1] == POP_FT) && hiSkim[hiSkim.length - 1][1] == 30
);
const hiBol = missilePath({ dist: 60, alt: 20000, fly: 'HIGH', term: 'SKIM', mode: 'bol', enable: 5 });
ok('HIGH in BOL: down at the enable range when nearer than 10 NM', hiBol[1][0] == 55);
ok(
  'the seeker: RBL at the area, BOL at the enable range',
  seekerNm('rbl', 60, 9, 0) == 11 && seekerNm('bol', 60, 0, 18) == 42
);
ok(
  'the search area: SMALL and MED fixed, LARGE grows and covers the area',
  areaNm('SMALL', 60, 3) == 3 &&
    areaNm('MED', 60, 3) == 6 &&
    areaNm('LARGE', 60, 3) == 9 &&
    areaNm('LARGE', 60, 40) == 40
);

// the Dash-34 pages (1.4.0-beta.31): the RBL waypoint (TGT-TO-WPT), BOL enable / destruct, LOS, the nearest launch
const sh = { x: 500, y: 500 },
  la = { x: 500, y: 500 - 50 * KM_NM }; // the launch 50 NM south of the ship
const w1 = hpnWpt({ ship: sh, launch: la, brg: 270, rng: 20, seek: 11, alt: 500 });
ok(
  'the waypoint: 20 NM west of the ship (TBRG 270), the path through it, the turns',
  near(w1.p.x, 500 - 20 * KM_NM, 1e-6) &&
    near(w1.p.y, 500, 1e-6) &&
    near(w1.path, Math.hypot(20, 50) + 20, 1e-6) &&
    near(w1.turnW, 180 - (Math.atan2(50, 20) * 180) / Math.PI, 1e-6) &&
    !w1.warn.length
);
const w2 = hpnWpt({ ship: sh, launch: la, brg: 270, rng: 8, seek: 11, alt: 500 });
ok(
  'TGT TO WPT RANGE TOO SMALL under the seeker range + 2 NM (red)',
  w2.warn.some(w => w[1] && /TGT TO WPT RANGE TOO SMALL/.test(w[0]))
);
const w3 = hpnWpt({ ship: sh, launch: la, brg: 180, rng: 49, seek: 11, alt: 500 });
ok(
  'WPT TOO CLOSE to the launch (red)',
  w3.warn.some(w => w[1] && /WPT TOO CLOSE/.test(w[0]))
);
const w4 = hpnWpt({ ship: sh, launch: la, brg: 0, rng: 20, seek: 11, alt: 500 });
ok(
  'a waypoint behind the ship: the initial turn and the turn at it too large',
  w4.warn.some(w => /INITIAL TURN/.test(w[0])) || w4.warn.some(w => /WPT TURN/.test(w[0]))
);
const dw = defaultWpt(sh, la, 11);
ok('the default waypoint: 60° off the line of the attack, 19 NM', dw.brg == 240 && dw.rng == 19);
const P90 = tasmoPlan({ ...base, path: 90 });
ok(
  'the path through the waypoint counts for the range and the time of flight',
  P90.reach < 0 && P90.warn.some(w => w[1] && /through the waypoint/.test(w[0])) && near(P90.tof / 60000, 10.8, 0.01)
);
ok(
  'BOL: the defaults pass, a destruct before the ship is red',
  !bolWarn(18, 99, 60, 40).some(w => w[1]) &&
    bolWarn(18, 50, 60, 40).some(w => w[1] && /DSTR RANGE TOO SMALL/.test(w[0]))
);
ok(
  'BOL: ACTIVE RANGE TOO SMALL (red), an enable past the near side (note)',
  bolWarn(60, 64, 60, 3).some(w => w[1] && /ACTIVE RANGE/.test(w[0])) &&
    bolWarn(59, 99, 60, 3).some(w => !w[1] && /past the near side/.test(w[0]))
);
const sh2 = { x: 500, y: 500 - 20 * KM_NM, name: 'Frigate' },
  sh3 = { x: 500 + 20 * KM_NM, y: 500 - 20 * KM_NM, name: 'Far' };
ok(
  'the ships on the line of the missile, before the target',
  inTheWay(la, sh, [sh, sh2, sh3])
    .map(s => s.name)
    .join() == 'Frigate'
);
ok('LOS: the seeker on shortly after the launch', seekerNm('los', 60, 0, 0) == 59);
ok(
  'the nearest launch: the descent and the seeker (RBL, BOL, LOS)',
  minNm('rbl', 500, 9, 0) == 14 && minNm('bol', 500, 0, 18) == 21 && minNm('los', 500, 0, 0) == 4
);
const hiW = missilePath({ dist: 60, alt: 20000, fly: 'HIGH', term: 'SKIM', mode: 'rbl', enable: 0, wpt: 6 });
ok('HIGH with a waypoint 6 NM away: down at the waypoint', hiW[1][0] == 54);
const SW = tasmoSteps(
  'AGM-84A Harpoon',
  { mode: 'rbl', area: 'MED', prio: 'NORM', fly: 'LOW', term: 'POP', wpt: { brg: 45, rng: 20 }, rmax: 67 },
  P,
  '60 NM'
);
ok(
  'the steps: power off after the BIT, the waypoint in the DED, PWR ON before the launch, the HUD scale at 120%, no priority with MED',
  SW[0][1].includes('then PWR OFF') &&
    SW.some(r => r[0] == 'Waypoint' && r[1].includes('TBRG 045° · RNG 20.0 NM')) &&
    SW.some(r => r[0] == 'Power') &&
    SW.some(r => r[0] == 'In range' && r[1].includes('80 NM')) &&
    !SW[1][1].includes('NORM')
);
const SL = tasmoSteps('AGM-84A Harpoon', { mode: 'los', fly: 'LOW', term: 'POP', hdg: '010' }, P, '60 NM');
ok(
  'LOS steps: wings level 40 s, the heading',
  SL.some(r => r[0] == 'Power' && r[1].includes('40 s')) &&
    SL.some(r => r[0] == 'Launch' && r[1].includes('heading 010'))
);

console.log(bad ? `${bad} of ${n} FAILED` : `tasmo: ${n} checks ok`);
process.exit(bad ? 1 : 0);

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
ok('70 NM: beyond the range (red)', Far.reach < 0 && Far.warn.some(w => w[1] && /beyond the range/.test(w[0])));
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
ok('BOL: the enable range before the area, the destruct after', B.enable == 60 - 40 - 2 && B.destruct == 60 + 40 + 5);
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
ok('BOL: the enable and destruct ranges', S3[1][1].includes('enable 18 NM · destruct 105 NM'));

console.log(bad ? `${bad} of ${n} FAILED` : `tasmo: ${n} checks ok`);
process.exit(bad ? 1 : 0);

// The Maverick in A-G > Pop-up and HADB (core/maverick.js, popup.js, strike.js): the launch on the dive line, the limits of the Dash-34, two launches,
// AUTO PWR, the boresight point. Made-up data, no BMS file.
import {
  isMav,
  mavKey,
  isLaserMav,
  diveFor,
  mavShot,
  mavFall,
  autoPwr,
  boresightAt,
  scaleNm,
  FT_NM,
  MAV_DEF,
  laseCheck,
} from '../app/js/core/maverick.js';
import { computePopup } from '../app/js/core/popup.js';
import { computeHadb } from '../app/js/core/strike.js';
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

ok(
  'the names: AGM-65 of the load, its Misdata file, the laser one',
  isMav('AGM-65D Maverick') && !isMav('GBU-12') && mavKey('AGM-65G2 Maverick') == 'AGM-65G' && isLaserMav('AGM-65L')
);
ok(
  'the HUD scale: D 15, G and L 20, B 10 NM',
  scaleNm('AGM-65D') == 15 && scaleNm('AGM-65G') == 20 && scaleNm('AGM-65L') == 20 && scaleNm('AGM-65B') == 10
);
ok(
  'the defaults: Pop-up 5,000 ft at 7 NM, HADB 15,000 ft at 9 NM',
  MAV_DEF.popup.mAlt == 5000 && MAV_DEF.popup.mRange == 7 && MAV_DEF.hadb.mAlt == 15000 && MAV_DEF.hadb.mRange == 9
);
ok(
  'the dive: 5,000 ft at 7 NM about 6.7°, 15,000 ft at 9 NM about 15.9°',
  near(diveFor(5000, 7), 6.75, 0.05) && near(diveFor(15000, 9), 15.92, 0.05)
);
const A = mavShot({ name: 'AGM-65D', alt: 5000, range: 7, speed: 480, rmax: 7.5, n: 1, gap: 4, mra: 1500 });
ok(
  'in range at 480 kt: no red line',
  !A.list.some(x => x[1]) && near(A.tof, (7 / 850) * 3600, 1e-6) && A.second == null
);
const B = mavShot({ name: 'AGM-65D', alt: 5000, range: 9, speed: 480, rmax: 7.5, n: 1, gap: 4, mra: 1500 });
ok(
  'beyond the Misdata range: the Launch range slider red',
  B.flags.mRange && B.list.some(x => x[1] && /Misdata/.test(x[0]))
);
const C = mavShot({ name: 'AGM-65D', alt: 5000, range: 7, speed: 620, rmax: 9, n: 1, gap: 4, mra: 1500 });
ok('over 600 KIAS carried: the speed slider red', !!C.flags.releaseSpeed);
const D = mavShot({ name: 'AGM-65D', alt: 15000, range: 2.6, speed: 450, rmax: 9, n: 1, gap: 4, mra: 1500 });
ok('a dive over 60°: the launch altitude red', !!D.flags.mAlt);
const E = mavShot({ name: 'AGM-65D', alt: 5000, range: 7, speed: 480, rmax: 9, n: 2, gap: 4, mra: 1500 });
ok(
  'two launches: the second 4 s later on the dive line, nearer and lower',
  E.second && near(E.second.range, 7 - (480 * 1.68781 * 4) / FT_NM, 1e-6) && E.second.alt < 5000 && !E.flags.mGap
);
const F = mavShot({ name: 'AGM-65D', alt: 2000, range: 2, speed: 480, rmax: 9, n: 2, gap: 8, mra: 1500 });
ok('a second launch too near: the interval red', !!F.flags.mGap);
ok(
  'far: no HUD range scale (a note, not red)',
  mavShot({ name: 'AGM-65D', alt: 20000, range: 15.5, speed: 450, rmax: 16, n: 1, gap: 4, mra: 0 }).list.some(
    x => !x[1] && /MLE/.test(x[0])
  )
);
const fl = mavFall(5000, diveFor(5000, 7), 7);
ok(
  'the flight of the missile: on the dive line to the target',
  near(fl.range, Math.sqrt((7 * FT_NM) ** 2 - 5000 ** 2), 1) && fl.track.length == 2
);
// the engines
const T = { n: 0, e: 0 },
  P = computePopup(T, T, {
    msl: true,
    releaseAltitude: 5000,
    diveAngle: Math.round(diveFor(5000, 7) * 10) / 10,
    mRange: 7,
    ripplePulses: 4,
    stickSpacing: 100,
  });
ok(
  'Pop-up with the Maverick: no AOD error, one launch, the release on the dive line',
  !P.error &&
    P.v.ripplePulses == 1 &&
    P.v.stickLength == 0 &&
    near(P.v.releaseRange, 5000 / Math.tan((P.v.diveAngle * Math.PI) / 180), 1)
);
const Hd = computeHadb(T, T, {
  msl: true,
  releaseAltitude: 15000,
  diveAngle: Math.round(diveFor(15000, 9) * 10) / 10,
  mRange: 9,
});
ok(
  'HADB with the Maverick: no error, the slant range about 9 NM',
  !Hd.error && near(Math.hypot(Hd.v.releaseRange, 15000) / FT_NM, 9, 0.05)
);
// AUTO PWR: the last route steerpoint at least 3 minutes before the launch, the side it is entered from
const M = 60000,
  R = [
    { n: 1, x: 0, y: 0, t: 0 },
    { n: 2, x: 0, y: 30000, t: 10 * M },
    { n: 3, x: 0, y: 60000, t: 15 * M },
    { n: 4, x: 0, y: 70000, t: 17 * M },
  ];
const ap = autoPwr(R, 19 * M);
ok('AUTO PWR: STPT 3 (4 min before), entered from the SOUTH', ap && ap.n == 3 && ap.side == 'SOUTH');
ok('AUTO PWR: none when no steerpoint is 3 minutes before', autoPwr(R, 2 * M) == null);
const bp = boresightAt({ n: 0, e: 0 }, 90, 2);
ok('the boresight point: 2 NM east of the steerpoint', near(bp.e, 2 * FT_NM, 1e-6) && near(bp.n, 0, 1e-6));

// buddy lasing (1.4.0-beta.35): the laser basket, the range of the laser, the hold time
const Z = laseCheck({ leadHdg: 360, elemHdg: 20, slant: 7, tof: 30, n: 2, gap: 4 });
ok('buddy lasing: 20° off, 7 NM, hold 30 + 4 + 5 s, no red', near(Z.off, 20, 1e-9) && Z.hold == 39 && !Z.list.length);
const Z2 = laseCheck({ leadHdg: 10, elemHdg: 280, slant: 12, tof: 30, n: 1, gap: 4 });
ok(
  'buddy lasing: 90° off and 12 NM, both red (the heading and the range sliders)',
  Z2.flags.heading && Z2.flags.mRange && Z2.list.length == 2
);
console.log(bad ? `${bad} of ${n} FAILED` : `maverick: ${n} checks ok`);
process.exit(bad ? 1 : 0);

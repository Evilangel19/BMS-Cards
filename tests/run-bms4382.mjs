// BMS 4.38.2 (1.3.0-beta.12). The BVR classes: the Su-30SM2 with the AA-13 and the AA-12B, their MAR from estimated values.
// The weather reports with the maps of BMS 4.38.2 and of F4Wx: clouds told by the condition and the density (not by the base, which
// every cell has), bases above 10 000 ft, the cover in eighths, shower cumulus, the map drifting with its wind (Map Model), the TAF with the changes of
// the hourly maps. Small maps made here, no BMS file.
import { atisText, tafText, wxColour } from '../app/js/rules/weather.js';
import { fmapDrift } from '../app/js/parsers/fmap.js';
import { setBase } from '../app/js/rules/ephemerides.js';
import { CLASSES } from '../app/js/core/bvrtimeline.js';
import { marShot } from '../app/js/core/airmissile.js';
import { BMS_TESTED } from '../app/js/core/version.js';
import { shortW } from '../app/js/app/datacard.js';

let n = 0,
  bad = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    bad++;
    console.error('FAIL', m);
  }
};
const H = 3600e3;
setBase(null);
const cell = o => ({
  spd: 5,
  hdg: 270,
  t: 12,
  cond: 1,
  cu: 4000,
  dens: 5,
  size: 3,
  tcu: 0,
  shower: 0,
  fogZ: 4000,
  fogEnd: 60,
  p: 1013,
  ...o,
});
const map = o => ({ at: () => cell(o) });
const met = (o, el = 0) => atisText(map(o), ['RKJK', 0, 0, 2 * H], el);

// ---- version and BVR
ok(BMS_TESTED === '4.38.2', 'the readers are checked with BMS 4.38.2');
{
  const c = CLASSES.find(x => x.n === 'Su-30SM2');
  ok(
    c &&
      c.m === 'AA-13' &&
      c.ms.includes('AA-12B') &&
      CLASSES.filter(x => x.ms.includes('AA-12B') || x.ms.includes('AA-13')).length === 1,
    'the AA-13 and the AA-12B: the Su-30SM2 only'
  );
  const i = CLASSES.findIndex(x => x.n === 'Su-30SM2');
  ok(i > 0 && /^Su-30/.test(CLASSES[i - 1].n), 'the Su-30SM2 next to the other Su-30 in the list (1.4.0-beta.37)');
  const a = marShot('AA-12', 30 * 6076, 600, 25000),
    b = marShot('AA-12B', 30 * 6076, 600, 25000),
    r = marShot('AA-13', 60 * 6076, 600, 25000);
  ok(
    b.known && b.est && !a.est && b.variable > a.variable && r.est && r.vMax > 3500,
    'their MAR: estimated values, the AA-12B farther than the AA-12 at the same range ' +
      [a.variable, b.variable, r.variable].map(x => x.toFixed(1))
  );
}
// ---- clouds
ok(
  /CAVOK|NSC/.test(met({ cond: 0, dens: 9, cu: 3000 })),
  'Sunny: no clouds, whatever the density (BMS: cloud base 35 000 ft) ' + met({ cond: 0, dens: 9, cu: 3000 })
);
ok(
  / OVC139 /.test(met({ cond: 2, dens: 13, cu: 13900, size: 0 })),
  'a base above 10 000 ft is written (was CAVOK) ' + met({ cond: 2, dens: 13, cu: 13900 })
);
ok(/CAVOK|NSC/.test(met({ cond: 1, dens: 9, cu: 10000 })), 'the base of exactly 10 000 ft of the older maps: no cloud');
ok(
  / FEW040 /.test(met({ dens: 4 })) &&
    / SCT040 /.test(met({ dens: 5 })) &&
    / BKN040 /.test(met({ dens: 8 })) &&
    / OVC040 /.test(met({ dens: 12 })),
  'the density read in eighths: 4 FEW, 5 SCT, 8 BKN, 12 OVC'
);
ok(
  / FEW040 /.test(met({ dens: 1 })) &&
    / SCT040 /.test(met({ dens: 7 })) &&
    / BKN040 /.test(met({ dens: 9 })) &&
    / OVC040 /.test(met({ dens: 13 })),
  'the four bands of the older maps (1, 5, 9, 13) as before'
);
ok(
  wxColour(map({ cond: 2, dens: 12, cu: 13900 }), ['RKJK', 0, 0, H], 0) === 'BLU' &&
    wxColour(map({ cond: 2, dens: 12, cu: 1200 }), ['RKJK', 0, 0, H], 0) === 'GRN',
  'colour code from the real base'
);
// ---- shower cumulus
ok(
  / SHRA /.test(met({ cond: 3, dens: 13, shower: 1 })) && / RA /.test(met({ cond: 3, dens: 13, shower: 0 })),
  'shower cumulus: SHRA (without: RA) ' + met({ cond: 3, dens: 13, shower: 1 })
);
ok(
  / -SHSN /.test(met({ cond: 2, dens: 12, shower: 1, t: -3 })),
  'light snow showers in the cold ' + met({ cond: 2, dens: 12, shower: 1, t: -3 })
);
ok(/ TSRA /.test(met({ cond: 3, dens: 13, shower: 1, tcu: 1, t: 20 })), 'a thunderstorm stays TSRA');

// ---- the map drifts with its wind (Map Model): the weather of a place later is the weather upwind
{
  const cs = 57344 / 3280.84;
  const W = {
    X: 59,
    Y: 59,
    cs,
    hdr: { wind: { hdg: 270, spd: 50 } },
    at: (x, y) => cell({ t: Math.round(x) }), // the temperature tells the column
    wind: () => ({ spd: 0, hdg: 0 }),
    profile: () => [],
  };
  const D = fmapDrift(W, 2 * H);
  ok(
    D.at(500, 500).t === Math.round(500 - 50 * 1.852 * 2),
    'two hours later with a west wind of 50 kt: the weather from 185 km west ' + D.at(500, 500).t
  );
  ok(fmapDrift(W, 0) === W && fmapDrift(W, 2 * H) === D, 'no time: the map itself; the same time: the same moved map');
}

// ---- TAF with the hourly maps
{
  const f = {
    wps: [
      { act: 0, arr: 0, x: 0, y: 0 },
      { act: 9, arr: 3 * H + 30 * 60e3, x: 0, y: 0 },
    ],
  };
  const byHour = h => map(h < 3 ? { cond: 0 } : { cond: 2, dens: 12, cu: 2500, size: 0, t: 8 });
  const taf = tafText({}, byHour(3), f, undefined, t => byHour(Math.floor(t / H)));
  ok(
    /^TAF TGT \d{6}Z 0102\/0106 \S+ CAVOK FM010300 \S+ 8000 -RA OVC025$/.test(taf),
    'a lasting change: FM at the hour of the map ' + taf
  );
  const one = h => map(h == 3 ? { cond: 2, dens: 12, cu: 2500, size: 0, t: 8 } : { cond: 0 });
  const t2 = tafText({}, one(3), f, undefined, t => one(Math.floor(t / H)));
  ok(/CAVOK TEMPO 0103\/0104 8000 -RA OVC025$/.test(t2), 'one hour only, then as before: TEMPO ' + t2);
  const same = tafText({}, map({ cond: 0 }), f, undefined, () => map({ cond: 0 }));
  ok(/CAVOK$/.test(same), 'no change: no group ' + same);
  const old = tafText({}, map({ cond: 2, dens: 12, cu: 2500 }), f);
  ok(/ TEMPO /.test(old), 'without the hourly maps: as before (TEMPO from its own conditions) ' + old);
}

// the loadout in short: the low altitude camera is "Camera", not "Low" (1.4.0-beta.37)
ok(
  shortW('1x Low Altitude Camera') === '1x Camera' && shortW('2x AIM-9M') === '2x AIM-9M',
  'the short loadout: Camera'
);
console.log(bad ? `run-bms4382.mjs: ${bad} of ${n} FAILED` : `run-bms4382.mjs: OK - ${n} checks`);
if (bad) process.exit(1);

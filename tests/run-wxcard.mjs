// The Weather card of the Kneeboard (1.3.0-beta.13): the plain words of the METAR and of the TAF, and the card drawn on a context that only
// records what is drawn (no browser): the chart, the profile, the big H and L, the small h and l, the reports, the contrails. Small maps made here.
import { decodeWx, tafParts, drawWxCard, WXC_W, WXC_H, WIND_LEVELS } from '../app/js/core/wxcard.js';
import { D, W } from './wxdata.mjs';

let n = 0,
  bad = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    bad++;
    console.error('FAIL', m);
  }
};

// ---- plain words
{
  const d = decodeWx('RKJK 010342Z 06005KT 8000 -RA BKN096 10/07 Q1032 A3047 NOSIG');
  ok(
    d == 'wind 060° 5 kt · vis 8.0 km · light rain · broken 9600 ft · temp 10 / dew 07 · QNH 1032 · alt 30.47',
    'a METAR in plain words: ' + d
  );
  ok(/calm/.test(decodeWx('00000KT CAVOK')) && /CAVOK/.test(decodeWx('00000KT CAVOK')), 'calm and CAVOK');
  ok(
    /heavy showers of rain/.test(decodeWx('+SHRA')) && /thunderstorm with rain/.test(decodeWx('TSRA')),
    'showers and storms'
  );
  ok(/temp -03 \/ dew -05/.test(decodeWx('M03/M05')), 'temperatures below zero');
  const p = tafParts(
    'TAF TGT 010115Z 0103/0107 30005KT 8000 -RA OVC027 FM010400 07003KT 2900 -RASN OVC027 TEMPO 0105/0106 4000 BR'
  );
  ok(
    p.length == 3 &&
      p[0][0] == 'from start' &&
      p[0][1].startsWith('30005KT') &&
      p[1][0] == 'from 04:00Z' &&
      p[1][1].startsWith('07003KT') &&
      p[2][0] == 'temporarily 0105/0106',
    'a TAF in its parts ' + JSON.stringify(p)
  );
}

// ---- the card, on a context that records
const T = [];
const ctx = () =>
  new Proxy(
    {},
    {
      get(o, k) {
        if (k in o) return o[k];
        if (k == 'measureText') return s => ({ width: String(s).length * 9 });
        if (k == 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        if (k == 'fillText') return s => T.push(String(s));
        return () => {};
      },
      set(o, k, v) {
        o[k] = v;
        return true;
      },
    }
  );
globalThis.document = /** @type {any} */ ({ createElement: () => ({ width: 1, height: 1, getContext: ctx }) });
globalThis.Path2D = /** @type {any} */ (class {});
ok(WXC_W == 1600 && WXC_H == 2400, 'the size of a Kneeboard card');
for (const st of ['sigwx', 'radar']) {
  T.length = 0;
  let err = null;
  try {
    drawWxCard(/** @type {any} */ (ctx()), D, st);
  } catch (e) {
    err = e;
  }
  ok(!err, st + ': drawn without errors ' + (err && err.stack));
  ok(T.includes('WEATHER') && T.includes(st == 'sigwx' ? 'SIGWX' : 'RADAR'), st + ': the title and the style');
  ok(T.includes('H') && T.includes('L'), st + ': the big H and L of the centres of pressure');
  ok(T.includes('h') && T.includes('l'), st + ': the small h and l by the isobars');
  ok(
    T.some(s => /^10\d\d$/.test(s)),
    st + ': the values of the isobars'
  );
  ok(T.includes('TGT') && T.some(s => /RKJJ/.test(s)), st + ': the target and the alternate on the chart');
  ok(
    T.some(s => s.includes('RKJK 010100Z')) && T.some(s => /wind 270° 20 kt/.test(s)),
    st + ': the reports, with their plain words'
  );
  ok(
    T.some(s => /CONTRAILS/.test(s) || /30000/.test(s)),
    st + ': the contrail levels'
  );
  if (st == 'sigwx') ok(T.includes('CB'), 'sigwx: the storm cells');
}

// the WIND card: three levels, no reports
{
  T.length = 0;
  let err = null;
  try {
    drawWxCard(/** @type {any} */ (ctx()), D, 'wind');
  } catch (e) {
    err = e;
  }
  ok(!err, 'wind: drawn without errors ' + (err && err.stack));
  ok(
    T.includes('WIND') && WIND_LEVELS.every(a => T.includes('FL' + String(a / 100).padStart(3, '0'))),
    'wind: the three levels ' + WIND_LEVELS
  );
  ok(!T.some(s => s.includes('RKJK 010100Z')) && !T.includes('PROFILE ALONG THE ROUTE'), 'wind: no METAR, no profile');
  ok(
    T.some(s => /^\d+ kt$/.test(s)),
    'wind: the lines of the speed'
  );
  ok(
    T.some(s => /^[+-]\d+$/.test(s)),
    'wind: the temperatures by the barbs'
  );
  ok(
    T.some(s => /CONTRAILS/.test(s)),
    'wind: the contrail levels'
  );
}

console.log(bad ? `run-wxcard.mjs: ${bad} of ${n} FAILED` : `run-wxcard.mjs: OK - ${n} checks`);
if (bad) process.exit(1);

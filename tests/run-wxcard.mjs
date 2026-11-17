// The Weather card of the Kneeboard (1.3.0-beta.13): the plain words of the METAR and of the TAF, and the card drawn on a context that only
// records what is drawn (no browser): the chart, the profile, the big H and L, the small h and l, the reports, the contrails. Small maps made here.
import { decodeWx, tafParts, drawWxCard, WXC_W, WXC_H } from '../app/js/core/wxcard.js';

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
const X = 40,
  Y = 40,
  cs = 16;
// a low (1004) in the west, a high (1024) in the east; overcast with rain in the west, sunny in the east
const cellAt = (i, j) => {
  const dw = Math.hypot(i - 10, j - 20),
    de = Math.hypot(i - 30, j - 20),
    p = 1014 - 10 * Math.exp(-(dw * dw) / 60) + 10 * Math.exp(-(de * de) / 60),
    wet = i < 20;
  return {
    cond: wet ? 3 : 0,
    p,
    t: 8,
    cu: 3000,
    dens: wet ? 13 : 0,
    size: 2,
    tcu: wet && dw < 3 ? 1 : 0,
    shower: 0,
    fogEnd: 60,
    spd: 20,
    hdg: 270,
  };
};
const W = {
  X,
  Y,
  cs,
  hdr: { contrail: [30000, 29000, 28000, 27000] },
  cell: cellAt,
  wind: (x, y, alt) => ({ spd: 10 + alt / 1000, hdg: 270 }),
  at: (x, y) =>
    cellAt(Math.max(0, Math.min(X - 1, Math.floor(x / cs))), Math.max(0, Math.min(Y - 1, Math.floor(y / cs)))),
};
const H = 3600e3,
  route = [
    { x: 150, y: 320, alt: 0, t: 1 * H, n: 1, d: 0 },
    { x: 320, y: 330, alt: 20000, t: 1.3 * H, n: 2, d: 92 },
    { x: 480, y: 320, alt: 500, t: 1.6 * H, n: 3, d: 178 },
    { x: 160, y: 310, alt: 0, t: 2.2 * H, n: 4, d: 350 },
  ],
  prof = Array.from({ length: 41 }, (_, k) => {
    const c = W.at(150 + k * 8, 320);
    return {
      d: k * 8.6,
      x: 150 + k * 8,
      y: 320,
      t: H,
      alt: 15000,
      elev: 200,
      ...c,
      tt: c.t,
      contrail: 29000,
    };
  });
const D = {
  title: 'Test 1-1',
  sub: 'Weather at 0136Z',
  dep: H,
  tot: 1.6 * H,
  land: 2.2 * H,
  route,
  tgt: 2,
  depId: 'RKJK',
  ldgId: 'RKJK',
  altn: { x: 170, y: 250, id: 'RKJJ' },
  at: () => W,
  prof,
  coast: [
    [
      [100, 100],
      [400, 100],
      [400, 500],
      [100, 500],
    ],
  ],
  contrail: W.hdr.contrail,
  reports: [
    { lab: 'DEP RKJK  METAR', text: 'RKJK 010100Z 27020KT 8000 -RA OVC030 08/05 Q1004 A2965 NOSIG', col: 'WHT' },
    { lab: 'TGT  TAF', text: 'TAF TGT 010036Z 0101/0105 27020KT 9999 NSC FM010200 27015KT 8000 -RA OVC030' },
  ],
};
ok(WXC_W == 1600 && WXC_H == 2400, 'the size of a Kneeboard card');
for (const st of ['sigwx', 'surface']) {
  T.length = 0;
  let err = null;
  try {
    drawWxCard(/** @type {any} */ (ctx()), D, st);
  } catch (e) {
    err = e;
  }
  ok(!err, st + ': drawn without errors ' + (err && err.stack));
  ok(T.includes('WEATHER') && T.includes(st == 'sigwx' ? 'SIGWX' : 'SURFACE'), st + ': the title and the style');
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

console.log(bad ? `run-wxcard.mjs: ${bad} of ${n} FAILED` : `run-wxcard.mjs: OK - ${n} checks`);
if (bad) process.exit(1);

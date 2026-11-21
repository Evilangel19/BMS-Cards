// Cockpit tone (core/tone.js): the curve of Brightness -50 / Contrast 100 is the one measured on the page the pilot changed in Photoshop (the black at
// 26, the midtones at a gamma of 1.53, the white kept), 0 / 0 changes nothing, a dark page is left alone unless asked, each half of a file on its own.
import { toneLUT, toneOn, toneRGBA } from '../app/js/core/tone.js';

let bad = 0,
  n = 0;
const ok = (name, cond) => {
  n++;
  if (!cond) {
    bad++;
    console.log('FAIL', name);
  }
};
const L = toneLUT({ bright: -50, contrast: 100 });
// the medians measured (the page as written -> as changed in Photoshop), within the error of the DXT blocks
const MEAS = [
  [74, 24],
  [99, 48],
  [148, 91],
  [181, 148],
  [205, 175],
  [231, 214],
];
ok('-50 / 100: black under 26, white kept', L[0] == 0 && L[26] == 0 && L[255] == 255);
ok(
  '-50 / 100: the measured curve within 12 (' + MEAS.map(([v]) => L[v]).join(' ') + ')',
  MEAS.every(([v, w]) => Math.abs(L[v] - w) <= 12)
);
ok(
  'the curve rises',
  [...L].every((v, i) => !i || v >= L[i - 1])
);
const Z = toneLUT({ bright: 0, contrast: 0 });
ok('0 / 0: nothing changes', [...Z].every((v, i) => v == i) && !toneOn({ on: true, bright: 0, contrast: 0 }));
ok('off: nothing changes', !toneOn({ on: false, bright: -50, contrast: 100 }));
const B = toneLUT({ bright: 40, contrast: 0 });
ok('more brightness: the midtones lighter', B[128] > 128 && B[0] == 0 && B[255] == 255);
const C = toneLUT({ bright: 0, contrast: -50 });
ok('less contrast: the black lifted, the white lowered', C[0] > 20 && C[255] < 235);
// a file of two pages: the left one light (grey 180), the right one dark (grey 30)
const W = 64,
  H = 32,
  mk = () => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4,
          g = x < W / 2 ? 180 : 30;
        d[i] = d[i + 1] = d[i + 2] = g;
        d[i + 3] = 255;
      }
    return d;
  };
const T = { on: true, bright: -50, contrast: 100 };
let d = toneRGBA(mk(), W, H, T);
ok('the light page toned, the dark page left alone', d[0] == L[180] && d[(W - 1) * 4] == 30 && d[3] == 255);
d = toneRGBA(mk(), W, H, { ...T, dark: true });
ok('also on dark pages: both toned', d[0] == L[180] && d[(W - 1) * 4] == L[30]);
console.log(bad ? `${bad} of ${n} tone checks failed` : `OK - ${n} tone checks`);
process.exit(bad ? 1 : 0);

// The weather made up for the tests of the Weather card (run-wxcard.mjs) and for the look check of the cards (tools/cardaudit-test.py): a low in the west, a
// high in the east, a route out and back. No BMS file.
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
export const W = {
  X,
  Y,
  cs,
  hdr: { contrail: [30000, 29000, 28000, 27000] },
  cell: cellAt,
  wind: (x, y, alt) => ({ spd: 5 + alt / 1000 + x / 12, hdg: 270 }),
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
export const D = {
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

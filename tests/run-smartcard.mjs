// The Smart cards (core/smartcard.js) on made-up data: the contour lines of a cone (closed rings at the right radius, one line per level, the segments
// joined), the peaks of two hills (the highest first, one per hill), the box of a view (the proportions of the drawing, every point inside), the step of
// the lines, the labels that do not cover each other, and an attack card drawn on a context that records (the key box, the references, the contour values,
// the MRA in the side view).
import {
  contours,
  peaks,
  planBox,
  contourStep,
  labeller,
  drawSmartAttack,
  drawSmartText,
  fmt,
} from '../app/js/core/smartcard.js';
let n = 0,
  bad = 0;
const ok = (name, c, x) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', name, x === undefined ? '' : JSON.stringify(x));
  }
};
// a cone 1000 high in the middle of a 41 x 41 grid, 50 per sample down from the top
const N = 41,
  cone = [];
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) cone.push(1000 - 50 * Math.hypot(i - 20, j - 20));
const c500 = contours(cone, N, N, 500);
ok(
  'the 500 line of a cone: one line, closed',
  c500.length == 1 &&
    c500[0].length > 20 &&
    Math.hypot(c500[0][0][0] - c500[0].at(-1)[0], c500[0][0][1] - c500[0].at(-1)[1]) < 1e-6,
  c500.length
);
ok(
  '...on a circle of radius 10 samples',
  c500[0].every(p => Math.abs(Math.hypot(p[0] - 20, p[1] - 20) - 10) < 0.35)
);
ok(
  'no line above the top, none at a level everywhere above',
  contours(cone, N, N, 1200).length == 0 && contours(cone, N, N, -2000).length == 0
);
ok(
  'a gap in the heights (null) breaks no line around it',
  contours(
    cone.map((h, k) => (k == 0 ? null : h)),
    N,
    N,
    500
  ).length == 1
);
// two hills: 3000 and 2000
const hills = [];
for (let j = 0; j < 40; j++)
  for (let i = 0; i < 60; i++)
    hills.push(
      3000 * Math.exp(-((i - 15) ** 2 + (j - 20) ** 2) / 40) + 2000 * Math.exp(-((i - 45) ** 2 + (j - 18) ** 2) / 40)
    );
const P = peaks(hills, 60, 40, 4);
ok(
  'the peaks: one per hill, the highest first',
  P.length == 2 && P[0][0] == 15 && P[0][1] == 20 && P[1][0] == 45 && Math.round(P[0][2]) == 3000,
  P
);
// the box of a view
const pts = [
    { n: 0, e: 0 },
    { n: 10000, e: 30000 },
    { n: -5000, e: 12000 },
  ],
  [e0, e1, n0, n1] = planBox(pts, 436 / 246);
ok(
  'the box: the proportions of the drawing, every point inside with a margin',
  Math.abs((e1 - e0) / (n1 - n0) - 436 / 246) < 1e-9 && pts.every(p => p.e > e0 && p.e < e1 && p.n > n0 && p.n < n1)
);
ok(
  'the step of the lines: 250 / 500 / 1000 / 2000 ft',
  contourStep(800) == 250 && contourStep(2000) == 500 && contourStep(5000) == 1000 && contourStep(9000) == 2000
);
ok('figures with a thin space for the thousands', fmt(12434) == '12 434' && fmt(null) == '--');
// ---- a context that records
const T = [];
const ctx = () =>
  new Proxy(
    {},
    {
      get(o, k) {
        if (k in o) return o[k];
        if (k == 'measureText') return s => ({ width: String(s).length * 7 });
        if (k == 'fillText') return s => T.push(String(s));
        return () => {};
      },
      set(o, k, v) {
        o[k] = v;
        return true;
      },
    }
  );
// labels: the second one at the same place goes elsewhere, a third with no free place left in its box is dropped
const L = labeller(ctx());
T.length = 0;
const a = L.put(100, 100, 'AAAA', { at: [[0, 0]] }),
  b = L.put(100, 100, 'BBBB', {
    at: [
      [0, 0],
      [0, 30],
    ],
  }),
  c = L.put(100, 100, 'CCCC', { at: [[0, 0]] });
ok('labels: placed, moved, dropped when no place is free', a && b && !c && T.join() == 'AAAA,BBBB', T);
// an attack card: a pop-up over a hill with a town and an enemy unit near the path
const FT = 6076.12,
  tgt = { n: 0, e: 0 },
  grid = { e0: -36000, e1: 8000, n0: -18000, n1: 8000, nx: 60, ny: 34, h: [] };
for (let j = 0; j < grid.ny; j++)
  for (let i = 0; i < grid.nx; i++) {
    const e = grid.e0 + ((i + 0.5) / grid.nx) * (grid.e1 - grid.e0),
      nn = grid.n1 - ((j + 0.5) / grid.ny) * (grid.n1 - grid.n0);
    grid.h.push(200 + 2600 * Math.exp(-((e + 15000) ** 2 + (nn - 4000) ** 2) / 2e7));
  }
T.length = 0;
drawSmartAttack(ctx(), {
  title: 'ATK · POP-UP T2',
  right: 'HAMMER 6',
  key: [
    ['TGT', 'STPT 6'],
    ['TOT', '09:25'],
    ['ATK HDG', '339°'],
    ['WPN', '2×MK82'],
    ['PUP', '3.4 NM'],
    ['APEX', '5 298'],
    ['REL', '3 500'],
    ['MRA', '947', true],
  ],
  side: {
    segs: [
      [
        'ingress',
        [
          [-34000, 500],
          [-20000, 500],
        ],
      ],
      [
        'climb',
        [
          [-20000, 500],
          [-15000, 4385],
        ],
      ],
      [
        'dive',
        [
          [-9000, 4900],
          [-5600, 3500],
        ],
      ],
      [
        'fall',
        [
          [-5600, 3500],
          [0, 0],
        ],
      ],
    ],
    marks: [[-20000, 500]],
    labels: [[-20000, 500, 'PUP 30°']],
    line: { h: 947, label: 'MRA 947' },
    ter: [
      [-34000, 200],
      [-15000, 1800],
      [2500, 300],
    ],
    x0: -34000,
    x1: 2500,
  },
  plan: {
    segs: [
      [
        'ingress',
        [
          { n: -3 * FT, e: -5 * FT },
          { n: -2.3 * FT, e: -2.5 * FT },
        ],
      ],
      [
        'dive',
        [
          { n: -1.4 * FT, e: 0.5 * FT },
          { n: -0.9 * FT, e: 0.3 * FT },
        ],
      ],
      ['fall', [{ n: -0.9 * FT, e: 0.3 * FT }, tgt]],
      [
        'egress',
        [
          { n: -0.9 * FT, e: 0.3 * FT },
          { n: -0.5 * FT, e: -1 * FT },
        ],
      ],
    ],
    marks: [
      [{ n: -2.3 * FT, e: -2.5 * FT }, 'PUP 279°', ''],
      [{ n: 0.6 * FT, e: -0.2 * FT }, 'OA1', 'dia'],
    ],
    target: tgt,
    grid,
    ingress: 500,
    refs: [
      { k: 'town', n: 1 * FT, e: -3 * FT, label: 'HWACHEON' },
      { k: 'unit', n: -2 * FT, e: -4 * FT, label: 'ARMOR BN' },
    ],
  },
  foot: [
    ['INGRESS', 'PULL 279°', '480 KCAS', '500 ft'],
    ['ROLL-IN', 'CLIMB 30°', 'AOD 3 960', 'TRACK 5 s'],
    ['BOMB', 'TOF 8.5 s', 'AD1 4 s ARM', '2 × 75 ft'],
  ],
  last: 'OA1 339° 3960 ft · EGR 289°',
});
const has = t => T.some(z => z.includes(t));
if (process.env.DBG) console.log(T.join(' | '));
ok(
  'the card: title, key box, the MRA of the side view, the footer',
  has('ATK · POP-UP T2') &&
    has('2×MK82') &&
    T.filter(z => z == '947').length == 1 &&
    has('MRA 947') &&
    has('AD1 4 s ARM') &&
    has('OA1 339°'),
  T.slice(0, 30)
);
ok(
  'the plan: the references and the attack labels',
  has('HWACHEON') && has('ARMOR BN') && has('PUP 279°') && has('TGT') && has('OA1')
);
ok(
  'the plan: the spot elevation of the hill and contour values',
  T.some(z => /^2 [5-9]\d\d$/.test(z)) && T.some(z => /^(500|1000|1500|2000|2500)$/.test(z)),
  T
);
ok('the scale and the north', has('NM') && has('N ↑'));
T.length = 0;
drawSmartText(ctx(), {
  title: 'ROE / SOP',
  right: 'HAMMER 6',
  key: [['WPN', 'TIGHT']],
  blocks: [['ENGAGE', ['Air: hostile by AWACS', ['SAM: self-defence only', true]]]],
  foot: [['ALT', 'RKTN']],
  last: 'preset',
});
ok(
  'a text card: the blocks with their bullets',
  has('ENGAGE') && has('• Air: hostile by AWACS') && has('• SAM: self-defence only')
);
if (process.env.DBG) console.log(T);
console.log((bad ? 'FAIL' : 'OK') + ' - ' + n + ' checks' + (bad ? ', ' + bad + ' failed' : ''));
process.exit(bad ? 1 : 0);

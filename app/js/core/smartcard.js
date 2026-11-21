// @ts-check
// The Smart cards of the Kneeboard (1600 x 2400, the page of every card): the look of a real smart card, black on white (the dark look turned by
// cardink), monospaced figures, red only for the limits. One layout for all: the title bar, the key box (2 rows x 4 numbers), a drawing with its values on
// the points, a footer. Drawn in units of a 460 x 690 page (the context scaled), so the layouts read as numbers of that page.
// The terrain of the plan view: dashed contour lines from the BMS height map (marching squares on a grid of the view), the spot elevations of the peaks
// (ICAO), the references near the attack (ICAO symbols for places, bridges, airfields and obstacles; NATO for the enemy units).
// Pure drawing on a 2D context; the data come ready from the pages (Weapons, Weather, Target, ROE / SOP).
import { inkCard } from './cardink.js';

export const SC_W = 1600,
  SC_H = 2400,
  U = SC_W / 460; // a unit of the layout in pixels of the card
const FM = 'Consolas, "DejaVu Sans Mono", "Courier New", monospace',
  INK = '#1c1c1c',
  GREY = '#666666',
  RED = '#cc0000',
  LAND = '#ffffff',
  SEA = '#e6e6e6';

// ---- text and shapes (units)
/** @param {CanvasRenderingContext2D} x */
function font(x, s, w = 400) {
  x.font = `${w} ${s}px ${FM}`;
}
/** text at (a, b); al: left / center / right; halo: a white edge under it (on a drawing) */
function txt(x, a, b, s, t, o = {}) {
  font(x, s, o.w || 400);
  x.textAlign = o.al || 'left';
  x.textBaseline = 'alphabetic';
  if (o.halo) {
    x.lineWidth = 3;
    x.lineJoin = 'round';
    x.strokeStyle = o.halo === true ? LAND : o.halo;
    x.strokeText(t, a, b);
  }
  x.fillStyle = o.c || INK;
  x.fillText(t, a, b);
}
const tw = (x, s, t, w = 400) => (font(x, s, w), x.measureText(t).width);
function line(x, pts, o = {}) {
  if (pts.length < 2) return;
  x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
  if (o.close) x.closePath();
  if (o.fill) {
    x.fillStyle = o.fill;
    x.fill();
  }
  if (o.w !== 0) {
    x.setLineDash(o.dash || []);
    x.lineWidth = o.w || 1;
    x.strokeStyle = o.c || INK;
    x.lineJoin = 'round';
    x.lineCap = o.cap || 'butt';
    x.stroke();
    x.setLineDash([]);
  }
}
function dot(x, a, b, r, c = RED) {
  x.beginPath();
  x.arc(a, b, r, 0, Math.PI * 2);
  x.fillStyle = c;
  x.fill();
}
function ring(x, a, b, r, o = {}) {
  x.beginPath();
  x.arc(a, b, r, 0, Math.PI * 2);
  if (o.fill) {
    x.fillStyle = o.fill;
    x.fill();
  }
  x.setLineDash(o.dash || []);
  x.lineWidth = o.w || 1;
  x.strokeStyle = o.c || INK;
  x.stroke();
  x.setLineDash([]);
}
/** the target: a triangle with a red edge */
function tri(x, a, b, s = 8) {
  line(
    x,
    [
      [a - s, b + s * 0.75],
      [a + s, b + s * 0.75],
      [a, b - s * 0.9],
    ],
    { close: true, fill: LAND, c: RED, w: 2 }
  );
}
function arrow(x, a, b, ang, s = 7) {
  x.save();
  x.translate(a, b);
  x.rotate(ang);
  line(
    x,
    [
      [0, 0],
      [-s, -s * 0.55],
      [-s, s * 0.55],
    ],
    { close: true, fill: INK, w: 0 }
  );
  x.restore();
}
function diamond(x, a, b, s = 5) {
  line(
    x,
    [
      [a, b - s * 1.4],
      [a + s * 1.4, b],
      [a, b + s * 1.4],
      [a - s * 1.4, b],
    ],
    { close: true, fill: LAND, w: 2 }
  );
}

// ---- the frame: the title bar, the key box, the sections, the footer
/** @param {CanvasRenderingContext2D} x */
export function scFrame(x, title, right) {
  inkCard(x);
  x.save();
  x.setTransform(U, 0, 0, U, 0, 0);
  x.fillStyle = LAND;
  x.fillRect(0, 0, 460, 690);
  x.fillStyle = '#222222';
  x.fillRect(0, 0, 460, 30);
  txt(x, 12, 20, 13, String(title || ''), { c: '#ffffff', w: 700 });
  txt(x, 448, 20, 13, String(right || '').slice(0, 26), { c: '#ffffff', w: 700, al: 'right' });
  return x;
}
export function scEnd(x) {
  x.restore();
}
/** the key box: 8 cells [label, value, red] */
export function scKey(x, items) {
  line(
    x,
    [
      [8, 38],
      [452, 38],
      [452, 142],
      [8, 142],
    ],
    { close: true, w: 2 }
  );
  [119, 230, 341].forEach(a =>
    line(
      x,
      [
        [a, 38],
        [a, 142],
      ],
      { w: 0.5 }
    )
  );
  line(
    x,
    [
      [8, 90],
      [452, 90],
    ],
    { w: 0.5 }
  );
  items.slice(0, 8).forEach(([l, v, red], i) => {
    const a = 14 + (i % 4) * 111,
      b = i < 4 ? 52 : 104;
    txt(x, a, b, 11, String(l || ''), { c: red ? RED : GREY, w: 700 });
    let s = 16;
    while (s > 11 && tw(x, s, String(v), 700) > 100) s--;
    txt(x, a, b + 26, s, String(v == null ? '--' : v), { c: red ? RED : INK, w: 700 });
  });
}
export function scSec(x, y, label) {
  line(
    x,
    [
      [0, y],
      [460, y],
    ],
    { w: y > 590 ? 1 : 0.5 }
  );
  if (label) txt(x, 12, y + 16, 12, label, { w: 700 });
}
/** the footer: three columns (a grey head and up to three rows), and a last line */
export function scFoot(x, y, cols, last, lastRed) {
  scSec(x, y);
  cols
    .slice(0, 3)
    .forEach((col, c) =>
      col
        .slice(0, 4)
        .forEach((s, i) => txt(x, 12 + c * 150, y + 16 + i * 16, i ? 13 : 11, String(s), i ? {} : { c: GREY, w: 700 }))
    );
  if (last) {
    // the last line fits the page: smaller, then cut
    let t = String(last),
      fs = 12;
    while (fs > 10 && tw(x, fs, t) > 436) fs--;
    while (t.length > 4 && tw(x, fs, t) > 436) t = t.slice(0, -2).replace(/[\s·]+$/, '') + '…';
    txt(x, 12, y + 82, fs, t, { c: lastRed ? RED : INK });
  }
}
/** lines of text from y, each [text, red]; size s, step d */
export function scLines(x, a, y, rows, s = 13, d = 16) {
  rows.forEach((r, i) => {
    const [t, red] = Array.isArray(r) ? r : [r, false];
    txt(x, a, y + i * d, s, t, { c: red ? RED : INK });
  });
}

// ---- labels that do not cover each other: a box is placed at the first free place of a few around its point, else dropped
export function labeller(x) {
  const used = [];
  const free = b => used.every(u => b[0] >= u[2] || b[2] <= u[0] || b[1] >= u[3] || b[3] <= u[1]);
  return {
    /** a box that labels must keep off (a mark) */
    block: (a, b, r = 5) => used.push([a - r, b - r, a + r, b + r]),
    /** places t near (a, b): the offsets tried in turn; false when none is free (box: the area it must stay in) */
    put(a, b, t, o = {}) {
      const s = o.s || 12,
        w = tw(x, s, t, o.w || 400),
        h = s;
      const d = o.r || 8,
        tries = o.at || [
          [d, 4],
          [-d - w, 4],
          [-w / 2, -d],
          [-w / 2, h + d - 2],
          [d, -d],
          [-d - w, -d],
          [d, h + d - 4],
          [-d - w, h + d - 4],
        ];
      for (const [dx, dy] of tries) {
        const b0 = [a + dx - 1, b + dy - h, a + dx + w + 1, b + dy + 2];
        if (o.box && (b0[0] < o.box[0] || b0[2] > o.box[2] || b0[1] < o.box[1] || b0[3] > o.box[3])) continue;
        if (!o.force && !free(b0)) continue;
        used.push(b0);
        txt(x, a + dx, b + dy, s, t, { c: o.c, w: o.w, halo: o.halo === undefined ? true : o.halo });
        return true;
      }
      return false;
    },
  };
}

// ---- contour lines: marching squares on a grid (row 0 at the top), the segments joined into lines
/** @param {ArrayLike<number>} v the heights, nx x ny, row by row from the top; @returns {number[][][]} lines of [col, row] points */
export function contours(v, nx, ny, lev) {
  lev += 1e-6; // a sample exactly at the level would give lines of no length
  const seg = [],
    at = (i, j) => v[j * nx + i];
  // the crossing on an edge, known by the edge (so the two cells that share it give the same point): h = from (i, j) to (i + 1, j), v = to (i, j + 1)
  const cross = (i, j, h) => {
    const a = at(i, j),
      b = h ? at(i + 1, j) : at(i, j + 1),
      f = (lev - a) / (b - a || 1e-9);
    return { k: (h ? 'h' : 'v') + i + ',' + j, p: h ? [i + f, j] : [i, j + f] };
  };
  const T = {
    1: [[2, 3]],
    2: [[1, 2]],
    3: [[1, 3]],
    4: [[0, 1]],
    5: [
      [0, 1],
      [2, 3],
    ],
    6: [[0, 2]],
    7: [[0, 3]],
    8: [[0, 3]],
    9: [[0, 2]],
    10: [
      [0, 3],
      [1, 2],
    ],
    11: [[0, 1]],
    12: [[1, 3]],
    13: [[1, 2]],
    14: [[2, 3]],
  };
  for (let j = 0; j + 1 < ny; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      if (c.some(h => h == null || !isFinite(h))) continue;
      const k = (c[0] >= lev ? 8 : 0) | (c[1] >= lev ? 4 : 0) | (c[2] >= lev ? 2 : 0) | (c[3] >= lev ? 1 : 0);
      if (k == 0 || k == 15) continue;
      const e = [
        () => cross(i, j, true),
        () => cross(i + 1, j, false),
        () => cross(i, j + 1, true),
        () => cross(i, j, false),
      ];
      T[k].forEach(([a, b]) => seg.push([e[a](), e[b]()]));
    }
  // join the segments by the edges they share
  const ends = new Map(),
    used = new Array(seg.length).fill(false);
  seg.forEach((s, n) =>
    [0, 1].forEach(k => {
      if (!ends.has(s[k].k)) ends.set(s[k].k, []);
      ends.get(s[k].k).push(n);
    })
  );
  const out = [];
  for (let n = 0; n < seg.length; n++) {
    if (used[n]) continue;
    used[n] = true;
    const L = [seg[n][0], seg[n][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? L[L.length - 1] : L[0],
          m = (ends.get(tip.k) || []).find(q => !used[q]);
        if (m === undefined) break;
        used[m] = true;
        const far = seg[m][0].k == tip.k ? seg[m][1] : seg[m][0];
        if (dir) L.push(far);
        else L.unshift(far);
      }
    }
    out.push(L.map(q => q.p));
  }
  return out;
}
/** the peaks of a grid: the highest sample of its neighbourhood (r samples each way), highest first: [i, j, h] */
export function peaks(v, nx, ny, r = 4, min = 300) {
  const o = [];
  for (let j = 1; j < ny - 1; j++)
    for (let i = 1; i < nx - 1; i++) {
      const h = v[j * nx + i];
      if (h == null || h < min) continue;
      let top = true;
      for (let b = -r; b <= r && top; b++)
        for (let a = -r; a <= r; a++) {
          const jj = j + b,
            ii = i + a;
          if ((a || b) && jj >= 0 && jj < ny && ii >= 0 && ii < nx && v[jj * nx + ii] > h) {
            top = false;
            break;
          }
        }
      if (top) o.push([i, j, h]);
    }
  return o.sort((a, b) => b[2] - a[2]);
}
/** a grid smoothed by box blurs of 3 x 3 (pass times; the gaps kept) */
export function smooth(v, nx, ny, pass = 1) {
  let a = Array.from(v);
  for (let p = 0; p < pass; p++) {
    const b = a.slice();
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        if (a[j * nx + i] == null) continue;
        let s = 0,
          n = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = i + di,
              jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
            const q = a[jj * nx + ii];
            if (q == null) continue;
            s += q;
            n++;
          }
        b[j * nx + i] = s / n;
      }
    a = b;
  }
  return a;
}
/** the corners of a line rounded (Chaikin), its ends kept */
export function chaikin(p, n = 1) {
  let a = p;
  for (let k = 0; k < n && a.length > 2; k++) {
    const o = [a[0]];
    for (let i = 0; i + 1 < a.length; i++) {
      const [x0, y0] = a[i],
        [x1, y1] = a[i + 1];
      o.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
    }
    o.push(a[a.length - 1]);
    a = o;
  }
  return a;
}
export const pathLen = p => p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
/** the step of the lines over the range of the ground of a view: at most four levels (250 ft at least) */
export const levelStep = (lo, hi) => [250, 500, 1000, 2000, 4000].find(s => (hi - lo) / s <= 4) || 4000;
/** the step of the contour lines for the highest ground of the view: a few lines, never a crowd */
export const contourStep = top => (top > 6000 ? 2000 : top > 3000 ? 1000 : top > 1200 ? 500 : 250);

// ---- the reference symbols (ICAO style; enemy units NATO)
export function refSymbol(x, k, a, b) {
  if (k == 'city')
    line(
      x,
      [
        [a - 11, b - 2],
        [a + 7, b - 8],
        [a + 12, b + 4],
        [a + 2, b + 10],
        [a - 9, b + 7],
      ],
      { close: true, fill: '#cccccc', w: 1.5 }
    );
  else if (k == 'town') ring(x, a, b, 6, { fill: LAND, w: 2 });
  else if (k == 'village') ring(x, a, b, 3.5, { fill: LAND, w: 1.5 });
  else if (k == 'airfield') {
    ring(x, a, b, 9, { fill: LAND, w: 2 });
    line(
      x,
      [
        [a - 6, b + 6],
        [a + 6, b - 6],
      ],
      { w: 3 }
    );
  } else if (k == 'bridge') {
    line(
      x,
      [
        [a - 8, b - 6],
        [a - 4, b - 2],
        [a + 4, b - 2],
        [a + 8, b - 6],
      ],
      { w: 2 }
    );
    line(
      x,
      [
        [a - 8, b + 6],
        [a - 4, b + 2],
        [a + 4, b + 2],
        [a + 8, b + 6],
      ],
      { w: 2 }
    );
  } else if (k == 'obst') {
    line(
      x,
      [
        [a - 6, b + 4],
        [a, b - 12],
        [a + 6, b + 4],
      ],
      { w: 2 }
    );
    dot(x, a, b + 4, 2, INK);
  } else if (k == 'unit') {
    line(
      x,
      [
        [a - 10, b - 7],
        [a + 10, b - 7],
        [a + 10, b + 6],
        [a - 10, b + 6],
      ],
      { close: true, fill: LAND, c: RED, w: 2 }
    );
    line(
      x,
      [
        [a - 10, b - 7],
        [a + 10, b + 6],
      ],
      { c: RED, w: 1.5 }
    );
    line(
      x,
      [
        [a + 10, b - 7],
        [a - 10, b + 6],
      ],
      { c: RED, w: 1.5 }
    );
  } else if (k == 'sam')
    line(
      x,
      [
        [a - 7, b + 6],
        [a + 7, b + 6],
        [a, b - 7],
      ],
      { close: true, fill: LAND, c: RED, w: 2 }
    );
  else
    line(
      x,
      [
        [a - 9, b - 6],
        [a + 9, b - 6],
        [a + 9, b + 6],
        [a - 9, b + 6],
      ],
      { close: true, fill: LAND, w: 1.5 }
    ); // an objective: a box with its code
}

// ---- the side profile: S {segs: [[phase, [[x, alt]...]]...], marks: [[x, alt]...], ter: [[x, h]...], line: {h, label}, cloud: {x0, x1, base, top, label},
//      labels: [[x, alt, text]...], x0, x1}
export function scSide(x, S, box) {
  const [bx, by, bw, bh] = box,
    all = S.segs.flatMap(z => z[1]),
    x0 = S.x0 != null ? S.x0 : Math.min(...all.map(p => p[0])),
    x1 = S.x1 != null ? S.x1 : Math.max(...all.map(p => p[0])),
    hs = [...all.map(p => p[1]), ...(S.ter || []).map(p => p[1]), S.cloud ? S.cloud.top : 0],
    amax = Math.max(1000, ...hs) * 1.15,
    SX = a => bx + ((a - x0) / (x1 - x0 || 1)) * bw,
    SY = h => by + bh - (Math.max(0, h) / amax) * bh,
    L = labeller(x);
  if (S.ter && S.ter.length > 1) {
    const T = S.ter.filter(p => p[0] >= x0 && p[0] <= x1);
    if (T.length > 1) {
      line(x, [[SX(T[0][0]), SY(0)], ...T.map(p => [SX(p[0]), SY(p[1])]), [SX(T[T.length - 1][0]), SY(0)]], {
        close: true,
        fill: '#dddddd',
        c: '#999999',
        w: 0.8,
      });
      const top = T.reduce((m, p) => (p[1] > m[1] ? p : m));
      if (top[1] > 50) {
        dot(x, SX(top[0]), SY(top[1]), 2.5, INK);
        L.put(SX(top[0]), SY(top[1]) - 4, fmt(top[1]), {
          s: 11,
          c: '#555555',
          at: [
            [5, -2],
            [-5 - tw(x, 11, fmt(top[1])), -2],
          ],
        });
      }
    }
  }
  line(
    x,
    [
      [bx - 4, SY(0)],
      [bx + bw + 6, SY(0)],
    ],
    { c: '#999999', w: 0.8 }
  );
  if (S.cloud) {
    const c = S.cloud,
      a = SX(Math.max(x0, c.x0)),
      b = SX(Math.min(x1, c.x1));
    if (b > a) {
      line(
        x,
        [
          [a, SY(c.top)],
          [b, SY(c.top)],
          [b, SY(c.base)],
          [a, SY(c.base)],
        ],
        { close: true, fill: '#f2f2f2', c: '#888888', w: 1, dash: [3, 2] }
      );
      L.put(a + 2, SY(c.base) - 3, c.label, { s: 10, c: '#777777', at: [[2, 0]] });
    }
  }
  if (S.line) {
    line(
      x,
      [
        [bx - 4, SY(S.line.h)],
        [bx + bw + 6, SY(S.line.h)],
      ],
      { c: RED, w: 1, dash: [6, 4] }
    );
    L.put(bx, SY(S.line.h) - 5, S.line.label, {
      s: 11,
      c: RED,
      at: [
        [0, 0],
        [0, 16],
      ],
    });
  }
  for (const [k, pts] of S.segs) {
    const P = pts.map(p => [SX(p[0]), SY(p[1])]);
    line(x, P, k == 'fall' ? { w: 1.5, dash: [3, 3] } : { w: 3, cap: 'round' });
  }
  (S.marks || []).forEach(p => {
    dot(x, SX(p[0]), SY(p[1]), 4.5);
    L.block(SX(p[0]), SY(p[1]), 6);
  });
  tri(x, SX(0), SY(0) - 5);
  L.block(SX(0), SY(0) - 5, 9);
  (S.labels || []).forEach(([a, h, t]) => L.put(SX(a), SY(h), t, { s: 11 }));
  return { SX, SY };
}

// ---- the plan view: P {segs: [[phase, [{n, e}...]]...], marks: [[{n, e}, label, shape]...], target {n, e}, grid {n0, n1, e0, e1, nx, ny, h}, ingress,
//      refs: [{k, n, e, label}], scale: true}; box in units; the view fitted to the segments (north up)
export function scPlan(x, P, box) {
  const [bx, by, bw, bh] = box,
    G = P.grid,
    all = [...P.segs.flatMap(z => z[1]), ...P.marks.map(m => m[0]), P.target].filter(
      p => p && isFinite(p.n) && isFinite(p.e)
    );
  let e0, e1, n1;
  if (G) [e0, e1, n1] = [G.e0, G.e1, G.n1];
  else [e0, e1, , n1] = planBox(all, bw / bh);
  const sc = bw / (e1 - e0),
    PX = p => bx + (p.e - e0) * sc,
    PY = p => by + (n1 - p.n) * sc,
    L = labeller(x),
    lbox = [bx + 2, by + 2, bx + bw - 2, by + bh - 2];
  x.save();
  x.beginPath();
  x.rect(bx, by, bw, bh);
  x.clip();
  x.fillStyle = LAND;
  x.fillRect(bx, by, bw, bh);
  if (G) {
    const { nx, ny, h } = G,
      gx = i => bx + ((i + 0.5) / nx) * bw,
      gy = j => by + ((j + 0.5) / ny) * bh;
    // the ground smoothed (the small bumps of the height map are noise at this scale), the sea where it is at 0: filled, its coast without the small bits
    const sm = smooth(h, nx, ny, 5),
      minLen = Math.min(bw, bh) * 0.22,
      cw = bw / nx + 0.6,
      ch = bh / ny + 0.6;
    x.fillStyle = SEA;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (sm[j * nx + i] != null && sm[j * nx + i] < 0.5) x.fillRect(gx(i) - cw / 2, gy(j) - ch / 2, cw, ch);
    contours(sm, nx, ny, 0.5).forEach(c => {
      const pts = chaikin(
        c.map(q => [gx(q[0]), gy(q[1])]),
        2
      );
      if (pathLen(pts) >= minLen) line(x, pts, { c: '#888888', w: 1 });
    });
    // the lines of a smoothed ground (the small bumps of the height map are noise at this scale): a few levels over the range of the view, the short
    // pieces and the small rings dropped, the corners rounded; a value on the longest lines only
    let lo = Infinity,
      top = 0;
    for (let k = 0; k < sm.length; k++)
      if (sm[k] != null) {
        if (sm[k] > top) top = sm[k];
        if (sm[k] < lo) lo = sm[k];
      }
    const step = levelStep(Math.max(0, lo), top),
      labs = [];
    for (let lev = Math.max(step, Math.ceil((lo + 1) / step) * step); lev < top; lev += step) {
      const hi = lev >= (P.ingress || 0);
      contours(sm, nx, ny, lev).forEach(c => {
        const pts = chaikin(
            c.map(q => [gx(q[0]), gy(q[1])]),
            2
          ),
          len = pathLen(pts);
        if (len < minLen) return;
        line(x, pts, { c: hi ? '#333333' : '#999999', w: hi ? 1.3 : 0.9, dash: hi ? [7, 4] : [4, 4] });
        labs.push([pts[Math.floor(pts.length / 2)], lev, hi, len]);
      });
    }
    labs.sort((a, b) => b[3] - a[3]);
    labs.splice(3);
    // the spot elevations: the highest of the view in bold; red above the ingress altitude
    const pk = [];
    for (const q of peaks(h, nx, ny, Math.max(4, Math.round(nx / 12)))) {
      if (pk.length >= 3) break;
      if (q[2] - lo < step * 0.75) continue; // not a peak at this scale
      if (pk.some(o => Math.hypot(gx(o[0]) - gx(q[0]), gy(o[1]) - gy(q[1])) < 70)) continue;
      pk.push(q);
    }
    pk.forEach(([i, j, v], k) => {
      const a = gx(i),
        b = gy(j),
        red = P.ingress != null && v >= P.ingress && P.ingress < 3000;
      dot(x, a, b, 3, red ? RED : INK);
      L.block(a, b, 4);
      L.put(a, b, fmt(v), {
        s: k ? 12 : 14,
        w: k ? 400 : 700,
        c: red ? RED : INK,
        box: lbox,
        at: [
          [6, 4],
          [-6 - tw(x, k ? 12 : 14, fmt(v), k ? 400 : 700), 4],
          [-10, -7],
          [-10, 18],
        ],
      });
    });
    G.labs = labs;
  }
  // the references
  (P.refs || []).forEach(r => {
    const a = PX(r),
      b = PY(r);
    if (a < bx || a > bx + bw || b < by || b > by + bh) return;
    refSymbol(x, r.k, a, b);
    L.block(a, b, 10);
  });
  // the attack: a white edge under the lines (they read over the contours)
  for (const [k, pts] of P.segs) {
    const Q = pts.filter(p => p && isFinite(p.n)).map(p => [PX(p), PY(p)]);
    line(x, Q, { c: LAND, w: 6 });
    if (k == 'fall') line(x, Q, { w: 1.5, dash: [3, 3] });
    else if (k == 'egress') {
      line(x, Q, { w: 2, dash: [7, 4] });
      if (Q.length > 1) {
        const a = Q[Q.length - 2],
          b = Q[Q.length - 1];
        arrow(x, b[0], b[1], Math.atan2(b[1] - a[1], b[0] - a[0]));
      }
    } else line(x, Q, { w: 3, cap: 'round' });
  }
  P.marks.forEach(([p, , sh]) => {
    if (!p || !isFinite(p.n)) return;
    if (sh == 'dia') diamond(x, PX(p), PY(p));
    else dot(x, PX(p), PY(p), 5);
    L.block(PX(p), PY(p), 7);
  });
  if (P.target) {
    tri(x, PX(P.target), PY(P.target));
    L.block(PX(P.target), PY(P.target), 9);
  }
  // the labels: the attack first, then the references, then the contour values (each dropped when there is no room)
  P.marks.forEach(([p, lab]) => p && isFinite(p.n) && lab && L.put(PX(p), PY(p), lab, { s: 12, box: lbox }));
  if (P.target) L.put(PX(P.target), PY(P.target), P.tlabel || 'TGT', { s: 12, w: 700, box: lbox, r: 11 });
  (P.refs || []).forEach(r => {
    const a = PX(r),
      b = PY(r);
    if (a < bx || a > bx + bw || b < by || b > by + bh || !r.label) return;
    L.put(a, b, r.label, {
      s: 12,
      c: r.k == 'unit' || r.k == 'sam' ? RED : INK,
      box: lbox,
      at: [
        [13, 4],
        [-13 - tw(x, 12, r.label), 4],
        [-tw(x, 12, r.label) / 2, -11],
        [-tw(x, 12, r.label) / 2, 22],
      ],
    });
  });
  if (G && G.labs)
    G.labs.forEach(([p, lev, hi]) =>
      L.put(p[0], p[1], String(lev), { s: 10, c: hi ? '#333333' : '#999999', box: lbox, at: [[-12, 4]] })
    );
  x.restore();
  line(
    x,
    [
      [bx, by],
      [bx + bw, by],
      [bx + bw, by + bh],
      [bx, by + bh],
    ],
    { close: true, c: '#999999', w: 0.5 }
  );
  // the scale (1 NM, or 5 / 10 when the view is wide) and the north
  const nmU = 6076.12 * sc,
    k = nmU > 30 ? 1 : nmU * 5 > 30 ? 5 : 10,
    w = nmU * k;
  line(
    x,
    [
      [bx + bw - 12 - w, by + 16],
      [bx + bw - 12, by + 16],
    ],
    { w: 2 }
  );
  txt(x, bx + bw - 12 - w / 2, by + 30, 10, k + ' NM', { al: 'center', halo: true });
  txt(x, bx + 8, by + 18, 12, 'N ↑', { w: 700, halo: true });
  return { PX, PY, sc };
}
/** the box of a view around the points with a margin, of the proportions of the drawing (w / h): [e0, e1, n0, n1] in feet */
export function planBox(pts, ar, margin = 0.18) {
  const es = pts.map(p => p.e),
    ns = pts.map(p => p.n);
  let e0 = Math.min(...es),
    e1 = Math.max(...es),
    n0 = Math.min(...ns),
    n1 = Math.max(...ns);
  const m = Math.max(e1 - e0, n1 - n0, 6000) * margin;
  e0 -= m;
  e1 += m;
  n0 -= m;
  n1 += m;
  const ce = (e0 + e1) / 2,
    cn = (n0 + n1) / 2;
  let w = e1 - e0,
    h = n1 - n0;
  if (w / h > ar) h = w / ar;
  else w = h * ar;
  return [ce - w / 2, ce + w / 2, cn - h / 2, cn + h / 2];
}
export const fmt = v => (v == null || !isFinite(v) ? '--' : Math.round(v).toLocaleString('en-US').replace(/,/g, ' '));

// ---- the cards
/** an attack card (Pop-up, HADB, TOSS): A {title, right, key, side, plan, foot, last, lastRed} */
export function drawSmartAttack(x, A) {
  scFrame(x, A.title, A.right);
  scKey(x, A.key);
  scSec(x, 146, 'SIDE');
  scSide(x, A.side, [24, 166, 416, 134]);
  scSec(x, 326, 'PLAN');
  scPlan(x, A.plan, [12, 350, 436, 246]);
  scFoot(x, 602, A.foot, A.last, A.lastRed);
  scEnd(x);
}
/** a card of text blocks (ROE / SOP): T {title, right, key, blocks: [[head, [lines]]...], foot, last} */
export function drawSmartText(x, T) {
  scFrame(x, T.title, T.right);
  scKey(x, T.key);
  scSec(x, 146);
  let y = 168;
  for (const [head, rows] of T.blocks) {
    if (y > 580) break;
    txt(x, 12, y, 13, head, { w: 700 });
    y += 18;
    for (const r of rows) {
      if (y > 588) break;
      const [t, red] = Array.isArray(r) ? r : [r, false];
      wrap(x, '• ' + t, 13, 432).forEach((l, k) => {
        if (y > 588) return;
        txt(x, k ? 24 : 12, y, 13, k ? l.trim() : l, { c: red ? RED : INK });
        y += 16;
      });
    }
    y += 10;
  }
  scFoot(x, 602, T.foot, T.last);
  scEnd(x);
}
/** the words of t in lines no wider than w */
export function wrap(x, t, s, w) {
  const words = String(t).split(' '),
    out = [];
  let cur = '';
  for (const wd of words) {
    const nx = cur ? cur + ' ' + wd : wd;
    if (tw(x, s, nx) > w && cur) {
      out.push(cur);
      cur = '   ' + wd;
    } else cur = nx;
  }
  if (cur) out.push(cur);
  return out;
}
export {
  txt as scText,
  line as scLine,
  dot as scDot,
  ring as scRing,
  tri as scTri,
  diamond as scDiamond,
  arrow as scArrow,
  tw as scWidth,
};

// @ts-check
// The Smart SEAD and DEAD cards (core/smartcard.js look). Positions in km of the theater (x east, y north), times in ms.
// SEAD D: {title, right, key, t0, t1, rows [{name, by, on [[a, b]], cover [[a, b]], gaps [[a, b]], marks [{t, label, late}]}],
//          plan {sams [{x, y, r, name}], prot [[{x, y}]], me [{x, y}], shots [{x, y, sx, sy, label, late}]}, table [[text, red]], last}
// DEAD D: {title, right, key, sam {x, y, name}, rings [[r km, label, kind]], lines [{pts, w, dash, c}], points [{x, y, label, k}], events [[time, text]],
//          foot, last}
import {
  scFrame,
  scKey,
  scSec,
  scEnd,
  scText,
  scLine,
  scDot,
  scTri,
  scDiamond,
  scArrow,
  scRing,
  scWidth,
  labeller,
} from './smartcard.js';

const RED = '#cc0000',
  hhmm = t => {
    const m = Math.floor((t || 0) / 60000);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
export { hhmm as scHhmm };

// a view of km points in a box (north up, one scale): {X, Y, sc (units per km)}
function view(pts, box, pad = 0.08) {
  const [bx, by, bw, bh] = box,
    xs = pts.map(p => p.x),
    ys = pts.map(p => p.y);
  let x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  const m = Math.max(x1 - x0, y1 - y0, 5) * pad;
  x0 -= m;
  x1 += m;
  y0 -= m;
  y1 += m;
  const sc = Math.min(bw / (x1 - x0), bh / (y1 - y0)),
    cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  return { X: x => bx + bw / 2 + (x - cx) * sc, Y: y => by + bh / 2 - (y - cy) * sc, sc };
}
function frameBox(x, box) {
  const [bx, by, bw, bh] = box;
  scLine(
    x,
    [
      [bx, by],
      [bx + bw, by],
      [bx + bw, by + bh],
      [bx, by + bh],
    ],
    { close: true, c: '#999999', w: 0.5 }
  );
}
function scale(x, box, sc) {
  const [bx, by, bw] = box,
    nm = 1.852 * sc,
    k = nm * 10 < bw / 3 ? 10 : nm * 5 < bw / 3 ? 5 : 1,
    w = nm * k;
  scLine(
    x,
    [
      [bx + bw - 12 - w, by + 16],
      [bx + bw - 12, by + 16],
    ],
    { w: 2 }
  );
  scText(x, bx + bw - 12 - w / 2, by + 30, 10, k + ' NM', { al: 'center', halo: true });
  scText(x, bx + 8, by + 18, 12, 'N ↑', { w: 700, halo: true });
}
const clip = (x, box) => {
  x.save();
  x.beginPath();
  x.rect(box[0], box[1], box[2], box[3]);
  x.clip();
};

/** the timeline of the SAMs from top (a section): returns the y under its legend */
export function seadTimeline(x, D, top, label = 'HARM TIMELINE', maxRows = 6, room = 132) {
  // ---- the timeline: a row a SAM (grey: a protected flight in its ring; black: the cover of a HARM; red: open), the launches over it
  scSec(x, top, label);
  const rows = D.rows.slice(0, maxRows),
    rh = Math.min(34, room / Math.max(1, rows.length)),
    T0 = D.t0,
    T1 = D.t1 > D.t0 ? D.t1 : D.t0 + 60000,
    TX = t => 70 + ((t - T0) / (T1 - T0)) * 376,
    y0 = top + 40;
  const stepMin = (T1 - T0) / 60000 > 14 ? 4 : 2;
  for (let m = Math.ceil(T0 / 60000) * 60000; m < T1; m += 60000) {
    scLine(
      x,
      [
        [TX(m), y0 - 12],
        [TX(m), y0 + rows.length * rh - 8],
      ],
      { c: '#cccccc', w: 0.5 }
    );
    if ((m / 60000) % stepMin == 0) scText(x, TX(m), y0 - 14, 10, hhmm(m), { c: '#777777', al: 'center' });
  }
  rows.forEach((r, i) => {
    const y = y0 + i * rh,
      bh = Math.min(18, rh - 12);
    scText(x, 12, y + bh - 2, 13, r.name, { w: 700 });
    r.on.forEach(([a, b]) =>
      scLine(
        x,
        [
          [TX(a), y],
          [TX(b), y],
          [TX(b), y + bh],
          [TX(a), y + bh],
        ],
        { close: true, fill: '#dddddd', w: 0 }
      )
    );
    r.cover.forEach(([a, b]) =>
      scLine(
        x,
        [
          [TX(a), y],
          [TX(b) + 1, y],
          [TX(b) + 1, y + bh],
          [TX(a), y + bh],
        ],
        { close: true, fill: '#222222', w: 0 }
      )
    );
    r.gaps.forEach(([a, b]) =>
      scLine(
        x,
        [
          [TX(a), y + bh - 5],
          [TX(b) + 1, y + bh - 5],
          [TX(b) + 1, y + bh],
          [TX(a), y + bh],
        ],
        { close: true, fill: RED, w: 0 }
      )
    );
    // the launches over the row, their times above it; one that would touch the one before goes under the row
    let end = -1e9,
      endU = -1e9;
    r.marks
      .slice()
      .sort((a, b) => a.t - b.t)
      .forEach(m => {
        const a = TX(m.t),
          w = scWidth(x, 10, m.label),
          under = a + 5 < end,
          skip = under && a + 5 < endU; // no room above nor under: the time is in the table
        scLine(
          x,
          [
            [a - 4, y - 7],
            [a + 4, y - 7],
            [a, y - 1],
          ],
          { close: true, fill: m.late ? RED : '#222222', w: 0 }
        );
        if (skip) return;
        scText(x, a + 5, under ? y + bh + 10 : y - 1, 10, m.label, {
          c: m.late ? RED : undefined,
          w: m.mine ? 700 : 400,
        });
        if (under) endU = a + 5 + w + 4;
        else end = a + 5 + w + 4;
      });
  });
  if (D.rows.length > rows.length)
    scText(x, 12, y0 + rows.length * rh, 10, '+' + (D.rows.length - rows.length) + ' more SAMs', { c: '#777777' });
  const ly = y0 + rows.length * rh + 2;
  [
    ['#dddddd', 'in ring', 70],
    ['#222222', 'HARM cover', 170],
    [RED, 'open', 290],
  ].forEach(([c, t, a]) => {
    scLine(
      x,
      [
        [+a, ly],
        [+a + 12, ly],
        [+a + 12, ly + 8],
        [+a, ly + 8],
      ],
      { close: true, fill: String(c), w: 0 }
    );
    scText(x, +a + 16, ly + 8, 10, String(t), { c: '#666666' });
  });
  return ly + 10;
}

/** @param {CanvasRenderingContext2D} x */
export function drawSmartSead(x, D) {
  scFrame(x, D.title, D.right);
  scKey(x, D.key);
  const ly = seadTimeline(x, D, 146) - 10;
  // ---- the plan
  const py = ly + 18,
    nT = Math.min(8, D.table.length), // up to eight launches: the plan gives them its room
    tTop = Math.min(602, 690 - 42 - Math.max(4, nT) * 13);
  scSec(x, py, 'PLAN');
  const box = [12, py + 22, 436, tTop - 6 - (py + 22)],
    P = D.plan,
    all = [
      ...P.sams.flatMap(s => [
        { x: s.x - s.r, y: s.y - s.r },
        { x: s.x + s.r, y: s.y + s.r },
      ]),
      ...P.shots,
    ], // the rings and the launches: the routes go on beyond
    V = view(all.length ? all : [...P.me, { x: 0, y: 0 }], box, 0.15),
    L = labeller(x),
    lb = [box[0] + 2, box[1] + 2, box[0] + box[2] - 2, box[1] + box[3] - 2];
  clip(x, box);
  P.sams.forEach(s => {
    scRing(x, V.X(s.x), V.Y(s.y), s.r * V.sc, { c: RED, w: 1.2, dash: [5, 3] });
    scTri(x, V.X(s.x), V.Y(s.y), 6);
    L.block(V.X(s.x), V.Y(s.y), 8);
  });
  const route = (pts, o) => {
    const Q = pts.map(p => [V.X(p.x), V.Y(p.y)]);
    scLine(x, Q, o);
    if (Q.length > 1) {
      const a = Q[Q.length - 2],
        b = Q[Q.length - 1];
      scArrow(x, b[0], b[1], Math.atan2(b[1] - a[1], b[0] - a[0]), 7);
    }
  };
  P.prot.forEach(r => route(r, { c: '#888888', w: 2 }));
  route(P.me, { w: 3 });
  P.shots.forEach(z => {
    scLine(
      x,
      [
        [V.X(z.x), V.Y(z.y)],
        [V.X(z.sx), V.Y(z.sy)],
      ],
      { w: 1, dash: [2, 3] }
    );
    scDot(x, V.X(z.x), V.Y(z.y), 4.5, z.late ? RED : '#222222');
    L.block(V.X(z.x), V.Y(z.y), 6);
  });
  P.sams.forEach(s => L.put(V.X(s.x), V.Y(s.y), s.name, { s: 12, w: 700, c: RED, box: lb }));
  P.shots.forEach(z => L.put(V.X(z.x), V.Y(z.y), z.label, { s: 11, c: z.late ? RED : undefined, box: lb }));
  x.restore();
  frameBox(x, box);
  scale(x, box, V.sc);
  scText(x, 14, tTop - 4, 10, P.legend || '', { c: '#555555' });
  // ---- the launches
  scSec(x, tTop);
  scText(x, 12, tTop + 14, 11, 'SEAT  L TIME    SAM    BRG   RNG  IMPACT', { c: '#666666', w: 700 });
  // your launches in bold on a grey band
  D.table.slice(0, nT).forEach(([t, red, mine], i) => {
    const y = tTop + 30 + i * 13;
    if (mine)
      scLine(
        x,
        [
          [8, y - 10],
          [452, y - 10],
          [452, y + 3],
          [8, y + 3],
        ],
        { close: true, fill: '#e2e2e2', w: 0 }
      );
    scText(x, 12, y, 12, t + (mine ? '  \u25C0 YOU' : ''), { c: red ? RED : undefined, w: mine ? 700 : 400 });
  });
  if (D.table.length > nT)
    scText(x, 448, tTop + 14, 10, '+' + (D.table.length - nT) + ' more', { c: '#777777', al: 'right' });
  scText(x, 12, 686, 10, D.last || '', { c: '#555555' });
  scEnd(x);
}

/** the plan around the SAM of a DEAD card in a box */
export function deadPlanView(x, D, bx) {
  const box = bx,
    S = D.sam,
    all = [
      ...D.lines.flatMap(l => l.pts),
      ...D.points,
      { x: S.x, y: S.y },
      ...D.rings
        .filter(r => r[2] != 'det')
        .flatMap(([r]) => [
          { x: S.x - r, y: S.y - r },
          { x: S.x + r, y: S.y + r },
        ]),
    ],
    V = view(all, box, 0.06),
    L = labeller(x),
    lb = [box[0] + 2, box[1] + 2, box[0] + box[2] - 2, box[1] + box[3] - 2];
  clip(x, box);
  D.rings.forEach(([r, , k]) =>
    scRing(
      x,
      V.X(S.x),
      V.Y(S.y),
      r * V.sc,
      k == 'wez'
        ? { c: RED, w: 1.5, dash: [6, 4] }
        : k == 'ecm'
          ? { c: RED, w: 0.8 }
          : { c: '#999999', w: 1, dash: [2, 4] }
    )
  );
  D.lines.forEach(l => {
    const Q = l.pts.map(p => [V.X(p.x), V.Y(p.y)]);
    scLine(x, Q, { w: l.w || 2, dash: l.dash || [], c: l.c || '#222222' });
    if (l.arrow && Q.length > 1) {
      const a = Q[Q.length - 2],
        b = Q[Q.length - 1];
      scArrow(x, b[0], b[1], Math.atan2(b[1] - a[1], b[0] - a[0]), 7);
    }
  });
  scTri(x, V.X(S.x), V.Y(S.y), 7);
  L.block(V.X(S.x), V.Y(S.y), 9);
  D.points.forEach(p => {
    const a = V.X(p.x),
      b = V.Y(p.y);
    if (p.k == 'dia') scDiamond(x, a, b, 5);
    else if (p.k == 'imp') scRing(x, a, b, 4, { c: RED, w: 2 });
    else scDot(x, a, b, 4.5, '#222222');
    L.block(a, b, 7);
  });
  L.put(V.X(S.x), V.Y(S.y), S.name, { s: 12, w: 700, c: RED, box: lb, r: 10 });
  D.points.forEach(p => p.label && L.put(V.X(p.x), V.Y(p.y), p.label, { s: 11, box: lb }));
  D.rings.forEach(([r, lab, k]) => {
    if (!lab) return;
    const a = V.X(S.x) + r * V.sc * 0.71,
      b = V.Y(S.y) - r * V.sc * 0.71;
    L.put(a, b, lab, {
      s: 10,
      c: k == 'det' ? '#777777' : RED,
      box: lb,
      at: [
        [3, -3],
        [3, 12],
        [-3 - 40, -3],
      ],
    });
  });
  x.restore();
  frameBox(x, box);
  scale(x, box, V.sc);
}

/** @param {CanvasRenderingContext2D} x */
export function drawSmartDead(x, D) {
  scFrame(x, D.title, D.right);
  scKey(x, D.key);
  scSec(x, 146, 'PLAN');
  deadPlanView(x, D, [12, 168, 436, 330]);
  scText(x, 14, 512, 10, D.legend || '', { c: '#555555' });
  // ---- the events
  scSec(x, 518, 'EVENTS');
  D.events.slice(0, 5).forEach(([t, s], i) => scText(x, 12, 548 + i * 13, 12, hhmm(t) + '  ' + s));
  // ---- the roles
  const F = D.foot || [];
  scSec(x, 618);
  F.slice(0, 3).forEach((col, c) =>
    col
      .slice(0, 3)
      .forEach((s, i) =>
        scText(x, 12 + c * 150, 634 + i * 15, i ? 12 : 11, String(s), i ? {} : { c: '#666666', w: 700 })
      )
  );
  if (D.last) scText(x, 12, 684, 11, D.last, { c: D.lastRed ? RED : undefined });
  scEnd(x);
}

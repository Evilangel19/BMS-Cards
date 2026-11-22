// @ts-check
// The Smart BVR card of the FAOR page (core/smartcard.js look): the key numbers, the plan of the FAOR (the FEZ on the threat axis, the CAP points, the
// COMMIT and STOP lines, the HARDWALL, the bullseye), then the FEZ, the lines, the ID and BUGOUT of the ROE and the calls in short blocks.
// D: {title, right, key, plan: FP, blocks: [[head, [lines]]], foot, last, lastRed}
// FP (km of the theater, x east, y north): {box [4 pts], cap [pts], commit [2 pts], stop [2 pts], hw {a, b, name} | null, bull {x, y} | null, be (text when
// the bullseye is off the plan), brg (threat axis, deg true), axis (its text as the pilot reads it: magnetic), front {x, y} (the middle of the threat edge), stn (NM: the station ring), legend}
import {
  scFrame,
  scKey,
  scSec,
  scEnd,
  scText,
  scLine,
  scDot,
  scArrow,
  scRing,
  scFoot,
  labeller,
  wrap,
} from './smartcard.js';

const RED = '#cc0000',
  KM_NM = 1.852;

// a view of km points in a box (north up, one scale)
function view(pts, box, pad = 0.1) {
  const [bx, by, bw, bh] = box,
    xs = pts.map(p => p.x),
    ys = pts.map(p => p.y);
  let x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  const m = Math.max(x1 - x0, y1 - y0, 10) * pad;
  x0 -= m;
  x1 += m;
  y0 -= m;
  y1 += m;
  const sc = Math.min(bw / (x1 - x0), bh / (y1 - y0)),
    cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  return { X: x => bx + bw / 2 + (x - cx) * sc, Y: y => by + bh / 2 - (y - cy) * sc, sc };
}

/** the plan of the FAOR in a box [x, y, w, h] (units of the card) */
export function faorPlanView(x, P, box) {
  const near = P.bull && P.box.some(p => Math.hypot(p.x - P.bull.x, p.y - P.bull.y) < 90 * KM_NM),
    pts = [...P.box, ...P.cap, ...P.commit, ...P.stop, ...(P.hw ? [P.hw.a, P.hw.b] : []), ...(near ? [P.bull] : [])],
    V = view(pts, box),
    Q = p => [V.X(p.x), V.Y(p.y)],
    L = labeller(x),
    lb = [box[0] + 2, box[1] + 2, box[0] + box[2] - 2, box[1] + box[3] - 2];
  // the scale (10 NM) at the bottom right, kept free of labels
  const s10 = 10 * KM_NM * V.sc,
    sx = box[0] + box[2] - 12 - s10,
    sy = box[1] + box[3] - 18;
  L.rect(sx - 4, sy - 6, sx + s10 + 4, sy + 16);
  x.save();
  x.beginPath();
  x.rect(box[0], box[1], box[2], box[3]);
  x.clip();
  // the station: a ring of P.stn NM around each CAP point
  P.cap.forEach(p => scRing(x, V.X(p.x), V.Y(p.y), P.stn * KM_NM * V.sc, { c: '#999999', w: 1, dash: [2, 4] }));
  // the FEZ
  scLine(x, P.box.map(Q), { close: true, w: 2, fill: 'rgba(0,0,0,0.05)' });
  scLine(x, P.commit.map(Q), { w: 1.5, dash: [7, 4] });
  scLine(x, P.stop.map(Q), { w: 2, c: RED });
  if (P.hw) scLine(x, [Q(P.hw.a), Q(P.hw.b)], { w: 3, c: RED });
  // the CAP points and the racetrack between them
  const C = P.cap.map(Q);
  if (C.length > 1) scLine(x, C, { w: 5, c: '#bbbbbb', cap: 'round' });
  C.forEach(([a, b]) => {
    scDot(x, a, b, 4.5, '#222222');
    L.block(a, b, 7);
  });
  // the threat axis: an arrow out of the threat edge
  const r = (P.brg * Math.PI) / 180,
    f = Q(P.front),
    len = 34,
    t = [f[0] + Math.sin(r) * len, f[1] - Math.cos(r) * len];
  scLine(x, [f, t], { w: 1.5, c: RED });
  scArrow(x, t[0], t[1], Math.atan2(t[1] - f[1], t[0] - f[0]), 8);
  L.block(t[0], t[1], 6);
  // the bullseye
  if (near) {
    const [a, b] = Q(P.bull);
    scRing(x, a, b, 6, { w: 1.5 });
    scLine(
      x,
      [
        [a - 9, b],
        [a + 9, b],
      ],
      { w: 1 }
    );
    scLine(
      x,
      [
        [a, b - 9],
        [a, b + 9],
      ],
      { w: 1 }
    );
    L.block(a, b, 9);
    L.put(a, b, 'BE', { s: 11, w: 700, box: lb, r: 10 });
  }
  // the labels
  const lab = (p, t, o = {}) => L.put(p[0], p[1], t, { s: 11, box: lb, ...o });
  C.forEach((c, i) => lab(c, 'CAP' + (C.length > 1 ? i + 1 : ''), { w: 700 }));
  lab(t, 'THREAT ' + (P.axis || String(Math.round(P.brg) % 360).padStart(3, '0')) + '°', { c: RED, w: 700 });
  lab(Q(P.commit[1]), 'COMMIT');
  lab(Q(P.stop[0]), 'STOP', { c: RED, w: 700 });
  if (P.hw)
    lab([(V.X(P.hw.a.x) + V.X(P.hw.b.x)) / 2, (V.Y(P.hw.a.y) + V.Y(P.hw.b.y)) / 2], 'HARDWALL ' + P.hw.name, {
      c: RED,
    });
  x.restore();
  if (!near && P.be) scText(x, box[0] + 4, box[1] + box[3] - 6, 11, P.be, { c: '#444444' });
  scLine(
    x,
    [
      [sx, sy],
      [sx + s10, sy],
    ],
    { w: 2 }
  );
  scText(x, sx + s10 / 2, sy + 13, 10, '10 NM', { al: 'center', c: '#444444' });
}

/** blocks of text in two columns from y to yMax */
function blocks(x, B, y0, yMax) {
  const col = [12, 236],
    W = 212;
  let c = 0,
    y = y0;
  for (const [head, rows] of B) {
    const need = 18 + rows.length * 14;
    if (y + need > yMax && c == 0) {
      c = 1;
      y = y0;
    }
    if (y > yMax) break;
    scText(x, col[c], y, 12, head, { w: 700 });
    y += 16;
    for (const r of rows) {
      const [t, red] = Array.isArray(r) ? r : [r, false];
      for (const [k, l] of wrap(x, t, 11, W).entries()) {
        if (y > yMax) break;
        scText(x, col[c] + (k ? 8 : 0), y, 11, k ? l.trim() : l, { c: red ? RED : undefined });
        y += 14;
      }
    }
    y += 8;
  }
}

/** @param {CanvasRenderingContext2D} x */
export function drawSmartFaor(x, D) {
  scFrame(x, D.title, D.right);
  scKey(x, D.key);
  scSec(x, 146, 'FAOR');
  faorPlanView(x, D.plan, [12, 160, 436, 262]);
  if (D.plan.legend) scText(x, 14, 436, 10, D.plan.legend, { c: '#555555' });
  scSec(x, 442);
  blocks(x, D.blocks, 460, 594);
  scFoot(x, 602, D.foot, D.last, D.lastRed);
  scEnd(x);
}

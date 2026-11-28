// @ts-check
// The Smart A-A cards (core/smartcard.js look) of A-A > DCA and A-A > OCA: the key numbers, a plan, then short blocks in two columns.
// D: {title, right, key, plan: P, blocks: [[head, [lines]]], foot, last, lastRed}
// P, a plan in km of the theater (x east, y north), drawn north up:
//   view [pts] (the points the view is fitted to; else every point of polys), polys [{pts, w, dash, red, grey, fill, close, round}],
//   rings [{c, r (km), w, dash, red, grey}], dots [{p, k: 'dot' | 'sq' | 'tri', label, bold}], arrow {from, to, label} (red), labels [{p, t, red, bold, s, at}],
//   bull {x, y} | null (drawn when near the view), be (its text when it is off the plan), legend
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
  scWidth,
} from './smartcard.js';

const RED = '#cc0000',
  GREY = '#999999',
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

/** a plan in a box [x, y, w, h] (units of the card) */
export function aaPlanView(x, P, box) {
  const polys = P.polys || [],
    base = P.view && P.view.length ? P.view : polys.flatMap(q => q.pts),
    near = P.bull && base.some(p => Math.hypot(p.x - P.bull.x, p.y - P.bull.y) < 90 * KM_NM),
    pts = [...base, ...(near ? [P.bull] : [])],
    // P.note: short lines at the top left of the plan (AAR: the offsets and the headings). When the drawing comes under them, the drawing goes to
    // the right of them.
    note = P.note || [],
    nw = note.length ? Math.max(...note.map(t => scWidth(x, 10, t, 700))) + 8 : 0,
    nh = note.length * 12 + 4,
    under = V0 => pts.some(p => V0.X(p.x) < box[0] + nw && V0.Y(p.y) < box[1] + nh),
    V1 = view(pts, box),
    V = note.length && under(V1) ? view(pts, [box[0] + nw, box[1], box[2] - nw, box[3]]) : V1,
    Q = p => [V.X(p.x), V.Y(p.y)],
    L = labeller(x),
    lb = [box[0] + 2, box[1] + 2, box[0] + box[2] - 2, box[1] + box[3] - 2];
  if (note.length) L.rect(box[0], box[1], box[0] + nw, box[1] + nh);
  // the scale (10 NM) at the bottom right, kept free of labels
  const s10 = 10 * KM_NM * V.sc,
    sx = box[0] + box[2] - 12 - s10,
    sy = box[1] + box[3] - 18;
  L.rect(sx - 4, sy - 6, sx + s10 + 4, sy + 16);
  x.save();
  x.beginPath();
  x.rect(box[0], box[1], box[2], box[3]);
  x.clip();
  const col = o => (o.red ? RED : o.grey ? GREY : undefined);
  (P.rings || []).forEach(r =>
    scRing(x, V.X(r.c.x), V.Y(r.c.y), r.r * V.sc, { c: col(r), w: r.w || 1, dash: r.dash || [] })
  );
  polys.forEach(q =>
    scLine(x, q.pts.map(Q), {
      w: q.w || 1.5,
      dash: q.dash || [],
      c: col(q) || (q.round ? '#bbbbbb' : undefined),
      close: !!q.close,
      fill: q.fill,
      cap: q.round ? 'round' : undefined,
    })
  );
  let tip = null;
  if (P.arrow) {
    const f = Q(P.arrow.from),
      t = Q(P.arrow.to);
    scLine(x, [f, t], { w: 1.5, c: RED });
    scArrow(x, t[0], t[1], Math.atan2(t[1] - f[1], t[0] - f[0]), 8);
    L.block(t[0], t[1], 6);
    tip = t;
  }
  (P.dots || []).forEach(d => {
    const [a, b] = Q(d.p);
    if (d.k == 'sq')
      scLine(
        x,
        [
          [a - 5, b - 5],
          [a + 5, b - 5],
          [a + 5, b + 5],
          [a - 5, b + 5],
        ],
        { close: true, fill: '#666666', w: 0 }
      );
    else if (d.k == 'tri')
      scLine(
        x,
        [
          [a, b - 7],
          [a + 6, b + 5],
          [a - 6, b + 5],
        ],
        { close: true, fill: '#222222', w: 0 }
      );
    else scDot(x, a, b, 4.5, '#222222');
    L.block(a, b, 7);
  });
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
  const lab = (p, t, o = {}) => L.put(p[0], p[1], t, { s: 11, box: lb, ...o });
  (P.dots || []).forEach(d => d.label && lab(Q(d.p), d.label, { w: d.bold ? 700 : 400 }));
  if (tip && P.arrow.label) lab(tip, P.arrow.label, { c: RED, w: 700 });
  (P.labels || []).forEach(l =>
    lab(Q(l.p), l.t, { c: l.red ? RED : undefined, w: l.bold ? 700 : 400, s: l.s || 11, at: l.at })
  );
  x.restore();
  note.forEach((t, i) => scText(x, box[0] + 2, box[1] + 11 + i * 12, 10, t, { w: 700, c: '#333333' }));
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

/** blocks of text in two columns from y to yMax (the Smart AAR card too: core/smartaar.js) */
export function blocks(x, B, y0, yMax) {
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
export function drawSmartAA(x, D) {
  scFrame(x, D.title, D.right);
  scKey(x, D.key);
  scSec(x, 146, D.planLabel || 'PLAN');
  aaPlanView(x, D.plan, [12, 160, 436, 262]);
  if (D.plan.legend) scText(x, 14, 436, 10, D.plan.legend, { c: '#555555' });
  scSec(x, 442);
  blocks(x, D.blocks, 460, 594);
  scFoot(x, 602, D.foot, D.last, D.lastRed);
  scEnd(x);
}

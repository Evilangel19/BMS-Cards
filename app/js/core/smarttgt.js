// @ts-check
// The Smart Target card (core/smartcard.js look): the key box (the target, its elevation, the DMPIs, the attack heading, the position, the status), a
// sketch of the target area north up (the buildings of the objective at their size, the DMPIs numbered in red, the way in and out of the attack, the
// attack heading), the list of the DMPIs and of the components, the remarks.
// D: {title, right, key, cx, cy (km), feats [{x, y, kind, st, name}], dmpis [{x, y, n, short}], ing [[[x, y]...]], egr, hdg, comps [text], notes [text]}
import { scFrame, scKey, scSec, scEnd, scText, scLine, scTri, scArrow, labeller, wrap } from './smartcard.js';
import { KSIZE } from './tgtdraw.js';

/** @param {CanvasRenderingContext2D} x */
export function drawSmartTarget(x, D) {
  scFrame(x, D.title, D.right);
  scKey(x, D.key);
  // ---- the target area: the box around the buildings and the DMPIs, at least 600 m
  scSec(x, 146, 'TARGET AREA');
  const BX = 12,
    BY = 168,
    BW = 436,
    BH = 300,
    pts = [...D.feats, ...D.dmpis, { x: D.cx, y: D.cy }],
    xs = pts.map(p => p.x),
    ys = pts.map(p => p.y),
    span = Math.max(
      0.6,
      (Math.max(...xs) - Math.min(...xs)) * 1.3,
      ((Math.max(...ys) - Math.min(...ys)) * 1.3 * BW) / BH
    ),
    cx = (Math.max(...xs) + Math.min(...xs)) / 2,
    cy = (Math.max(...ys) + Math.min(...ys)) / 2,
    sc = BW / span, // units per km
    PX = gx => BX + BW / 2 + (gx - cx) * sc,
    PY = gy => BY + BH / 2 - (gy - cy) * sc,
    L = labeller(x),
    box = [BX + 2, BY + 2, BX + BW - 2, BY + BH - 2];
  x.save();
  x.beginPath();
  x.rect(BX, BY, BW, BH);
  x.clip();
  x.fillStyle = '#f4f4f4';
  x.fillRect(BX, BY, BW, BH);
  // the way of the attack in and out (thin), the attack heading as an arrow to the first DMPI
  (D.ing || []).forEach(l =>
    scLine(
      x,
      l.map(p => [PX(p[0]), PY(p[1])]),
      { c: '#555555', w: 1.5 }
    )
  );
  (D.egr || []).forEach(l =>
    scLine(
      x,
      l.map(p => [PX(p[0]), PY(p[1])]),
      { c: '#555555', w: 1.5, dash: [6, 4] }
    )
  );
  // the buildings at their size (metres), a destroyed one dark
  D.feats.forEach(f => {
    const [w, h] = KSIZE[f.kind] || KSIZE.adm,
      a = PX(f.x),
      b = PY(f.y),
      pw = Math.max(4, (w / 1000) * sc),
      ph = Math.max(3, (h / 1000) * sc);
    scLine(
      x,
      [
        [a - pw / 2, b - ph / 2],
        [a + pw / 2, b - ph / 2],
        [a + pw / 2, b + ph / 2],
        [a - pw / 2, b + ph / 2],
      ],
      { close: true, fill: f.st == 2 ? '#555555' : '#ffffff', w: 1.2 }
    );
    L.block(a, b, Math.max(pw, ph) / 2);
  });
  D.dmpis.forEach(d => {
    scTri(x, PX(d.x), PY(d.y), 8);
    L.block(PX(d.x), PY(d.y), 9);
  });
  if (D.hdg != null && D.dmpis.length) {
    const d = D.dmpis[0],
      A = (D.hdgTrue * Math.PI) / 180,
      a = PX(d.x) - Math.sin(A) * 22,
      b = PY(d.y) + Math.cos(A) * 22,
      a0 = a - Math.sin(A) * 70,
      b0 = b + Math.cos(A) * 70;
    scLine(
      x,
      [
        [a0, b0],
        [a, b],
      ],
      { w: 2.5 }
    );
    scArrow(x, a, b, Math.atan2(b - b0, a - a0), 9);
    L.put((a + a0) / 2, (b + b0) / 2, 'ATK ' + D.hdg, { s: 12, w: 700, box, r: 10 });
  }
  D.dmpis.forEach(
    d =>
      L.put(PX(d.x), PY(d.y), String(d.n), { s: 15, w: 700, c: '#cc0000', box, r: 10 }) ||
      L.put(PX(d.x), PY(d.y), String(d.n), { s: 15, w: 700, c: '#cc0000', r: 10, force: true })
  );
  x.restore();
  scLine(
    x,
    [
      [BX, BY],
      [BX + BW, BY],
      [BX + BW, BY + BH],
      [BX, BY + BH],
    ],
    { close: true, c: '#999999', w: 0.5 }
  );
  // the scale (100 / 250 / 500 m) and the north
  const m = span > 2.5 ? 500 : span > 1 ? 250 : 100,
    w = (m / 1000) * sc;
  scLine(
    x,
    [
      [BX + BW - 12 - w, BY + 16],
      [BX + BW - 12, BY + 16],
    ],
    { w: 2 }
  );
  scText(x, BX + BW - 12 - w / 2, BY + 30, 10, m + ' m', { al: 'center', halo: '#f4f4f4' });
  scText(x, BX + 8, BY + 18, 12, 'N ↑', { w: 700, halo: '#f4f4f4' });
  // ---- the DMPIs and the components
  scSec(x, 476, 'DMPI / COMPONENTS');
  let y = 508;
  for (const r of D.comps) {
    if (y > 596) break;
    const [t, red] = Array.isArray(r) ? r : [r, false];
    scText(x, 12, y, 13, t, { c: red ? '#cc0000' : undefined });
    y += 16;
  }
  // ---- the remarks
  scSec(x, 602, 'REMARKS');
  y = 634;
  const notes = (D.notes || []).flatMap(t => wrap(x, t, 13, 432));
  for (const l of notes) {
    if (y > 684) break;
    scText(x, 12, y, 13, l);
    y += 16;
  }
  if (!notes.length) scText(x, 12, y, 12, 'none', { c: '#888888' });
  scEnd(x);
}
